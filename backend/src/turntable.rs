use crate::fal::FalClient;
use image::{imageops, Rgba, RgbaImage};
use serde_json::json;
use std::time::Duration;

const ORBIT_MODEL: &str = "minimax/h3-max/camera-controls";
const MATTE_MODEL: &str = "fal-ai/ben/v2/video";

/// The app keys this exact colour out, so the turntable can sit on any of its
/// tone gradients; video players there cannot play alpha.
pub const KEY_RGB: [u8; 3] = [0, 255, 0];

/// Portrait canvas with headroom: on a tighter frame the orbit crops the head
/// on the back side.
const CANVAS_W: u32 = 1080;
const CANVAS_H: u32 = 1920;
const FIGURE_FILL: f64 = 0.94;
const GREY: Rgba<u8> = Rgba([229, 229, 229, 255]);

/// The background is matted out afterwards, so the prompt only has to keep
/// the figure frozen; H3 still invents rooms behind it on its own.
const PROMPT: &str = "A frozen moment: the person stands perfectly still, like a statue, in the same relaxed pose, while the camera orbits a full 360 degrees around them. They are standing inside an infinite, featureless, seamless light grey void: an endless cyclorama with no walls, no floor edge, no corners, no windows, no lights, no stands, no furniture, no objects of any kind. Every frame has the same flat light grey background. Soft even shadowless lighting. Photorealistic.";

