use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::dress_prompts as prompts;
use crate::error::{ApiError, ApiResult};
use crate::fal::{ensure_fal_reachable, FalClient};
use crate::imageproc;
use crate::jobs::{new_session_id, JobStore};
use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const PASS_MODEL: &str = "fal-ai/bytedance/seedream/v5/lite/edit";
const REMBG_MODEL: &str = "fal-ai/bria/background/remove";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub result_url: Option<String>,
    /// 360° orbit video of the dressed figure on the key colour; absent when it failed.
    pub turntable_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turntable_frames_url: Option<String>,
    pub message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    pub items: Vec<ItemBody>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemBody {
    pub category: String,
    pub image_url: String,
    pub fit: Option<String>,
    pub length: Option<String>,
}

struct Garment {
    slot: &'static str,
    image_url: String,
    fit: Option<String>,
    length: Option<String>,
}

/// Maps app categories → slots and de-dupes (keep first per slot), skipping
/// categories that are not known clothing categories.
fn dedupe_items(items: Vec<ItemBody>) -> Vec<Garment> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for it in items {
        let Some(slot) = prompts::category_to_slot(&it.category) else {
            continue;
        };
        if !seen.insert(slot) {
            continue;
        }
        out.push(Garment {
            slot,
            image_url: it.image_url,
            fit: it.fit,
            length: it.length,
        });
    }
    out
}

pub fn regenerate_fit_store() -> Arc<JobStore<Progress>> {
    static STORE: OnceLock<Arc<JobStore<Progress>>> = OnceLock::new();
    STORE
        .get_or_init(|| Arc::new(JobStore::new(SESSION_TTL)))
        .clone()
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

/// Mannequin (pose.png) embedded at compile time so the binary is
/// self-contained and CWD-independent.
const MANNEQUIN_BYTES: &[u8] = include_bytes!("../avatar/assets/pose.png");

fn mannequin_bytes() -> &'static [u8] {
    MANNEQUIN_BYTES
}

/// Cache of the uploaded pose.png URL so the mannequin is only uploaded to fal
/// storage once per server lifetime.
fn mannequin_url_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

