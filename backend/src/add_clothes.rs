use crate::analyze_prompts::{self, AnalyzedItem};
use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::fal::FalClient;
use crate::imageproc;
use crate::jobs::{new_session_id, JobStore};
use crate::steal_the_look;
use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const VISION_MODEL: &str = "fal-ai/any-llm/vision";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub result: Option<String>,
    pub items: Option<Vec<Value>>,
    pub message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    pub image_base64: String,
    pub mime_type: String,
}

pub struct AnalyzeOutcome {
    pub kind: String,
    pub original_image_url: String,
    pub processed_image_url: String,
    pub item: Option<AnalyzedItem>,
}

pub fn add_clothes_store() -> Arc<JobStore<Progress>> {
    static STORE: OnceLock<Arc<JobStore<Progress>>> = OnceLock::new();
    STORE
        .get_or_init(|| Arc::new(JobStore::new(SESSION_TTL)))
        .clone()
}

pub async fn start(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<StartBody>,
) -> ApiResult<Json<Value>> {
    if !matches!(
        body.mime_type.as_str(),
        "image/jpeg" | "image/png" | "image/webp"
    ) {
        return Err(ApiError::validation(
            "mimeType must be image/jpeg, image/png, or image/webp",
        ));
    }
    let buf = base64_decode(&body.image_base64)?;
    let fal = state.fal.clone();
    let store = add_clothes_store();
    let session_id = new_session_id();
    store.gc();
    store.insert(
        session_id.clone(),
        Progress {
            phase: "analyze".into(),
            result: None,
            items: None,
            message: None,
        },
    );
    let store2 = store.clone();
    let session = session_id.clone();
    tokio::spawn(async move {
        if let Err(e) = run_pipeline(fal, store2, &session, buf, body.mime_type).await {
            tracing::error!(error = %e, session = %session, "add-clothes pipeline failed");
            store.update(&session, |p| {
                p.phase = "error".into();
                p.message = Some("Could not process this photo. Please try again.".into());
            });
        }
    });
    Ok(Json(json!({ "sessionId": session_id })))
}

async fn run_pipeline(
    fal: FalClient,
    store: Arc<JobStore<Progress>>,
    session: &str,
    buf: Vec<u8>,
    mime: String,
) -> Result<(), String> {
    store.update(session, |p| p.phase = "analyze".into());
    let outcome = analyze_single_clothing(&fal, &buf, &mime).await?;
    match outcome.kind.as_str() {
        "unsupported" => {
            store.update(session, |p| {
                p.phase = "done".into();
                p.result = Some("unsupported".into());
                p.items = Some(vec![]);
            });
        }
        _ => {
            let item = outcome
                .item
                .ok_or_else(|| "analyze outcome missing item".to_string())?;
            let original_image_url = outcome.original_image_url;
            let processed_image_url = outcome.processed_image_url;
            store.update(session, |p| {
                p.phase = "done".into();
                p.result = Some("ok".into());
                p.items = Some(vec![json!({
                    "title": item.title,
                    "category": item.category,
                    "fit": item.fit,
                    "length": item.length,
                    "colors": item.colors,
                    "originalImageUrl": original_image_url,
                    "processedImageUrl": processed_image_url,
                })]);
            });
        }
    }
    Ok(())
}

pub async fn analyze_single_clothing(
    fal: &FalClient,
    buf: &[u8],
    mime: &str,
) -> Result<AnalyzeOutcome, String> {
    let original = fal.upload(buf, "add-clothes", mime).await?;
    let out = fal
        .run(
            VISION_MODEL,
            json!({
                "model": "google/gemini-2.5-flash",
                "prompt": analyze_prompts::ANALYZE_PROMPT,
                "image_url": original,
            }),
        )
        .await?;
    let text = out
        .get("output")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("analysis output missing: {out}"))?
        .to_string();
    let parsed = analyze_prompts::parse_analysis(&text);
    match parsed.kind.as_str() {
        "unsupported" => Ok(AnalyzeOutcome {
            kind: "unsupported".into(),
            original_image_url: original.clone(),
            processed_image_url: original,
            item: None,
        }),
        _ => {
            let mut item = parsed
                .item
                .ok_or_else(|| "analysis parsed without item".to_string())?;
            let processed = refine_item(fal, buf, mime, &item.category).await?;
            let processed_png = fal.fetch_bytes(&processed).await?;
            item.colors = imageproc::extract_colors(&processed_png)?;
            Ok(AnalyzeOutcome {
                kind: "ok".into(),
                original_image_url: original,
                processed_image_url: processed,
                item: Some(item),
            })
        }
    }
}

async fn refine_item(
    fal: &FalClient,
    buf: &[u8],
    mime: &str,
    category: &str,
) -> Result<String, String> {
    let item_url = fal.upload(buf, "item", mime).await?;
    steal_the_look::compose_refine(fal, &item_url, category).await
}

pub async fn progress(
    State(_state): State<AppState>,
    _auth: AuthUser,
    Path(session_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let p = add_clothes_store().get(&session_id).unwrap_or(Progress {
        phase: "error".into(),
        result: None,
        items: None,
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
