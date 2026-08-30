use crate::models::ColorInfo;
use image::{GenericImageView, Rgba, RgbaImage};
use std::io::Cursor;

const CANVAS_W: u32 = 832;
const CANVAS_H: u32 = 1024;
const PAD_X: u32 = 100;
const FOOTWEAR_FLOOR_Y: u32 = (1024.0 * 0.78) as u32;
const MERGE_THRESHOLD: f64 = 25.0;
const MIN_RATIO: f64 = 0.05;

pub fn image_size(bytes: &[u8]) -> Result<(u32, u32), String> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    Ok(img.dimensions())
}

pub async fn fetch_dimensions(
    fal: &crate::fal::FalClient,
    url: &str,
) -> Result<(u32, u32), String> {
    let bytes = fal.fetch_bytes(url).await?;
    image_size(&bytes)
}

pub async fn crop_png(
    fal: &crate::fal::FalClient,
    url: &str,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<String, String> {
    let bytes = fal.fetch_bytes(url).await?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (iw, ih) = img.dimensions();
    let x = x.min(iw - 1);
    let y = y.min(ih - 1);
    let w = w.min(iw - x).max(1);
    let h = h.min(ih - y).max(1);
    let cropped = image::imageops::crop_imm(&img, x, y, w, h).to_image();
    let png = encode(cropped)?;
    fal.upload(&png, "crop.png", "image/png").await
}

pub fn dev_dump(name: &str, bytes: &[u8]) {
    if crate::fal::is_dev_mode() {
        let dir = std::env::var("OUTPUT_DIR").unwrap_or_else(|_| "outputs".to_string());
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(std::path::Path::new(&dir).join(name), bytes);
    }
}

pub fn alpha_bbox(img: &RgbaImage) -> (u32, u32, u32, u32) {
    let (w, h) = img.dimensions();
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (w, h, 0u32, 0u32);
    for y in 0..h {
        for x in 0..w {
            if img.get_pixel(x, y).0[3] >= 8 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    if max_x < min_x {
        (0, 0, 0, 0)
    } else {
        (min_x, min_y, max_x - min_x + 1, max_y - min_y + 1)
    }
}

pub fn decontaminate(rembg: &[u8], raw: &[u8]) -> Result<Vec<u8>, String> {
    let rembg_img = image::load_from_memory(rembg)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let raw_img = image::load_from_memory(raw)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (w, h) = rembg_img.dimensions();
    let (rw, rh) = raw_img.dimensions();
    if rw != w || rh != h {
        return Err(format!("dimension mismatch rembg={w}x{h} raw={rw}x{rh}"));
    }
    let corners = [
        (4u32, 4u32),
        (w.saturating_sub(5), 4u32),
        (4u32, h.saturating_sub(5)),
        (w.saturating_sub(5), h.saturating_sub(5)),
    ];
    let mut sums = [0u32; 3];
    for (x, y) in corners {
        let p = raw_img.get_pixel(x.min(rw - 1), y.min(rh - 1)).0;
        for c in 0..3 {
            sums[c] += p[c] as u32;
        }
    }
    let bg = [sums[0] / 4, sums[1] / 4, sums[2] / 4];

    let mut out = RgbaImage::new(w, h);
    for (x, y, px) in out.enumerate_pixels_mut() {
        let p = rembg_img.get_pixel(x, y).0;
        let a = p[3] as f64 / 255.0;
        if a >= 0.999 || a <= 0.001 {
            *px = Rgba(p);
        } else {
            let mut fg = [0u8; 3];
            for c in 0..3 {
                let comp = p[c] as f64;
                let bgc = bg[c] as f64;
                let v = (comp - (1.0 - a) * bgc) / a;
                fg[c] = v.clamp(0.0, 255.0) as u8;
            }
            *px = Rgba([fg[0], fg[1], fg[2], p[3]]);
        }
    }
    let mut out_buf = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(out)
        .write_to(&mut out_buf, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out_buf.into_inner())
}

pub fn place_on_uniform_canvas(item: &[u8], category: &str) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(item)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (bx, by, bw, bh) = alpha_bbox(&img);
    if bw == 0 || bh == 0 {
        let mut blank = RgbaImage::new(CANVAS_W, CANVAS_H);
        for px in blank.pixels_mut() {
            *px = Rgba([0, 0, 0, 0]);
        }
        return encode(blank);
    }
    let is_footwear = category == "footwear";
    let pad_top: u32 = if is_footwear { 150 } else { 100 };
    let pad_bottom: u32 = if is_footwear {
        CANVAS_H - FOOTWEAR_FLOOR_Y
    } else {
        100
    };
    let target_w = CANVAS_W - 2 * PAD_X;
    let target_h = CANVAS_H - pad_top - pad_bottom;
    let scale = ((target_w as f64 / bw as f64).min(target_h as f64 / bh as f64)).min(1.0);
    let final_w = ((bw as f64 * scale).round() as u32).max(1);
    let final_h = ((bh as f64 * scale).round() as u32).max(1);

    let cropped = image::imageops::crop_imm(&img, bx, by, bw, bh).to_image();
    let resized = image::imageops::resize(
        &cropped,
        final_w,
        final_h,
        image::imageops::FilterType::Triangle,
    );

    let left = ((CANVAS_W - final_w) / 2) as i64;
    let top = if is_footwear {
        FOOTWEAR_FLOOR_Y as i64 - final_h as i64
    } else {
        ((CANVAS_H - final_h) / 2) as i64
    };

    let mut canvas = RgbaImage::new(CANVAS_W, CANVAS_H);
    for px in canvas.pixels_mut() {
        *px = Rgba([0, 0, 0, 0]);
    }
    image::imageops::overlay(&mut canvas, &resized, left, top);
    encode(canvas)
}

fn encode(img: RgbaImage) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buf.into_inner())
}

