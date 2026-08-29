use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct StyleCardRow {
    pub id: Uuid,
    pub image_url: String,
    pub source_attribution: String,
    pub status: String,
    pub created_at: NaiveDateTime,
    pub retired_at: Option<NaiveDateTime>,
}

const COLUMNS: &str = "id, image_url, source_attribution, status, created_at, retired_at";

#[derive(Deserialize, Default)]
pub struct FeedQuery {
    pub limit: Option<i32>,
    pub cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardBody {
    pub image_url: String,
    pub source_attribution: String,
}

pub async fn feed(
    State(state): State<AppState>,
    _auth: AuthUser,
    Query(q): Query<FeedQuery>,
) -> ApiResult<Json<Value>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 50);
    let rows = match &q.cursor {
        Some(cursor) => {
            sqlx::query_as::<_, StyleCardRow>(&format!(
                "SELECT {COLUMNS} FROM style_card
                 WHERE id NOT IN (SELECT card_id FROM style_interaction WHERE user_id=$1)
                   AND created_at < $2::timestamp
                 ORDER BY created_at DESC LIMIT $3"
            ))
            .bind(&_auth.id)
            .bind(cursor)
            .bind(limit as i64 + 1)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, StyleCardRow>(&format!(
                "SELECT {COLUMNS} FROM style_card
                 WHERE id NOT IN (SELECT card_id FROM style_interaction WHERE user_id=$1)
                 ORDER BY created_at DESC LIMIT $2"
            ))
            .bind(&_auth.id)
            .bind(limit as i64 + 1)
            .fetch_all(&state.pool)
            .await?
        }
    };
    let has_more = rows.len() as i32 > limit;
    let items = rows.into_iter().take(limit as usize).collect::<Vec<_>>();
    let next_cursor = if has_more {
        items
            .last()
            .map(|c| c.created_at.format("%Y-%m-%dT%H:%M:%S%.f").to_string())
    } else {
        None
    };
    Ok(Json(json!({ "items": items, "nextCursor": next_cursor })))
}

pub async fn find(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Option<StyleCardRow>>> {
    let row = sqlx::query_as::<_, StyleCardRow>(&format!(
        "SELECT {COLUMNS} FROM style_card WHERE id=$1"
    ))
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn create_card(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateCardBody>,
) -> ApiResult<Json<StyleCardRow>> {
    if body.image_url.is_empty() || body.source_attribution.is_empty() {
        return Err(ApiError::validation("imageUrl and sourceAttribution are required"));
    }
    let row = sqlx::query_as::<_, StyleCardRow>(&format!(
        "INSERT INTO style_card (id, image_url, source_attribution) VALUES (gen_random_uuid(), $1, $2) RETURNING {COLUMNS}"
    ))
    .bind(&body.image_url)
    .bind(&body.source_attribution)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(ApiError::internal)?;
    Ok(Json(row))
}

pub async fn retire(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<StyleCardRow>> {
    let row = sqlx::query_as::<_, StyleCardRow>(&format!(
        r#"UPDATE style_card SET status='retired', retired_at=now()
           WHERE id=$1 AND status='active'
           RETURNING {COLUMNS}"#
    ))
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Style card not found or already retired"))?;
    Ok(Json(row))
}