use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::ApiResult;
use crate::subscription::{compute_access, SubscriptionRow};
use axum::extract::State;
use axum::Json;
use chrono::NaiveDateTime;
use serde_json::{json, Value};

#[derive(sqlx::FromRow)]
#[sqlx(rename_all = "snake_case")]
struct MeRow {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub trial_started_at: NaiveDateTime,
}

pub async fn me(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Value>> {
    let row = sqlx::query_as::<_, MeRow>(
        r#"SELECT id, name, email, email_verified, image, trial_started_at FROM "user" WHERE id=$1"#,
    )
    .bind(&auth.id)
    .fetch_one(&state.pool)
    .await?;
    let sub = sqlx::query_as::<_, SubscriptionRow>(
        "SELECT id, user_id, interval, status, started_at, current_period_end, cancelled_at, lapsed_at, grace_started_at, grace_ends_at, provider_ref, created_at, updated_at FROM subscription WHERE user_id=$1",
    )
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    let (is_in_trial, is_current, has_access) = compute_access(
        row.trial_started_at,
        sub.as_ref(),
        chrono::Utc::now().naive_utc(),
    );
    Ok(Json(json!({
        "id": row.id,
        "name": row.name,
        "email": row.email,
        "emailVerified": row.email_verified,
        "image": row.image,
        "trialStartedAt": row.trial_started_at,
        "isInTrial": is_in_trial,
        "isCurrent": is_current,
        "hasAccess": has_access,
    })))
}