async fn mannequin_url(fal: &FalClient) -> Result<String, String> {
    {
        let cache = mannequin_url_cache().lock().expect("mannequin cache lock");
        if let Some(url) = cache.as_ref() {
            return Ok(url.clone());
        }
    }
    let bytes = mannequin_bytes();
    let url = fal.upload(bytes, "pose.png", "image/png").await?;
    let mut cache = mannequin_url_cache().lock().expect("mannequin cache lock");
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

/// End-to-end "dress-avatar" rendering. Pass 1 composes the outfit on a
/// faceless mannequin (multi-image seedream-edit). Pass 2 re-anchors
/// identity/pose on the user's avatar via the shared TRYON_PROMPT. Final pass
/// strips the background and decontaminates the edges.
///
/// `on_phase` is invoked as the pipeline moves through pass1/pass2/rembg so
/// the caller can persist progress. Returns the fal URL of the final PNG.
pub async fn dress_avatar(
    fal: &FalClient,
    avatar_url: &str,
    items: Vec<ItemBody>,
    on_phase: impl Fn(&str),
) -> Result<String, String> {
    let garments = dedupe_items(items);
    if garments.is_empty() {
        return Err("dressAvatar requires at least one garment".to_string());
    }

    // Make sure all input URLs are reachable from fal (rehost local URLs in dev).
    let reachable_avatar = ensure_fal_reachable(fal, avatar_url).await?;
    let mut reachable_garments = Vec::with_capacity(garments.len());
    for g in &garments {
        let image_url = ensure_fal_reachable(fal, &g.image_url).await?;
        reachable_garments.push((g.slot, image_url, g.fit.clone(), g.length.clone()));
    }
    let mannequin = mannequin_url(fal).await?;

    // ─── Pass 1: compose outfit on faceless mannequin ─────────────────────
    on_phase("pass1");
    let slot_clauses = reachable_garments
        .iter()
        .enumerate()
        .map(|(idx, g)| prompts::slot_clause(g.0, idx + 2, g.2.as_deref(), g.3.as_deref()))
        .collect::<Vec<_>>()
        .join(" ");
    let present: HashSet<&str> = reachable_garments.iter().map(|g| g.0).collect();
    let absences = prompts::absent_slot_clauses(&present);
    let prompt = prompts::pass1_prompt(&slot_clauses, &absences);
    let mut image_urls = vec![mannequin];
    image_urls.extend(reachable_garments.iter().map(|g| g.1.clone()));
    let pass1 = fal
        .run(
            PASS_MODEL,
            json!({
                "prompt": prompt,
                "image_urls": image_urls,
                "num_images": 1,
                "image_size": { "width": 832, "height": 1248 },
            }),
        )
        .await?;
    let pass1_url = url_from_result(&pass1).map_err(|e| format!("pass1 {e}"))?;

    // ─── Pass 2: re-anchor identity/pose on the user's avatar ─────────────
    on_phase("pass2");
    let pass2 = fal
        .run(
            PASS_MODEL,
            json!({
                "prompt": prompts::TRYON_PROMPT,
                "image_urls": [reachable_avatar, pass1_url],
                "num_images": 1,
                "image_size": { "width": 832, "height": 1248 },
                "output_format": "png",
            }),
        )
        .await?;
    let staged_url = url_from_result(&pass2).map_err(|e| format!("pass2 {e}"))?;

    // ─── Background remove + decontaminate ────────────────────────────────
    on_phase("rembg");
    let rembg = fal
        .run(REMBG_MODEL, json!({ "image_url": staged_url }))
        .await?;
    let rembg_url = rembg_image_url(&rembg)?;
    let staged_bytes = fal.fetch_bytes(&staged_url).await?;
    let rembg_bytes = fal.fetch_bytes(&rembg_url).await?;
    let decontaminated = imageproc::decontaminate(&rembg_bytes, &staged_bytes)?;
    imageproc::dev_dump("tryon-final.png", &decontaminated);
    fal.upload(&decontaminated, "tryon-final.png", "image/png")
        .await
}

pub async fn start(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(_outfit_id): Path<String>,
    Json(body): Json<StartBody>,
) -> ApiResult<Json<Value>> {
    let avatar = default_avatar(&state.pool, &auth.id).await?;
    let avatar = match avatar {
        Some(a) => a,
        None => {
            return Err(ApiError::precondition_failed(
                "User has no defaultAvatarUrl. Run the seed.",
            ))
        }
    };
    if body.items.is_empty() {
        return Err(ApiError::bad_request(
            "dressAvatar requires at least one garment",
        ));
    }
    if body.items.len() > 5 {
        return Err(ApiError::bad_request("dressAvatar accepts at most 5 items"));
    }
    if dedupe_items(body.items.clone()).is_empty() {
        return Err(ApiError::bad_request(
            "dressAvatar requires at least one garment",
        ));
    }
    let fal = state.fal.clone();
    let store = regenerate_fit_store();
    let session_id = new_session_id();
    store.gc();
    store.insert(
        session_id.clone(),
        Progress {
            phase: "pass1".into(),
            result_url: None,
            turntable_url: None,
            turntable_frames_url: None,
            message: None,
        },
    );
    let store2 = store.clone();
    let session = session_id.clone();
    let avatar2 = avatar.clone();
    tokio::spawn(async move {
        if let Err(e) = run_pipeline(fal, store2, &session, avatar2, body.items).await {
            tracing::error!(error = %e, session = %session, "regenerate-fit pipeline failed");
            store.update(&session, |p| {
                p.phase = "error".into();
                p.message = Some("Could not generate your avatar. Please try again.".into());
            });
        }
    });
    Ok(Json(json!({ "sessionId": session_id })))
}

async fn run_pipeline(
    fal: FalClient,
    store: Arc<JobStore<Progress>>,
    session: &str,
    avatar: String,
    items: Vec<ItemBody>,
) -> Result<(), String> {
    let result = dress_avatar(&fal, &avatar, items, |phase| {
        store.update(session, |p| p.phase = phase.to_string());
    })
    .await?;
    // The still is usable on its own; publish it before the minutes-long
    // turntable render so the app is not stuck waiting on it.
    store.update(session, |p| {
        p.phase = "turntable".into();
        p.result_url = Some(result.clone());
    });
    let turntable = crate::turntable::figure_to_turntable(&fal, &result).await;
    store.update(session, |p| {
        p.phase = "done".into();
        p.turntable_url = turntable.as_ref().map(|t| t.video_url.clone());
        p.turntable_frames_url = turntable.map(|t| t.frames_url);
    });
    Ok(())
}

pub async fn progress(
    State(_state): State<AppState>,
    _auth: AuthUser,
    Path(session_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let p = regenerate_fit_store().get(&session_id).unwrap_or(Progress {
        phase: "error".into(),
        result_url: None,
        turntable_url: None,
        turntable_frames_url: None,
        message: Some("Session not found (server may have restarted)".into()),
    });
    Ok(Json(json!(p)))
}