fn rgb_to_lab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let f = |c: f64| {
        let c = c / 255.0;
        if c > 0.04045 {
            ((c + 0.055) / 1.055).powf(2.4)
        } else {
            c / 12.92
        }
    };
    let (r, g, b) = (f(r), f(g), f(b));
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    let f2 = |t: f64| {
        if t > 0.008856 {
            t.cbrt()
        } else {
            7.787 * t + 16.0 / 116.0
        }
    };
    (
        116.0 * f2(y) - 16.0,
        500.0 * (f2(x) - f2(y)),
        200.0 * (f2(y) - f2(z)),
    )
}

fn lab_dist(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2) + (a.2 - b.2).powi(2)).sqrt()
}

const PALETTE: [(&str, [u8; 3]); 39] = [
    ("Black", [0, 0, 0]),
    ("Charcoal", [54, 69, 79]),
    ("Slate", [112, 128, 144]),
    ("Gray", [128, 128, 128]),
    ("Silver", [192, 192, 192]),
    ("White", [255, 255, 255]),
    ("Cream", [255, 253, 208]),
    ("Beige", [245, 245, 220]),
    ("Tan", [210, 180, 140]),
    ("Sand", [194, 178, 128]),
    ("Camel", [193, 154, 107]),
    ("Brown", [101, 55, 42]),
    ("Chocolate", [210, 105, 30]),
    ("Khaki", [240, 230, 140]),
    ("Olive", [128, 128, 0]),
    ("Forest", [34, 139, 34]),
    ("Sage", [143, 151, 121]),
    ("Mint", [189, 252, 201]),
    ("Teal", [0, 128, 128]),
    ("Navy", [0, 0, 128]),
    ("Blue", [0, 0, 255]),
    ("Sky", [135, 206, 235]),
    ("Indigo", [75, 0, 130]),
    ("Purple", [128, 0, 128]),
    ("Lavender", [230, 230, 250]),
    ("Lilac", [200, 162, 200]),
    ("Mauve", [224, 176, 255]),
    ("Pink", [255, 192, 203]),
    ("Rose", [255, 0, 127]),
    ("Red", [255, 0, 0]),
    ("Burgundy", [128, 0, 32]),
    ("Maroon", [128, 0, 0]),
    ("Coral", [255, 127, 80]),
    ("Orange", [255, 165, 0]),
    ("Rust", [183, 65, 14]),
    ("Mustard", [255, 219, 88]),
    ("Yellow", [255, 255, 0]),
    ("Gold", [255, 215, 0]),
    ("Green", [0, 128, 0]),
];

