use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::State;
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct InteractionRow {
    pub id: Uuid,
    pub user_id: String,
    pub card_id: Uuid,
    pub kind: String,
    pub occurred_at: NaiveDateTime,
}

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRow {
    pub saved_id: Uuid,
    pub saved_at: NaiveDateTime,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardBody {
    pub card_id: Uuid,
}

async fn card_status(pool: &sqlx::PgPool, card_id: Uuid) -> Result<Option<String>, ApiError> {
    Ok(
        sqlx::query_scalar("SELECT status FROM style_card WHERE id=$1")
            .bind(card_id)
            .fetch_optional(pool)
            .await?,
    )
}

pub async fn like(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CardBody>,
) -> ApiResult<Json<Value>> {
    let status = card_status(&state.pool, body.card_id).await?;
    let status = status.ok_or_else(|| ApiError::not_found("Style card not found"))?;
    if status != "active" {
        return Err(ApiError::bad_request("Card is retired"));
    }

    let mut tx = state.pool.begin().await?;
    let prior: Option<InteractionRow> = sqlx::query_as(
        "SELECT id, user_id, card_id, kind, occurred_at FROM style_interaction WHERE user_id=$1 AND card_id=$2",
    )
    .bind(&auth.id)
    .bind(body.card_id)
    .fetch_optional(&mut *tx)
    .await?;

    let interaction = match prior {
        Some(i) if i.kind == "skipped" => {
            return Err(ApiError::bad_request("Card was already skipped and cannot be liked"));
        }
        Some(i) => i,
        None => sqlx::query_as::<_, InteractionRow>(
            "INSERT INTO style_interaction (id, user_id, card_id, kind) VALUES (gen_random_uuid(), $1, $2, 'liked') RETURNING id, user_id, card_id, kind, occurred_at",
        )
        .bind(&auth.id)
        .bind(body.card_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::internal)?,
    };

    let saved = match sqlx::query_as::<_, SavedRow>(
        "INSERT INTO saved_style (id, user_id, card_id) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT (user_id, card_id) DO NOTHING RETURNING id AS saved_id, saved_at",
    )
    .bind(&auth.id)
    .bind(body.card_id)
    .fetch_optional(&mut *tx)
    .await?
    {
        Some(s) => s,
        None => sqlx::query_as::<_, SavedRow>(
            "SELECT id AS saved_id, saved_at FROM saved_style WHERE user_id=$1 AND card_id=$2",
        )
        .bind(&auth.id)
        .bind(body.card_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::internal)?,
    };

    tx.commit().await?;
    Ok(Json(json!({ "interaction": interaction, "saved": saved })))
}

pub async fn skip(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CardBody>,
) -> ApiResult<Json<Value>> {
    let status = card_status(&state.pool, body.card_id).await?;
    let status = status.ok_or_else(|| ApiError::not_found("Style card not found"))?;
    if status != "active" {
        return Err(ApiError::bad_request("Card is retired"));
    }

    let mut tx = state.pool.begin().await?;
    let prior: Option<InteractionRow> = sqlx::query_as(
        "SELECT id, user_id, card_id, kind, occurred_at FROM style_interaction WHERE user_id=$1 AND card_id=$2",
    )
    .bind(&auth.id)
    .bind(body.card_id)
    .fetch_optional(&mut *tx)
    .await?;

    let interaction = match prior {
        Some(i) if i.kind == "liked" => {
            return Err(ApiError::bad_request("Card was already liked and cannot be skipped"));
        }
        Some(i) => i,
        None => sqlx::query_as::<_, InteractionRow>(
            "INSERT INTO style_interaction (id, user_id, card_id, kind) VALUES (gen_random_uuid(), $1, $2, 'skipped') RETURNING id, user_id, card_id, kind, occurred_at",
        )
        .bind(&auth.id)
        .bind(body.card_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::internal)?,
    };

    tx.commit().await?;
    Ok(Json(json!({ "interaction": interaction })))
}
