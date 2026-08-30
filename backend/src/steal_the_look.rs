use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::fal::{ensure_fal_reachable, FalClient};
use crate::imageproc;
use crate::jobs::{new_session_id, JobStore};
use crate::models::ColorInfo;
use crate::steal_the_look_prompts as prompts;
use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const EDIT_MODEL: &str = "fal-ai/bytedance/seedream/v5/lite/edit";
const VISION_MODEL: &str = "fal-ai/any-llm/vision";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StlProgress {
    pub phase: String,
    pub result: Option<String>,
    pub hero_image_url: Option<String>,
    pub items: Option<Vec<Value>>,
    pub tone: Option<String>,
    pub message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    pub image_base64: String,
    pub mime_type: String,
}

pub fn get_outfit_tone(names: &[String]) -> String {
    const WARM: [&str; 17] = ["red", "orange", "yellow", "brown", "tan", "rust", "beige", "cream", "khaki", "gold", "pink", "coral", "maroon", "burgundy", "rose", "mustard", "sand"];
    const COOL: [&str; 12] = ["blue", "navy", "indigo", "teal", "cyan", "purple", "violet", "green", "mint", "turquoise", "sky", "sage"];
    let mut w = 0;
    let mut c = 0;
    for name in names {
        let n = name.trim().to_lowercase();
        if WARM.contains(&n.as_str()) { w += 1; }
        else if COOL.contains(&n.as_str()) { c += 1; }
    }
    if w == c { "neutral".to_string() } else if w > c { "warm".to_string() } else { "cool".to_string() }
}

// --- detection ---

#[derive(Deserialize)]
pub struct DetectResult {
    pub items: Vec<DetectedItem>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct DetectedItem {
    pub category: String,
    pub title: String,
    pub fit: Option<String>,
    pub length: Option<String>,
    pub colors: Vec<ColorInfo>,
    #[serde(default)]
    pub bbox: Vec<f64>,
}

pub async fn detect_items(fal: &FalClient, image_url: &str) -> Result<DetectResult, String> {
    let out = fal
        .run(VISION_MODEL, json!({
            "model": "google/gemini-2.5-flash",
            "prompt": prompts::DETECT_PROMPT,
            "image_url": image_url,
        }))
        .await?;
    let text = out
        .get("output")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("vision output missing: {out}"))?
        .trim();
    let text = text.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let parsed: Value = serde_json::from_str(text).map_err(|e| format!("vision json parse: {e}"))?;
    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        return Ok(DetectResult { items: vec![], error: Some(err.to_string()) });
    }
    let arr = parsed.as_array().ok_or_else(|| format!("vision not an array: {parsed}"))?;
    let mut items = Vec::new();
    for it in arr {
        let category = it.get("category").and_then(|v| v.as_str()).unwrap_or("");
        if !matches!(category, "headwear" | "shirt" | "jacket" | "pants" | "footwear") {
            continue;
        }
        let title = it.get("title").and_then(|v| v.as_str()).unwrap_or("Wardrobe item").to_string();
        let fit = it.get("fit").and_then(|v| v.as_str()).map(|s| s.to_string());
        let length = it.get("length").and_then(|v| v.as_str()).map(|s| s.to_string());
        let colors: Vec<ColorInfo> = it
            .get("colors")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| serde_json::from_value::<ColorInfo>(c.clone()).ok())
                    .collect()
            })
            .unwrap_or_default();
        let bbox: Vec<f64> = it
            .get("bbox")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|n| n.as_f64()).collect())
            .unwrap_or_default();
        if bbox.len() != 4 || bbox[2] <= 0.0 || bbox[3] <= 0.0 {
            continue;
        }
        items.push(DetectedItem { category: category.to_string(), title, fit, length, colors, bbox });
    }
    if items.is_empty() {
        return Ok(DetectResult { items: vec![], error: Some("unknown".to_string()) });
    }
    Ok(DetectResult { items, error: None })
}

// --- handlers ---

pub fn steal_the_look_store() -> Arc<JobStore<StlProgress>> {
    static STORE: OnceLock<Arc<JobStore<StlProgress>>> = OnceLock::new();
    STORE.get_or_init(|| Arc::new(JobStore::new(SESSION_TTL))).clone()
}

