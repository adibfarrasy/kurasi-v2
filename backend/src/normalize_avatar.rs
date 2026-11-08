use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::fal::FalClient;
use crate::imageproc;
use crate::jobs::{new_session_id, JobStore};
use crate::normalize_prompts as prompts;
use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const EDIT_MODEL: &str = "fal-ai/bytedance/seedream/v5/lite/edit";
const VISION_MODEL: &str = "fal-ai/any-llm/vision";
const VISION_BASE_MODEL: &str = "google/gemini-flash-1.5";
const FACESWAP_MODEL: &str = "fal-ai/face-swap";
const REMBG_MODEL: &str = "fal-ai/bria/background/remove";

/// Client-visible message for any pipeline failure (raw error logged).
const CLIENT_ERROR_MESSAGE: &str = "Could not generate your avatar. Please try again.";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// GLB of the avatar; absent when 3D generation is off or failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    pub image_base64: String,
    pub mime_type: String,
    pub gender: String,
    pub height_cm: Option<i64>,
    pub weight_kg: Option<i64>,
}

/// Payload carried into the spawned pipeline task.
struct NormalizeInput {
    buf: Vec<u8>,
    mime: String,
    gender: String,
    height_cm: Option<i64>,
    weight_kg: Option<i64>,
}

pub fn normalize_avatar_store() -> Arc<JobStore<Progress>> {
    static STORE: OnceLock<Arc<JobStore<Progress>>> = OnceLock::new();
    STORE
        .get_or_init(|| Arc::new(JobStore::new(SESSION_TTL)))
        .clone()
}

/// default_man.png embedded at compile time so the binary is self-contained
/// and CWD-independent.
const DEFAULT_MAN_BYTES: &[u8] = include_bytes!("../avatar/assets/default_man.png");

/// Cache of the uploaded default_man.png URL so the pose asset is only
/// uploaded to fal storage once per server lifetime.
fn pose_url_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

async fn pose_url(fal: &FalClient) -> Result<String, String> {
    {
        let cache = pose_url_cache().lock().expect("pose cache lock");
        if let Some(url) = cache.as_ref() {
            return Ok(url.clone());
        }
    }
    let url = fal
        .upload(DEFAULT_MAN_BYTES, "default_man.png", "image/png")
        .await?;
    let mut cache = pose_url_cache().lock().expect("pose cache lock");
    *cache = Some(url.clone());
    Ok(url)
}

fn url_from_result(out: &Value) -> Result<String, String> {
    out.get("images")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|i| i.get("url"))
        .and_then(|u| u.as_str())
        .or_else(|| {
            out.get("image")
                .and_then(|i| i.get("url"))
                .and_then(|u| u.as_str())
        })
        .map(|s| s.to_string())
        .ok_or_else(|| format!("result missing url: {out}"))
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

/// Port of `classifyBuild()`: gemini vision classifies the body photo on the
/// lean–heavy spectrum; returns the build directive + observation notes.
async fn classify_build(
    fal: &FalClient,
    body_url: &str,
    height_cm: Option<i64>,
    weight_kg: Option<i64>,
) -> Result<(String, String), String> {
    let dims = prompts::dims_context(height_cm, weight_kg);
    let out = fal
        .run(
            VISION_MODEL,
            json!({
                "model": VISION_BASE_MODEL,
                "prompt": prompts::classify_prompt(&dims),
                "image_url": body_url,
            }),
        )
        .await?;
    let text = out
        .get("output")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("vision output missing: {out}"))?
        .to_string();
    Ok((prompts::parse_build(&text), prompts::parse_notes(&text)))
}

/// End-to-end avatar normalization: classify → pass1 (pose+body+skin) → pass2
/// (identity refinement) → faceswap → rembg → finalize. `on_phase` is invoked
/// as the pipeline moves through classify/pass1/pass2/faceswap/rembg/finalize.
/// Returns the fal URL of the final transparent PNG.
///
/// `gender` is accepted for interface parity but unused: the pose asset is
/// always default_man.png regardless of gender.
pub async fn normalize_avatar(
    fal: &FalClient,
    body_image: Vec<u8>,
    body_mime: &str,
    gender: &str,
    height_cm: Option<i64>,
    weight_kg: Option<i64>,
    on_phase: impl Fn(&str),
) -> Result<String, String> {
    let _ = gender;

    // Body photo is always uploaded as "body.jpg" regardless of the real mime;
    // the pose asset is uploaded once and cached.
    let body_url = fal.upload(&body_image, "body.jpg", body_mime).await?;
    let pose = pose_url(fal).await?;

    // ─── classify ──────────────────────────────────────────────────────────
    on_phase("classify");
    let (build, notes) = classify_build(fal, &body_url, height_cm, weight_kg).await?;
    tracing::info!(%build, %notes, "avatar: classified build");

    // ─── Pass 1: identity (from user) + pose (from reference) + outfit ─────
    on_phase("pass1");
    let pass1 = fal
        .run(
            EDIT_MODEL,
            json!({
                "prompt": prompts::pass1_prompt(
                    &prompts::build_directive(&build),
                    &prompts::build_notes_clause(&notes),
                    &prompts::pass1_dims_clause(height_cm, weight_kg),
                ),
                "image_urls": [body_url.clone(), pose],
                "num_images": 1,
                "image_size": { "width": 832, "height": 1248 },
            }),
        )
        .await?;
    let pass1_url = url_from_result(&pass1).map_err(|e| format!("pass1 {e}"))?;
    tracing::info!(url = %pass1_url, "avatar: pass1");

    // ─── Pass 2: identity transfer onto the normalized body ────────────────
    on_phase("pass2");
    let pass2 = fal
        .run(
            EDIT_MODEL,
            json!({
                "prompt": prompts::PASS2_PROMPT,
                "image_urls": [pass1_url, body_url.clone()],
                "num_images": 1,
                "image_size": { "width": 832, "height": 1248 },
            }),
        )
        .await?;
    let pass2_url = url_from_result(&pass2).map_err(|e| format!("pass2 {e}"))?;
    tracing::info!(url = %pass2_url, "avatar: pass2");

    // ─── Face-swap: composite the user's actual face onto the body ─────────
    on_phase("faceswap");
    let swap = fal
        .run(
            FACESWAP_MODEL,
            json!({
                "base_image_url": pass2_url,
                "swap_image_url": body_url,
            }),
        )
        .await?;
    let base_url = url_from_result(&swap).map_err(|e| format!("faceswap {e}"))?;
    tracing::info!(url = %base_url, "avatar: faceswap");

    // ─── Background removal + edge decontamination ─────────────────────────
    on_phase("rembg");
    let rembg = fal
        .run(REMBG_MODEL, json!({ "image_url": base_url }))
        .await?;
    let rembg_url = rembg_image_url(&rembg)?;

    on_phase("finalize");
    let base_bytes = fal.fetch_bytes(&base_url).await?;
    let rembg_bytes = fal.fetch_bytes(&rembg_url).await?;
    let decontaminated = imageproc::decontaminate(&rembg_bytes, &base_bytes)?;
    imageproc::dev_dump("avatar-final.png", &decontaminated);
    fal.upload(&decontaminated, "avatar.png", "image/png").await
}

