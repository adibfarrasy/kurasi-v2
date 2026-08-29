use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::credits;
use crate::error::ApiResult;
use axum::extract::State;
use axum::Json;
use chrono::NaiveDateTime;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::PgPool;

pub const STARTER_WARDROBE_THRESHOLD: i64 = 5;

#[derive(sqlx::FromRow)]
struct OnboardingRow {
    user_id: String,
    status: String,
    biometrics_completed_at: Option<NaiveDateTime>,
    starter_wardrobe_completed_at: Option<NaiveDateTime>,
    started_at: NaiveDateTime,
    completed_at: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingOut {
    user_id: String,
    status: String,
    biometrics_completed_at: Option<NaiveDateTime>,
    starter_wardrobe_completed_at: Option<NaiveDateTime>,
    started_at: NaiveDateTime,
    completed_at: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
    biometrics_done: bool,
    starter_wardrobe_done: bool,
    all_steps_done: bool,
}

impl From<OnboardingRow> for OnboardingOut {
    fn from(r: OnboardingRow) -> Self {
        let biometrics_done = r.biometrics_completed_at.is_some();
        let starter_wardrobe_done = r.starter_wardrobe_completed_at.is_some();
        let all_steps_done = biometrics_done && starter_wardrobe_done;
        OnboardingOut {
            user_id: r.user_id,
            status: r.status,
            biometrics_completed_at: r.biometrics_completed_at,
            starter_wardrobe_completed_at: r.starter_wardrobe_completed_at,
            started_at: r.started_at,
            completed_at: r.completed_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
            biometrics_done,
            starter_wardrobe_done,
            all_steps_done,
        }
    }
}

pub async fn get_onboarding(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Option<OnboardingOut>>> {
    let row = sqlx::query_as::<_, OnboardingRow>(
        r#"SELECT user_id, status, biometrics_completed_at, starter_wardrobe_completed_at,
                  started_at, completed_at, created_at, updated_at
           FROM onboarding_progress WHERE user_id=$1"#,
    )
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row.map(OnboardingOut::from)))
}

pub async fn complete_onboarding(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Value>> {
    let updated = sqlx::query(
        r#"UPDATE onboarding_progress SET
             status='completed',
             biometrics_completed_at=COALESCE(biometrics_completed_at, now()),
             starter_wardrobe_completed_at=COALESCE(starter_wardrobe_completed_at, now()),
             completed_at=COALESCE(completed_at, now()),
             updated_at=now()
           WHERE user_id=$1"#,
    )
    .bind(&auth.id)
    .execute(&state.pool)
    .await?;
    if updated.rows_affected() > 0 {
        credits::grant_signup_credits(&state.pool, &auth.id).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn maybe_complete_onboarding(pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    let done = sqlx::query_scalar::<_, String>(
        r#"UPDATE onboarding_progress SET status='completed', completed_at=now(), updated_at=now()
           WHERE user_id=$1 AND status='in_progress'
             AND biometrics_completed_at IS NOT NULL
             AND starter_wardrobe_completed_at IS NOT NULL
           RETURNING user_id"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if done.is_some() {
        tracing::info!(user_id, "onboarding completed");
        credits::grant_signup_credits(pool, user_id).await?;
    }
    Ok(())
}

pub async fn complete_starter_wardrobe_step(
    pool: &PgPool,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    let pending = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM onboarding_progress WHERE user_id=$1 AND starter_wardrobe_completed_at IS NULL",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if pending.is_none() {
        return Ok(());
    }
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM clothing_item WHERE user_id=$1 AND status='active'",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    if count >= STARTER_WARDROBE_THRESHOLD {
        sqlx::query(
            "UPDATE onboarding_progress SET starter_wardrobe_completed_at=now(), updated_at=now() WHERE user_id=$1",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        maybe_complete_onboarding(pool, user_id).await?;
    }
    Ok(())
}
