use uuid::Uuid;

pub async fn grant_signup_credits(pool: &sqlx::PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    let existing = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM credit_grant WHERE user_id=$1 AND source='signup' LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if existing.is_some() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE credit_account SET balance=balance+15 WHERE user_id=$1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO credit_grant (id, user_id, amount, source) VALUES (gen_random_uuid(), $1, 15, 'signup')",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(user_id, "granted signup credits");
    Ok(())
}

use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

pub async fn get_credits(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Value>> {
    let balance: i32 = sqlx::query_scalar(
        "SELECT balance FROM credit_account WHERE user_id=$1",
    )
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or(0);
    Ok(Json(json!({ "balance": balance })))
}

#[derive(Deserialize)]
pub struct PurchaseBody {
    pub amount: i32,
}

pub async fn purchase(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PurchaseBody>,
) -> ApiResult<Json<Value>> {
    if body.amount <= 0 {
        return Err(ApiError::validation("amount must be a positive integer"));
    }
    let mut tx = state.pool.begin().await?;
    let balance = sqlx::query_scalar::<_, i32>(
        "UPDATE credit_account SET balance=balance+$1 WHERE user_id=$2 RETURNING balance",
    )
    .bind(body.amount)
    .bind(&auth.id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("Credit account not found"))?;
    sqlx::query(
        "INSERT INTO credit_grant (id, user_id, amount, source) VALUES (gen_random_uuid(), $1, $2, 'purchase')",
    )
    .bind(&auth.id)
    .bind(body.amount)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "balance": balance })))
}