/// Best-effort persistence of the generated avatar URL. DB errors are logged
/// and swallowed — this never fails the pipeline.
pub async fn persist_default_avatar(
    pool: &sqlx::PgPool,
    user_id: &str,
    avatar_url: &str,
    model_url: Option<&str>,
) {
    if let Err(e) = sqlx::query(
        "UPDATE user_biometrics SET default_avatar_url=$1, default_avatar_model_url=$2, updated_at=now() WHERE user_id=$3",
    )
    .bind(avatar_url)
    .bind(model_url)
    .bind(user_id)
    .execute(pool)
    .await
    {
        tracing::error!(error = %e, user = %user_id, "failed to persist default_avatar_url");
    }
}

pub async fn start(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<StartBody>,
) -> ApiResult<Json<Value>> {
    if !matches!(body.gender.as_str(), "masc" | "femme") {
        return Err(ApiError::validation("gender must be masc or femme"));
    }
    if let Some(h) = body.height_cm {
        if !(130..=220).contains(&h) {
            return Err(ApiError::validation("heightCm must be between 130 and 220"));
        }
    }
    if let Some(w) = body.weight_kg {
        if !(30..=200).contains(&w) {
            return Err(ApiError::validation("weightKg must be between 30 and 200"));
        }
    }
    if !matches!(
        body.mime_type.as_str(),
        "image/jpeg" | "image/png" | "image/webp"
    ) {
        return Err(ApiError::validation(
            "mimeType must be image/jpeg, image/png, or image/webp",
        ));
    }
    if body.image_base64.len() > 20 * 1024 * 1024 {
        return Err(ApiError::validation("imageBase64 is too large"));
    }
    let buf = base64_decode(&body.image_base64)?;

    let fal = state.fal.clone();
    let tripo = state.tripo.clone();
    let pool = state.pool.clone();
    let store = normalize_avatar_store();
    let session_id = new_session_id();
    store.gc();
    store.insert(
        session_id.clone(),
        Progress {
            phase: "classify".into(),
            avatar_url: None,
            model_url: None,
            message: None,
        },
    );
    let store2 = store.clone();
    let session = session_id.clone();
    let user_id = auth.id;
    let input = NormalizeInput {
        buf,
        mime: body.mime_type,
        gender: body.gender,
        height_cm: body.height_cm,
        weight_kg: body.weight_kg,
    };
    tokio::spawn(async move {
        if let Err(e) = run_pipeline(fal, tripo, store2, &session, input, user_id, pool).await {
            tracing::error!(error = %e, session = %session, "normalize-avatar pipeline failed");
            store.update(&session, |p| {
                p.phase = "error".into();
                p.message = Some(CLIENT_ERROR_MESSAGE.into());
            });
        }
    });
    Ok(Json(json!({ "sessionId": session_id })))
}

async fn run_pipeline(
    fal: FalClient,
    tripo: Option<crate::tripo::TripoClient>,
    store: Arc<JobStore<Progress>>,
    session: &str,
    input: NormalizeInput,
    user_id: String,
    pool: sqlx::PgPool,
) -> Result<(), String> {
    let avatar_url = normalize_avatar(
        &fal,
        input.buf,
        &input.mime,
        &input.gender,
        input.height_cm,
        input.weight_kg,
        |phase| {
            store.update(session, |p| p.phase = phase.to_string());
        },
    )
    .await?;
    store.update(session, |p| p.phase = "model3d".into());
    let model_url =
        crate::tripo::figure_to_model(tripo.as_ref(), &fal, &avatar_url, "avatar.glb").await;
    store.update(session, |p| {
        p.phase = "done".into();
        p.avatar_url = Some(avatar_url.clone());
        p.model_url = model_url.clone();
    });
    persist_default_avatar(&pool, &user_id, &avatar_url, model_url.as_deref()).await;
    Ok(())
}

pub async fn progress(
    State(_state): State<AppState>,
    _auth: AuthUser,
    Path(session_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let p = normalize_avatar_store()
        .get(&session_id)
        .unwrap_or(Progress {
            phase: "error".into(),
            avatar_url: None,
            model_url: None,
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