fn nearest_palette_name(r: u8, g: u8, b: u8) -> &'static str {
    let target = rgb_to_lab(r as f64, g as f64, b as f64);
    let mut best = PALETTE[0].0;
    let mut best_d = f64::MAX;
    for (name, rgb) in PALETTE {
        let d = lab_dist(
            target,
            rgb_to_lab(rgb[0] as f64, rgb[1] as f64, rgb[2] as f64),
        );
        if d < best_d {
            best_d = d;
            best = name;
        }
    }
    best
}

pub fn name_color(r: u8, g: u8, b: u8) -> &'static str {
    nearest_palette_name(r, g, b)
}

pub fn extract_colors(png: &[u8]) -> Result<Vec<ColorInfo>, String> {
    let img = image::load_from_memory(png)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (w, h) = img.dimensions();
    let stride = 4u32;
    let mut samples: Vec<(f64, f64, f64, f64)> = Vec::new(); // lab + count
    let mut y = 0;
    while y < h {
        let mut x = 0;
        while x < w {
            let p = img.get_pixel(x, y).0;
            if p[3] >= 200 {
                let lab = rgb_to_lab(p[0] as f64, p[1] as f64, p[2] as f64);
                samples.push((lab.0, lab.1, lab.2, 1.0));
            }
            x += stride;
        }
        y += stride;
    }
    if samples.is_empty() {
        return Ok(vec![]);
    }
    // k-means k=5, 25 iterations
    let k = 5usize.min(samples.len());
    let mut centers: Vec<(f64, f64, f64)> =
        samples.iter().take(k).map(|s| (s.0, s.1, s.2)).collect();
    for _ in 0..25 {
        let mut sums = vec![(0.0f64, 0.0f64, 0.0f64, 0.0f64); k];
        for s in &samples {
            let mut bi = 0;
            let mut bd = f64::MAX;
            for (i, c) in centers.iter().enumerate() {
                let d = lab_dist((s.0, s.1, s.2), *c);
                if d < bd {
                    bd = d;
                    bi = i;
                }
            }
            sums[bi].0 += s.0;
            sums[bi].1 += s.1;
            sums[bi].2 += s.2;
            sums[bi].3 += s.3;
        }
        for i in 0..k {
            if sums[i].3 > 0.0 {
                centers[i] = (
                    sums[i].0 / sums[i].3,
                    sums[i].1 / sums[i].3,
                    sums[i].2 / sums[i].3,
                );
            }
        }
    }
    // merge clusters within MERGE_THRESHOLD, weight-avg
    let mut clusters: Vec<(f64, f64, f64, f64)> = Vec::new(); // lab + total weight
    for c in centers.iter() {
        let weight: f64 = samples
            .iter()
            .filter(|x| lab_dist((x.0, x.1, x.2), *c) < 30.0)
            .count() as f64;
        clusters.push((c.0, c.1, c.2, weight));
    }
    let mut merged: Vec<(f64, f64, f64, f64)> = Vec::new();
    for c in clusters {
        if let Some(m) = merged
            .iter_mut()
            .find(|m| lab_dist((m.0, m.1, m.2), (c.0, c.1, c.2)) < MERGE_THRESHOLD)
        {
            let w = m.3 + c.3;
            m.0 = (m.0 * m.3 + c.0 * c.3) / w;
            m.1 = (m.1 * m.3 + c.1 * c.3) / w;
            m.2 = (m.2 * m.3 + c.2 * c.3) / w;
            m.3 = w;
        } else {
            merged.push(c);
        }
    }
    let total: f64 = merged.iter().map(|c| c.3).sum();
    let mut colors: Vec<ColorInfo> = merged
        .iter()
        .map(|c| {
            let ratio = if total > 0.0 { c.3 / total } else { 0.0 };
            let (l, a, b) = (c.0, c.1, c.2);
            // lab → rgb (approx via nearest palette on reconstructed rgb)
            let rgb = lab_to_rgb_approx(l, a, b);
            ColorInfo {
                name: nearest_palette_name(rgb.0, rgb.1, rgb.2).to_string(),
                hex: format!("#{:02x}{:02x}{:02x}", rgb.0, rgb.1, rgb.2),
                ratio,
            }
        })
        .filter(|c| c.ratio >= MIN_RATIO)
        .collect();
    colors.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap());
    colors.truncate(3);
    let sum: f64 = colors.iter().map(|c| c.ratio).sum();
    if sum > 0.0 && !colors.is_empty() {
        let drift = 1.0 - sum;
        colors[0].ratio += drift;
    }
    Ok(colors)
}