async fn default_avatar(pool: &sqlx::PgPool, user_id: &str) -> Result<Option<String>, ApiError> {
    Ok(sqlx::query_scalar::<_, Option<String>>(
        "SELECT default_avatar_url FROM user_biometrics WHERE user_id=$1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .flatten())
}

pub async fn start(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<StartBody>,
) -> ApiResult<Json<Value>> {
    let avatar = default_avatar(&state.pool, &auth.id).await?;
    let avatar = match avatar {
        Some(a) => a,
        None => return Err(ApiError::precondition_failed("User has no defaultAvatarUrl. Run the seed.")),
    };
    let buf = base64_decode(&body.image_base64)?;
    if !matches!(body.mime_type.as_str(), "image/jpeg" | "image/png" | "image/webp") {
        return Err(ApiError::validation("mimeType must be image/jpeg, image/png, or image/webp"));
    }
    let fal = state.fal.clone();
    let pool = state.pool.clone();
    let store = steal_the_look_store();
    let session_id = new_session_id();
    store.gc();
    store.insert(session_id.clone(), StlProgress { phase: "detect".into(), result: None, hero_image_url: None, items: None, tone: None, message: None });
    let store2 = store.clone();
    let avatar2 = avatar.clone();
    let session = session_id.clone();
    tokio::spawn(async move {
        if let Err(e) = run_pipeline(fal, store2, &session, buf, body.mime_type, avatar2, pool).await {
            tracing::error!(error = %e, session = %session, "steal-the-look pipeline failed");
            store.update(&session, |p| {
                p.phase = "error".into();
                p.message = Some(e);
            });
        }
    });
    Ok(Json(json!({ "sessionId": session_id })))
}

async fn run_pipeline(
    fal: FalClient,
    store: Arc<JobStore<StlProgress>>,
    session: &str,
    buf: Vec<u8>,
    mime: String,
    avatar: String,
    pool: sqlx::PgPool,
) -> Result<(), String> {
    // upload inspiration
    let inspiration = fal.upload(&buf, "inspiration", &mime).await?;
    store.update(session, |p| p.phase = "detect".into());
    let detect = detect_items(&fal, &inspiration).await?;
    if let Some(err) = detect.error {
        let tone = get_outfit_tone(&[]);
        let result = if err == "multiple_people" { "multiple_people" } else { "unknown" };
        store.update(session, |p| {
            p.phase = "done".into();
            p.result = Some(result.into());
            p.hero_image_url = Some(avatar.clone());
            p.items = Some(vec![]);
            p.tone = Some(tone);
        });
        return Ok(());
    }
    store.update(session, |p| p.phase = "extract".into());
    let mut items_out = Vec::new();
    let mut color_names = Vec::new();
    for (idx, item) in detect.items.iter().enumerate() {
        // bbox crop → refine
        let refined_url = refine_item(&fal, &inspiration, item, idx).await?;
        for c in &item.colors {
            color_names.push(c.name.clone());
        }
        items_out.push(json!({
            "id": format!("{idx}-{}", item.category),
            "imageUrl": refined_url,
            "brand": Value::Null,
            "title": item.title,
            "category": item.category,
            "fit": item.fit,
            "length": item.length,
            "colors": item.colors,
        }));
    }
    store.update(session, |p| p.phase = "refine".into());
    let hero = try_on(&fal, &avatar, &inspiration).await?;
    let tone = get_outfit_tone(&color_names);
    store.update(session, |p| {
        p.phase = "done".into();
        p.result = Some("no_error".into());
        p.hero_image_url = Some(hero);
        p.items = Some(items_out);
        p.tone = Some(tone);
    });
    let _ = pool;
    Ok(())
}

/// Cache of uploaded template URLs (fal storage) keyed by refine mode, so the
/// hanger/headwear assets are only uploaded once per server lifetime.
fn template_url_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn upload_template(fal: &FalClient, mode: &str) -> Result<String, String> {
    {
        let cache = template_url_cache().lock().expect("template cache lock");
        if let Some(url) = cache.get(mode) {
            return Ok(url.clone());
        }
    }
    let bytes = prompts::template_bytes(mode)?;
    let url = fal.upload(&bytes, &format!("{mode}.png"), "image/png").await?;
    let mut cache = template_url_cache().lock().expect("template cache lock");
    cache.insert(mode.to_string(), url.clone());
    Ok(url)
}

fn rembg_image_url(out: &Value) -> Result<String, String> {
    out.get("image")
        .and_then(|i| i.get("url"))
        .and_then(|u| u.as_str())
        .or_else(|| {
            out.get("images")
                .and_then(|a| a.as_array())
                .and_then(|a| a.first())
                .and_then(|i| i.get("url"))
                .and_then(|u| u.as_str())
        })
        .map(|s| s.to_string())
        .ok_or_else(|| format!("background-remove missing url: {out}"))
}

async fn refine_item(fal: &FalClient, inspiration: &str, item: &DetectedItem, _idx: usize) -> Result<String, String> {
    // bbox crop by downloading source, cropping, then hanger-template compose
    let (img_w, img_h) = imageproc::fetch_dimensions(fal, inspiration).await?;
    let pad = match item.category.as_str() {
        "headwear" => 0.2,
        "footwear" => 0.1,
        _ => 0.05,
    };
    let (bx, by, bw, bh) = normalize_bbox(&item.bbox, img_w, img_h);
    let pad_x = (bw as f64 * pad).round() as u32;
    let pad_y = (bh as f64 * pad).round() as u32;
    let x = bx.saturating_sub(pad_x);
    let y = by.saturating_sub(pad_y);
    let w = (bw + 2 * pad_x).min(img_w - x);
    let h = (bh + 2 * pad_y).min(img_h - y);
    let crop = imageproc::crop_png(fal, inspiration, x, y, w, h).await?;
    let mode = prompts::category_to_mode(&item.category);
    let label = prompts::category_label(&item.category);
    let prompt = if mode == "flat" {
        prompts::build_flat_prompt(label)
    } else {
        prompts::build_hanger_prompt(mode, label)
    };
    let template = match prompts::template_url(mode) {
        Ok(_) => Some(upload_template(fal, mode).await?),
        Err(_) => None,
    };
    let mut image_urls = vec![crop];
    if let Some(t) = template {
        image_urls.push(t);
    }
    let staged = fal
        .run(EDIT_MODEL, json!({
            "prompt": prompt,
            "image_urls": image_urls,
            "num_images": 1,
            "image_size": { "width": 832, "height": 1248 },
            "output_format": "png",
        }))
        .await?;
    let staged_url = staged.get("images").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|i| i.get("url")).and_then(|u| u.as_str())
        .or_else(|| staged.get("image").and_then(|i| i.get("url")).and_then(|u| u.as_str()))
        .ok_or_else(|| format!("staged result missing url: {staged}"))?
        .to_string();
    let staged_bytes = fal.fetch_bytes(&staged_url).await?;
    imageproc::dev_dump(&format!("refine-staged-{}.png", item.category), &staged_bytes);
    let rembg = fal.run("fal-ai/bria/background/remove", json!({ "image_url": staged_url })).await?;
    let rembg_url = rembg_image_url(&rembg)?;
    let rembg_bytes = fal.fetch_bytes(&rembg_url).await?;
    let decon = imageproc::decontaminate(&rembg_bytes, &staged_bytes)?;
    let placed = imageproc::place_on_uniform_canvas(&decon, &item.category)?;
    imageproc::dev_dump(&format!("refine-final-{}.png", item.category), &placed);
    fal.upload(&placed, &format!("refined-{}.png", item.category), "image/png").await
}

fn normalize_bbox(b: &[f64], w: u32, h: u32) -> (u32, u32, u32, u32) {
    let x = (b[0].clamp(0.0, 1.0) * w as f64).round() as u32;
    let y = (b[1].clamp(0.0, 1.0) * h as f64).round() as u32;
    let bw = ((b[2].clamp(0.0, 1.0) * w as f64).round() as u32).min(w - x);
    let bh = ((b[3].clamp(0.0, 1.0) * h as f64).round() as u32).min(h - y);
    (x, y, bw, bh)
}

async fn try_on(fal: &FalClient, avatar: &str, inspiration: &str) -> Result<String, String> {
    let avatar = ensure_fal_reachable(fal, avatar).await?;
    let out = fal.run(EDIT_MODEL, json!({
        "prompt": prompts::TRYON_PROMPT,
        "image_urls": [avatar, inspiration],
        "num_images": 1,
        "image_size": { "width": 832, "height": 1248 },
        "output_format": "png",
    })).await?;
    let staged = out.get("images").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|i| i.get("url")).and_then(|u| u.as_str())
        .or_else(|| out.get("image").and_then(|i| i.get("url")).and_then(|u| u.as_str()))
        .ok_or_else(|| format!("tryon missing url: {out}"))?
        .to_string();
    let staged_bytes = fal.fetch_bytes(&staged).await?;
    imageproc::dev_dump("tryon-staged.png", &staged_bytes);
    let rembg = fal.run("fal-ai/bria/background/remove", json!({ "image_url": staged })).await?;
    let rembg_url = rembg_image_url(&rembg)?;
    let rembg_bytes = fal.fetch_bytes(&rembg_url).await?;
    let decon = imageproc::decontaminate(&rembg_bytes, &staged_bytes)?;
    imageproc::dev_dump("tryon-final.png", &decon);
    fal.upload(&decon, "tryon-final.png", "image/png").await
}

pub async fn progress(
    State(_state): State<AppState>,
    _auth: AuthUser,
    Path(session_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let p = steal_the_look_store().get(&session_id).unwrap_or(StlProgress {
        phase: "error".into(),
        result: None,
        hero_image_url: None,
        items: None,
        tone: None,
        message: Some("Session not found (server may have restarted)".into()),
    });
    Ok(Json(json!(p)))
}

fn base64_decode(s: &str) -> Result<Vec<u8>, ApiError> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|_| ApiError::validation("imageBase64 is not valid base64"))
}