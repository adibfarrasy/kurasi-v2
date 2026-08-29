use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::State;
use axum::Json;
use chrono::{Duration, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

pub const BILLING_PERIOD_DAYS: i64 = 30;
pub const GRACE_PERIOD_DAYS: i64 = 3;
pub const TRIAL_DURATION_DAYS: i64 = 7;

#[derive(sqlx::FromRow, Serialize, Clone)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionRow {
    pub id: Uuid,
    pub user_id: String,
    pub interval: String,
    pub status: String,
    pub started_at: NaiveDateTime,
    pub current_period_end: NaiveDateTime,
    pub cancelled_at: Option<NaiveDateTime>,
    pub lapsed_at: Option<NaiveDateTime>,
    pub grace_started_at: Option<NaiveDateTime>,
    pub grace_ends_at: Option<NaiveDateTime>,
    pub provider_ref: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const COLUMNS: &str = "id, user_id, interval, status, started_at, current_period_end, cancelled_at, lapsed_at, grace_started_at, grace_ends_at, provider_ref, created_at, updated_at";

fn now() -> NaiveDateTime {
    Utc::now().naive_utc()
}

fn is_current(sub: &SubscriptionRow, now: NaiveDateTime) -> bool {
    if sub.status == "active" && now < sub.current_period_end {
        return true;
    }
    if sub.status == "cancelled" && now < sub.current_period_end {
        return true;
    }
    if sub.status == "grace" && sub.grace_ends_at.is_some_and(|e| now < e) {
        return true;
    }
    false
}

pub fn compute_access(
    trial_started_at: NaiveDateTime,
    sub: Option<&SubscriptionRow>,
    now: NaiveDateTime,
) -> (bool, bool, bool) {
    let current = sub.map(|s| is_current(s, now)).unwrap_or(false);
    let has_active_or_current = matches!(
        sub.map(|s| s.status.as_str()),
        Some("active") | Some("grace")
    ) || current;
    let in_trial =
        now < trial_started_at + Duration::days(TRIAL_DURATION_DAYS) && !has_active_or_current;
    (in_trial, current, in_trial || current)
}

pub async fn get(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Value>> {
    let sub = sqlx::query_as::<_, SubscriptionRow>(&format!(
        "SELECT {COLUMNS} FROM subscription WHERE user_id=$1"
    ))
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    let trial_started_at: NaiveDateTime =
        sqlx::query_scalar("SELECT trial_started_at FROM \"user\" WHERE id=$1")
            .bind(&auth.id)
            .fetch_one(&state.pool)
            .await?;
    let (is_in_trial, is_current, has_access) =
        compute_access(trial_started_at, sub.as_ref(), now());
    Ok(Json(json!({
        "subscription": sub,
        "isInTrial": is_in_trial,
        "isCurrent": is_current,
        "hasAccess": has_access,
    })))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    pub provider_ref: Option<String>,
}

pub async fn start(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<StartBody>,
) -> ApiResult<Json<Value>> {
    let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM subscription WHERE user_id=$1")
        .bind(&auth.id)
        .fetch_optional(&state.pool)
        .await?;
    if exists.is_some() {
        return Err(ApiError::conflict("Subscription already exists for user"));
    }
    let n = now();
    let sub = sqlx::query_as::<_, SubscriptionRow>(&format!(
        r#"INSERT INTO subscription (id, user_id, interval, status, started_at, current_period_end, provider_ref)
           VALUES (gen_random_uuid(), $1, 'monthly', 'active', $2, $3, $4)
           RETURNING {COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(n)
    .bind(n + Duration::days(BILLING_PERIOD_DAYS))
    .bind(&body.provider_ref)
    .fetch_one(&state.pool)
    .await?;
    let trial_started_at: NaiveDateTime =
        sqlx::query_scalar("SELECT trial_started_at FROM \"user\" WHERE id=$1")
            .bind(&auth.id)
            .fetch_one(&state.pool)
            .await?;
    let (is_in_trial, is_current, has_access) = compute_access(trial_started_at, Some(&sub), now());
    Ok(Json(
        json!({ "subscription": sub, "isInTrial": is_in_trial, "isCurrent": is_current, "hasAccess": has_access }),
    ))
}

pub async fn cancel(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Value>> {
    let sub = fetch_for_update(&state, &auth).await?;
    if !matches!(sub.status.as_str(), "active" | "grace") {
        return Err(ApiError::bad_request(format!(
            "Cannot cancel subscription in status {}",
            sub.status
        )));
    }
    let updated = sqlx::query_as::<_, SubscriptionRow>(&format!(
        r#"UPDATE subscription SET status='cancelled', cancelled_at=now(), grace_started_at=NULL, grace_ends_at=NULL, updated_at=now()
           WHERE id=$1
           RETURNING {COLUMNS}"#
    ))
    .bind(sub.id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({ "subscription": updated })))
}

pub async fn renew_success(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Value>> {
    let sub = fetch_for_update(&state, &auth).await?;
    if !matches!(sub.status.as_str(), "active" | "grace") {
        return Err(ApiError::bad_request(format!(
            "Cannot renew subscription in status {}",
            sub.status
        )));
    }
    let n = now();
    let base = if sub.current_period_end > n {
        sub.current_period_end
    } else {
        n
    };
    let updated = sqlx::query_as::<_, SubscriptionRow>(&format!(
        r#"UPDATE subscription SET status='active', current_period_end=$2, grace_started_at=NULL, grace_ends_at=NULL, updated_at=now()
           WHERE id=$1
           RETURNING {COLUMNS}"#
    ))
    .bind(sub.id)
    .bind(base + Duration::days(BILLING_PERIOD_DAYS))
    .fetch_one(&state.pool)
    .await?;
    let trial_started_at: NaiveDateTime =
        sqlx::query_scalar("SELECT trial_started_at FROM \"user\" WHERE id=$1")
            .bind(&auth.id)
            .fetch_one(&state.pool)
            .await?;
    let (is_in_trial, is_current, has_access) =
        compute_access(trial_started_at, Some(&updated), now());
    Ok(Json(
        json!({ "subscription": updated, "isInTrial": is_in_trial, "isCurrent": is_current, "hasAccess": has_access }),
    ))
}

pub async fn renew_failure(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Value>> {
    let sub = fetch_for_update(&state, &auth).await?;
    if sub.status != "active" {
        return Err(ApiError::bad_request(format!(
            "Cannot enter grace from status {}",
            sub.status
        )));
    }
    let n = now();
    let updated = sqlx::query_as::<_, SubscriptionRow>(&format!(
        r#"UPDATE subscription SET status='grace', grace_started_at=$2, grace_ends_at=$3, updated_at=now()
           WHERE id=$1
           RETURNING {COLUMNS}"#
    ))
    .bind(sub.id)
    .bind(n)
    .bind(n + Duration::days(GRACE_PERIOD_DAYS))
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({ "subscription": updated })))
}

pub async fn lapse_after_grace(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> ApiResult<Json<Value>> {
    let res = sqlx::query(
        r#"UPDATE subscription SET status='lapsed', lapsed_at=now(), grace_started_at=NULL, grace_ends_at=NULL, updated_at=now()
           WHERE status='grace' AND grace_ends_at < now()"#,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "lapsedCount": res.rows_affected() })))
}

async fn fetch_for_update(state: &AppState, auth: &AuthUser) -> ApiResult<SubscriptionRow> {
    sqlx::query_as::<_, SubscriptionRow>(&format!(
        "SELECT {COLUMNS} FROM subscription WHERE user_id=$1"
    ))
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("No subscription"))
}