/// Places the transparent figure on the flat grey canvas the orbit starts from.
pub fn orbit_frame(figure_png: &[u8]) -> Result<Vec<u8>, String> {
    let fig = image::load_from_memory(figure_png)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let h = (CANVAS_H as f64 * FIGURE_FILL).round() as u32;
    let w = ((fig.width() as f64 * h as f64 / fig.height() as f64).round() as u32).max(1);
    let fig = imageops::resize(&fig, w, h, imageops::FilterType::Triangle);
    let mut canvas = RgbaImage::from_pixel(CANVAS_W, CANVAS_H, GREY);
    imageops::overlay(
        &mut canvas,
        &fig,
        (CANVAS_W as i64 - w as i64) / 2,
        (CANVAS_H as i64 - h as i64) / 2,
    );
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image::DynamicImage::ImageRgba8(canvas).to_rgb8())
        .write_to(&mut out, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

/// Sets the spin speed with [ORBIT_DEG]: faster than about 45°/s and H3
/// swings in on the back side until the head leaves the frame.
const DURATION_S: f64 = 10.0;
/// The orbit overshoots one full turn so a clean loop can be cut from its
/// middle: H3 opens on the exact input image, then pulls the camera back and
/// eases into the spin, which throbs at every restart if left in the loop.
const ORBIT_DEG: i64 = 450;
/// Opening stretch skipped before the loop may start.
const SETTLE_S: f64 = 1.0;

/// Even keyframes every quarter turn: with only start and end, H3 finishes
/// the spin early and holds the last pose.
fn trajectory() -> serde_json::Value {
    let steps = ORBIT_DEG / 90;
    let keys: Vec<_> = (0..=steps)
        .map(|i| json!({ "time": i as f64 / steps as f64, "azimuth": i * 90, "elevation": 0, "distance": 1.25 }))
        .collect();
    json!(keys)
}

/// 360° orbit video of a finished figure on a solid key-colour background.
/// Errors are logged and swallowed: the still stays usable without it.
pub async fn figure_to_turntable(fal: &FalClient, figure_url: &str) -> Option<String> {
    let result = async {
        let still = fal.fetch_bytes(figure_url).await?;
        let frame = orbit_frame(&still)?;
        let frame_url = fal.upload(&frame, "orbit-start.jpg", "image/jpeg").await?;
        let orbit = fal
            .run_with_timeout(
                ORBIT_MODEL,
                json!({
                    "prompt": PROMPT,
                    "image_url": frame_url,
                    "prompt_expansion_mode": "disabled",
                    "duration": DURATION_S as u32,
                    "resolution": "768P",
                    "camera_trajectory": trajectory(),
                }),
                Duration::from_secs(600),
            )
            .await?;
        let orbit_url = video_url(&orbit)?;
        let matte = fal
            .run_with_timeout(
                MATTE_MODEL,
                json!({ "video_url": orbit_url, "background_color": KEY_RGB, "output_format": "mp4" }),
                Duration::from_secs(600),
            )
            .await?;
        let matted = fal.fetch_bytes(&video_url(&matte)?).await?;
        let steady = tokio::task::spawn_blocking(move || stabilize(&matted, &still))
            .await
            .map_err(|e| e.to_string())??;
        fal.upload(&steady, "turntable.mp4", "video/mp4").await
    }
    .await;
    match result {
        Ok(url) => Some(url),
        Err(e) => {
            tracing::error!(error = %e, "turntable generation failed; keeping the still");
            None
        }
    }
}

/// Output frame: the still's 2:3 canvas, with the figure spanning the same
/// rows it does in the still, so the app shows both in one box.
const OUT_W: usize = 768;
const OUT_H: usize = 1152;
const OUT_TOP: f64 = 0.033;
const OUT_BOTTOM: f64 = 0.986;
/// Frames either side averaged into each frame's measurement. Kept small: H3
/// pulls the camera back over the first few frames, and wider smoothing
/// blurs that away instead of correcting it.
const SMOOTH_RADIUS: usize = 1;
/// Bounds on the brightness match, so a bad measurement cannot blow out or
/// black out the figure.
const MAX_GAIN: f64 = 1.5;
/// Pixels of figure edge given back to the key: chroma subsampling leaves a
/// green-tinted ring that would otherwise survive the app's key.
const ERODE: usize = 2;
const OPEN: usize = 3;

fn is_key(p: &[u8]) -> bool {
    p[1] > 180 && p[0] < 110 && p[2] < 110
}

/// H3 drifts in and out and sideways as it orbits, and relights the figure
/// darker than the still. Re-frames every frame so the figure keeps one
/// height, its feet stay on one line, and it stays centred, and scales its
/// colour to match `still_png`, then re-encodes. Needs ffmpeg/ffprobe on PATH.
pub fn stabilize(mp4: &[u8], still_png: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::{Read, Write};
    use std::process::{Command, Stdio};

    let dir = std::env::temp_dir().join(format!("turntable-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let input = dir.join("in.mp4");
    let output = dir.join("out.mp4");
    let result = (|| {
        std::fs::write(&input, mp4).map_err(|e| e.to_string())?;
        let probe = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,r_frame_rate",
                "-of",
                "csv=p=0",
            ])
            .arg(&input)
            .output()
            .map_err(|e| format!("ffprobe: {e}"))?;
        let probe = String::from_utf8_lossy(&probe.stdout);
        let mut f = probe.trim().split(',');
        let (w, h, rate): (usize, usize, String) = match (f.next(), f.next(), f.next()) {
            (Some(w), Some(h), Some(r)) => (
                w.parse().map_err(|_| "bad width")?,
                h.parse().map_err(|_| "bad height")?,
                r.to_string(),
            ),
            _ => return Err(format!("ffprobe output: {probe}")),
        };
        let decode = || {
            Command::new("ffmpeg")
                .args(["-v", "error", "-i"])
                .arg(&input)
                .args(["-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
                .stdout(Stdio::piped())
                .spawn()
                .map_err(|e| format!("ffmpeg decode: {e}"))
        };
        let mut frame = vec![0u8; w * h * 3];

        // Pass 1: where the figure is in every frame, what it looks like at
        // thumbnail size (to find the loop), and its average colour.
        let (mut boxes, mut thumbs, mut means) = (Vec::new(), Vec::new(), Vec::new());
        let mut dec = decode()?;
        let mut out = dec.stdout.take().unwrap();
        while out.read_exact(&mut frame).is_ok() {
            let b = measure(&frame, w, h);
            thumbs.push(thumb(b, |x, y| {
                let i = (y.min(h - 1) * w + x.min(w - 1)) * 3;
                let p = &frame[i..i + 3];
                (!is_key(p)).then(|| [p[0], p[1], p[2]])
            }));
            means.push(figure_mean(frame.chunks_exact(3).filter(|p| !is_key(p))));
            boxes.push(b);
        }
        dec.wait().map_err(|e| e.to_string())?;
        let n = boxes.len();
        if n == 0 {
            return Err("turntable video has no frames".into());
        }
        // A figure touching the frame edge is cropped, and its box would blow
        // the remainder up to full height; borrow the box from the nearest
        // uncropped frames instead.
        let cropped = |b: &(f64, f64, f64)| b.0 <= 1.0 || b.1 >= (h - 2) as f64;
        let good: Vec<usize> = (0..n).filter(|&i| !cropped(&boxes[i])).collect();
        if good.is_empty() {
            return Err("turntable figure is cropped in every frame".into());
        }
        for i in 0..n {
            if !cropped(&boxes[i]) {
                continue;
            }
            let before = good.iter().rev().find(|&&g| g < i);
            let after = good.iter().find(|&&g| g > i);
            boxes[i] = match (before, after) {
                (Some(&a), Some(&b)) => {
                    let t = (i - a) as f64 / (b - a) as f64;
                    let (p, q) = (boxes[a], boxes[b]);
                    (
                        p.0 + (q.0 - p.0) * t,
                        p.1 + (q.1 - p.1) * t,
                        p.2 + (q.2 - p.2) * t,
                    )
                }
                (Some(&a), None) => boxes[a],
                (None, Some(&b)) => boxes[b],
                (None, None) => unreachable!(),
            };
        }
        // Clamped at the ends: the opening frames are still settling and must
        // not be averaged with the last ones.
        let smooth: Vec<(f64, f64, f64)> = (0..n)
            .map(|i| {
                let span = i.saturating_sub(SMOOTH_RADIUS)..=(i + SMOOTH_RADIUS).min(n - 1);
                let k = span.clone().count() as f64;
                let sum = span.fold((0.0, 0.0, 0.0), |acc, j| {
                    let b = boxes[j];
                    (acc.0 + b.0, acc.1 + b.1, acc.2 + b.2)
                });
                (sum.0 / k, sum.1 / k, sum.2 / k)
            })
            .collect();
        let still = image::load_from_memory(still_png)
            .map_err(|e| e.to_string())?
            .to_rgba8();
        let still_mean = figure_mean(still.pixels().filter(|p| p[3] > 128).map(|p| &p.0[..3]));
        let still_thumb = {
            let (sw, sh) = (still.width() as usize, still.height() as usize);
            let px =
                |x: usize, y: usize| still.get_pixel(x.min(sw - 1) as u32, y.min(sh - 1) as u32);
            let rows: Vec<usize> = (0..sh)
                .filter(|&y| (0..sw).any(|x| px(x, y)[3] > 128))
                .collect();
            let (mut sx, mut cnt) = (0.0, 0.0);
            for y in (0..sh).step_by(4) {
                for x in (0..sw).step_by(4) {
                    if px(x, y)[3] > 128 {
                        sx += x as f64;
                        cnt += 1.0;
                    }
                }
            }
            let b = (
                *rows.first().unwrap_or(&0) as f64,
                *rows.last().unwrap_or(&(sh - 1)) as f64,
                if cnt == 0.0 {
                    sw as f64 / 2.0
                } else {
                    sx / cnt
                },
            );
            thumb(b, |x, y| {
                let p = px(x, y);
                (p[3] > 128).then(|| [p[0], p[1], p[2]])
            })
        };
        let span = loop_span(&thumbs, &still_thumb, fps(&rate))?;
        let gain: [f64; 3] = std::array::from_fn(|c| {
            (still_mean[c] / means[span.front][c].max(1.0)).clamp(1.0 / MAX_GAIN, MAX_GAIN)
        });

        // Pass 2: re-frame and encode.
        let mut enc = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-s",
                &format!("{OUT_W}x{OUT_H}"),
                "-r",
                &rate,
                "-i",
                "-",
            ])
            .args([
                "-c:v",
                "libx264",
                // Main profile: the widest hardware-decoder support.
                "-profile:v",
                "main",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
            ])
            .arg(&output)
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("ffmpeg encode: {e}"))?;
        let mut sink = enc.stdin.take().unwrap();
        // The loop is a full turn, so it can start anywhere: start it on the
        // frame that matches the still, so the hand-off from still to video
        // does not jump.
        for range in [span.front..span.end, span.start..span.front] {
            let mut dec = decode()?;
            let mut out = dec.stdout.take().unwrap();
            let mut i = 0;
            while i < range.end && out.read_exact(&mut frame).is_ok() {
                if i >= range.start {
                    let reframed = reframe(&frame, w, h, smooth[i], gain);
                    sink.write_all(&reframed).map_err(|e| e.to_string())?;
                }
                i += 1;
            }
            drop(out);
            let _ = dec.kill();
            let _ = dec.wait();
        }
        drop(sink);
        if !enc.wait().map_err(|e| e.to_string())?.success() {
            return Err("ffmpeg encode failed".into());
        }
        std::fs::read(&output).map_err(|e| e.to_string())
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// (top, bottom, centre x) of the figure. Rows and columns need a few figure
/// pixels to count, so matte specks do not stretch the box.
fn measure(frame: &[u8], w: usize, h: usize) -> (f64, f64, f64) {
    const MIN: usize = 4;
    let mut rows = vec![0usize; h];
    let (mut sx, mut cnt) = (0usize, 0usize);
    for y in 0..h {
        for x in 0..w {
            if !is_key(&frame[(y * w + x) * 3..]) {
                rows[y] += 1;
                sx += x;
                cnt += 1;
            }
        }
    }
    let top = rows.iter().position(|&c| c >= MIN).unwrap_or(0);
    let bottom = rows.iter().rposition(|&c| c >= MIN).unwrap_or(h - 1);
    let cx = if cnt == 0 {
        w as f64 / 2.0
    } else {
        sx as f64 / cnt as f64
    };
    (top as f64, bottom as f64, cx)
}

const THUMB_W: usize = 16;
const THUMB_H: usize = 32;
type Thumb = Vec<[f32; 3]>;

/// The figure resampled onto a small grid anchored to its own box, so frames
/// at the same angle compare alike whatever H3's zoom was.
fn thumb(
    (top, bottom, cx): (f64, f64, f64),
    pixel: impl Fn(usize, usize) -> Option<[u8; 3]>,
) -> Thumb {
    let height = (bottom - top).max(1.0);
    let half_w = height * 0.35;
    let mut out = Vec::with_capacity(THUMB_W * THUMB_H);
    for gy in 0..THUMB_H {
        for gx in 0..THUMB_W {
            let y = top + (gy as f64 + 0.5) / THUMB_H as f64 * height;
            let x = cx + ((gx as f64 + 0.5) / THUMB_W as f64 - 0.5) * 2.0 * half_w;
            let p = if x < 0.0 || y < 0.0 {
                None
            } else {
                pixel(x as usize, y as usize)
            };
            out.push(p.map_or([0.0, 255.0, 0.0], |p| p.map(f32::from)));
        }
    }
    out
}

fn thumb_dist(a: &Thumb, b: &Thumb) -> f32 {
    a.iter()
        .zip(b)
        .map(|(p, q)| (0..3).map(|c| (p[c] - q[c]).abs()).sum::<f32>())
        .sum()
}

#[derive(Debug)]
struct LoopSpan {
    /// First frame of the turn.
    start: usize,
    /// One past the last frame: `end` shows the same angle as `start`.
    end: usize,
    /// Frame inside the turn closest to the still.
    front: usize,
}

/// Cuts one full turn from after the settle: the end is whichever frame near
/// the expected turn length looks most like the start.
fn loop_span(thumbs: &[Thumb], still: &Thumb, fps: f64) -> Result<LoopSpan, String> {
    let n = thumbs.len();
    let start = (SETTLE_S * fps).round() as usize;
    let turn = (n as f64 * 360.0 / ORBIT_DEG as f64).round() as usize;
    let slack = (fps / 2.0).round() as usize;
    let (lo, hi) = (
        start + turn - slack.min(turn),
        (start + turn + slack).min(n - 1),
    );
    if start >= n || lo > hi {
        return Err(format!("turntable video too short to loop: {n} frames"));
    }
    let closest = |target: &Thumb, range: std::ops::Range<usize>| {
        range.min_by(|&a, &b| {
            thumb_dist(target, &thumbs[a]).total_cmp(&thumb_dist(target, &thumbs[b]))
        })
    };
    let end = closest(&thumbs[start], lo..hi + 1).unwrap();
    let front = closest(still, start..end).unwrap();
    Ok(LoopSpan { start, end, front })
}

/// ffprobe's frame rate, e.g. "24/1".
fn fps(rate: &str) -> f64 {
    match rate.split_once('/') {
        Some((a, b)) => a.parse::<f64>().unwrap_or(24.0) / b.parse::<f64>().unwrap_or(1.0).max(1.0),
        None => rate.parse().unwrap_or(24.0),
    }
}

fn figure_mean<'a>(pixels: impl Iterator<Item = &'a [u8]>) -> [f64; 3] {
    let (mut sum, mut n) = ([0.0; 3], 0.0);
    for p in pixels {
        for c in 0..3 {
            sum[c] += p[c] as f64;
        }
        n += 1.0;
    }
    if n == 0.0 {
        return [128.0; 3];
    }
    sum.map(|v| v / n)
}

fn reframe(
    frame: &[u8],
    w: usize,
    h: usize,
    (top, bottom, cx): (f64, f64, f64),
    gain: [f64; 3],
) -> Vec<u8> {
    let target_h = (OUT_BOTTOM - OUT_TOP) * OUT_H as f64;
    let scale = target_h / (bottom - top).max(1.0);
    let out_bottom = OUT_BOTTOM * OUT_H as f64;
    let out_cx = OUT_W as f64 / 2.0;
    let mut figure = vec![false; OUT_W * OUT_H];
    let mut out = vec![0u8; OUT_W * OUT_H * 3];
    for y in 0..OUT_H {
        for x in 0..OUT_W {
            let sx = cx + (x as f64 - out_cx) / scale;
            let sy = bottom + (y as f64 - out_bottom) / scale;
            let o = (y * OUT_W + x) * 3;
            if sx < 0.0 || sy < 0.0 || sx >= (w - 1) as f64 || sy >= (h - 1) as f64 {
                out[o..o + 3].copy_from_slice(&KEY_RGB);
                continue;
            }
            let (x0, y0) = (sx as usize, sy as usize);
            let (fx, fy) = (sx - x0 as f64, sy - y0 as f64);
            for c in 0..3 {
                let p = |xx: usize, yy: usize| frame[(yy * w + xx) * 3 + c] as f64;
                let v = p(x0, y0) * (1.0 - fx) * (1.0 - fy)
                    + p(x0 + 1, y0) * fx * (1.0 - fy)
                    + p(x0, y0 + 1) * (1.0 - fx) * fy
                    + p(x0 + 1, y0 + 1) * fx * fy;
                out[o + c] = v.round() as u8;
            }
            let is_figure = !is_key(&out[o..o + 3]);
            figure[y * OUT_W + x] = is_figure;
            if is_figure {
                for c in 0..3 {
                    out[o + c] = (out[o + c] as f64 * gain[c]).round().min(255.0) as u8;
                }
            }
        }
    }
    // H3 hangs thin strays off the figure (drawstrings, threads) and the
    // matte leaves specks: an opening drops anything thinner than
    // 2 * OPEN pixels, and only the figure's own blob is kept.
    let figure = largest_blob(&dilate(&erode(&figure, OPEN), OPEN));
    let figure = erode(&figure, ERODE);
    for (i, keep) in figure.iter().enumerate() {
        if !keep {
            out[i * 3..i * 3 + 3].copy_from_slice(&KEY_RGB);
        }
    }
    out
}

/// Square-window min filter, done as two separable passes.
fn erode(mask: &[bool], r: usize) -> Vec<bool> {
    morph(mask, r, true)
}

fn dilate(mask: &[bool], r: usize) -> Vec<bool> {
    morph(mask, r, false)
}

fn morph(mask: &[bool], r: usize, min: bool) -> Vec<bool> {
    let pick = |mut it: Box<dyn Iterator<Item = bool> + '_>| {
        if min {
            it.all(|v| v)
        } else {
            it.any(|v| v)
        }
    };
    let mut rows = vec![false; mask.len()];
    for y in 0..OUT_H {
        for x in 0..OUT_W {
            let (lo, hi) = (x.saturating_sub(r), (x + r).min(OUT_W - 1));
            rows[y * OUT_W + x] = pick(Box::new((lo..=hi).map(|xx| mask[y * OUT_W + xx])));
        }
    }
    let mut out = vec![false; mask.len()];
    for y in 0..OUT_H {
        for x in 0..OUT_W {
            let (lo, hi) = (y.saturating_sub(r), (y + r).min(OUT_H - 1));
            out[y * OUT_W + x] = pick(Box::new((lo..=hi).map(|yy| rows[yy * OUT_W + x])));
        }
    }
    out
}

/// Keeps only the largest 4-connected region of the mask.
fn largest_blob(mask: &[bool]) -> Vec<bool> {
    let mut label = vec![0u32; mask.len()];
    let (mut best, mut best_size, mut next) = (0u32, 0usize, 0u32);
    let mut stack = Vec::new();
    for start in 0..mask.len() {
        if !mask[start] || label[start] != 0 {
            continue;
        }
        next += 1;
        label[start] = next;
        stack.push(start);
        let mut size = 0;
        while let Some(i) = stack.pop() {
            size += 1;
            let (x, y) = (i % OUT_W, i / OUT_W);
            let mut visit = |j: usize| {
                if mask[j] && label[j] == 0 {
                    label[j] = next;
                    stack.push(j);
                }
            };
            if x > 0 {
                visit(i - 1);
            }
            if x + 1 < OUT_W {
                visit(i + 1);
            }
            if y > 0 {
                visit(i - OUT_W);
            }
            if y + 1 < OUT_H {
                visit(i + OUT_W);
            }
        }
        if size > best_size {
            (best, best_size) = (next, size);
        }
    }
    label.iter().map(|&l| l != 0 && l == best).collect()
}

fn video_url(out: &serde_json::Value) -> Result<String, String> {
    out["video"]["url"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("result missing video url: {out}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orbit_frame_centres_figure_on_grey_canvas() {
        let fig = RgbaImage::from_pixel(832, 1248, Rgba([10, 20, 30, 255]));
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(fig)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let out = image::load_from_memory(&orbit_frame(&png.into_inner()).unwrap())
            .unwrap()
            .to_rgb8();
        assert_eq!(out.dimensions(), (CANVAS_W, CANVAS_H));
        let near =
            |p: &image::Rgb<u8>, c: [u8; 3]| p.0.iter().zip(c).all(|(a, b)| a.abs_diff(b) < 8);
        assert!(near(out.get_pixel(540, 960), [10, 20, 30]));
        assert!(near(out.get_pixel(540, 10), [229, 229, 229]));
    }

    /// Real-video check, skipped without a sample:
    /// `TURNTABLE_SAMPLE=in.mp4 TURNTABLE_STILL=still.png cargo test --release stabilizes_sample -- --ignored`
    #[test]
    #[ignore]
    fn stabilizes_sample() {
        let path = std::env::var("TURNTABLE_SAMPLE").unwrap();
        let still = std::fs::read(std::env::var("TURNTABLE_STILL").unwrap()).unwrap();
        let out = stabilize(&std::fs::read(&path).unwrap(), &still).unwrap();
        std::fs::write(format!("{path}.steady.mp4"), out).unwrap();
    }

    #[test]
    fn reframe_puts_figure_on_fixed_rows() {
        let (w, h) = (100, 200);
        let mut frame: Vec<u8> = (0..w * h).flat_map(|_| KEY_RGB).collect();
        for y in 50..150 {
            for x in 40..60 {
                frame[(y * w + x) * 3..(y * w + x) * 3 + 3].copy_from_slice(&[200, 150, 120]);
            }
        }
        let (top, bottom, cx) = measure(&frame, w, h);
        assert_eq!((top, bottom), (50.0, 149.0));
        assert!((cx - 49.5).abs() < 0.01);
        let out = reframe(&frame, w, h, (top, bottom, cx), [1.0; 3]);
        let at = |x: usize, y: usize| &out[(y * OUT_W + x) * 3..(y * OUT_W + x) * 3 + 3];
        let mid = OUT_H / 2;
        assert!(!is_key(at(OUT_W / 2, mid)));
        assert!(is_key(at(
            OUT_W / 2,
            (OUT_TOP * OUT_H as f64) as usize - 20
        )));
        assert!(is_key(at(10, mid)));
    }

    #[test]
    fn cleanup_drops_thin_strays_and_specks() {
        let mut mask = vec![false; OUT_W * OUT_H];
        let mut fill = |x0: usize, y0: usize, w: usize, h: usize| {
            for y in y0..y0 + h {
                for x in x0..x0 + w {
                    mask[y * OUT_W + x] = true;
                }
            }
        };
        fill(300, 100, 150, 900); // body
        fill(450, 500, 60, 2); // thread off the side
        fill(50, 50, 20, 20); // detached speck
        let clean = largest_blob(&dilate(&erode(&mask, OPEN), OPEN));
        assert!(clean[500 * OUT_W + 375]);
        assert!(!clean[501 * OUT_W + 480]);
        assert!(!clean[60 * OUT_W + 60]);
    }

    #[test]
    fn trajectory_turns_evenly_past_full_circle() {
        let t = trajectory();
        let keys = t.as_array().unwrap();
        let az: Vec<i64> = keys
            .iter()
            .map(|k| k["azimuth"].as_i64().unwrap())
            .collect();
        assert_eq!(az, vec![0, 90, 180, 270, 360, 450]);
        assert_eq!(keys[5]["time"].as_f64().unwrap(), 1.0);
        assert_eq!(fps("24/1"), 24.0);
    }

    #[test]
    fn loop_span_finds_the_repeat_and_the_front() {
        // A synthetic 450° clip at 24 fps: each frame's look is its angle.
        let n = 192;
        let angle = |i: usize| i as f32 * ORBIT_DEG as f32 / n as f32;
        let look = |deg: f32| -> Thumb {
            vec![[
                deg.to_radians().cos() * 100.0,
                deg.to_radians().sin() * 100.0,
                0.0,
            ]]
        };
        let thumbs: Vec<Thumb> = (0..n).map(|i| look(angle(i))).collect();
        let span = loop_span(&thumbs, &look(0.0), 24.0).unwrap();
        assert_eq!(span.start, 24);
        assert!((angle(span.end) - angle(span.start) - 360.0).abs() < 3.0);
        let off = angle(span.front) % 360.0;
        assert!(off.min(360.0 - off) < 3.0);
    }
}