fn lab_to_rgb_approx(l: f64, a: f64, b: f64) -> (u8, u8, u8) {
    // iterate palette and pick the one nearest in Lab (avoids full inversion)
    let target = (l, a, b);
    let mut best = PALETTE[0].1;
    let mut best_d = f64::MAX;
    for (_, rgb) in PALETTE {
        let d = lab_dist(
            target,
            rgb_to_lab(rgb[0] as f64, rgb[1] as f64, rgb[2] as f64),
        );
        if d < best_d {
            best_d = d;
            best = rgb;
        }
    }
    (best[0], best[1], best[2])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32, f: impl Fn(u32, u32) -> image::Rgba<u8>) -> Vec<u8> {
        let mut img = image::RgbaImage::new(w, h);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = f(x, y);
        }
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut out, image::ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn alpha_bbox_finds_opaque_region() {
        // red block on transparent
        let img = png(100, 100, |x, y| {
            if (20..60).contains(&x) && (30..70).contains(&y) {
                image::Rgba([255, 0, 0, 255])
            } else {
                image::Rgba([0, 0, 0, 0])
            }
        });
        let decoded = image::load_from_memory(&img).unwrap().to_rgba8();
        let (x, y, w, h) = alpha_bbox(&decoded);
        assert_eq!((x, y, w, h), (20, 30, 40, 40));
    }

    #[test]
    fn place_on_canvas_centers_non_footwear() {
        let small = png(10, 20, |_, _| image::Rgba([255, 255, 255, 255]));
        let out = place_on_uniform_canvas(&small, "shirt").unwrap();
        let img = image::load_from_memory(&out).unwrap().to_rgba8();
        assert_eq!(img.dimensions(), (832, 1024));
        // opaque region exists somewhere in the middle band
        let mut found = false;
        for y in 100..900 {
            for x in 0..832 {
                if img.get_pixel(x, y).0[3] > 0 {
                    found = true;
                }
            }
        }
        assert!(found);
    }

    #[test]
    fn extract_colors_names_palette() {
        // solid red image → "Red"
        let red = png(8, 8, |_, _| image::Rgba([230, 10, 10, 255]));
        let colors = extract_colors(&red).unwrap();
        assert!(!colors.is_empty());
        assert_eq!(colors[0].name, "Red");
        assert!((colors[0].ratio - 1.0).abs() < 0.3);
    }

    #[test]
    fn decontaminate_premultiplies_fg() {
        // raw: blue bg, rembg: 50% alpha purple-ish over blue → fg should be reddish
        let raw = png(4, 4, |_, _| image::Rgba([0, 0, 255, 255]));
        // composite = 0.5*fg + 0.5*bg ; choose fg = red (255,0,0) → composite (127,0,127)
        let rembg = png(4, 4, |_, _| image::Rgba([127, 0, 127, 127]));
        let out = decontaminate(&rembg, &raw).unwrap();
        let img = image::load_from_memory(&out).unwrap().to_rgba8();
        let px = img.get_pixel(2, 2).0;
        // recovered fg ≈ red (255, 0, 0) within tolerance
        assert!(px[0] > 200, "r={}", px[0]);
        assert!(px[2] < 60, "b={}", px[2]);
    }
}
