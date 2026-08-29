use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::State;
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MIN_WARDROBE_ITEMS: i64 = 5;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct RecommendationRow {
    pub id: Uuid,
    pub user_id: String,
    pub kind: String,
    pub based_on_outfit_id: Option<Uuid>,
    pub status: String,
    pub requested_at: NaiveDateTime,
    pub computed_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const COLUMNS: &str = "id, user_id, kind, based_on_outfit_id, status, requested_at, computed_at, created_at, updated_at";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    pub kind: String,
    pub based_on_outfit_id: Option<Uuid>,
}

pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<RecommendationRow>>> {
    let rows = sqlx::query_as::<_, RecommendationRow>(&format!(
        "SELECT {COLUMNS} FROM outfit_recommendation_request WHERE user_id=$1 ORDER BY requested_at DESC"
    ))
    .bind(&auth.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn request(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<RequestBody>,
) -> ApiResult<Json<RecommendationRow>> {
    if !matches!(body.kind.as_str(), "gap_filling" | "outfit_generation") {
        return Err(ApiError::validation(
            "kind must be gap_filling or outfit_generation",
        ));
    }
    match body.kind.as_str() {
        "gap_filling" => {
            if body.based_on_outfit_id.is_some() {
                return Err(ApiError::bad_request(
                    "gap_filling must omit basedOnOutfitId; outfit_generation requires it",
                ));
            }
        }
        _ => {
            let seed_id = body.based_on_outfit_id.ok_or_else(|| {
                ApiError::bad_request(
                    "gap_filling must omit basedOnOutfitId; outfit_generation requires it",
                )
            })?;
            let seed: Option<(String,)> =
                sqlx::query_as("SELECT status FROM outfit WHERE id=$1 AND user_id=$2")
                    .bind(seed_id)
                    .bind(&auth.id)
                    .fetch_optional(&state.pool)
                    .await?;
            match seed {
                Some((status,)) if status == "active" => {}
                None => return Err(ApiError::not_found("Seed outfit not found")),
                Some(_) => return Err(ApiError::bad_request("Seed outfit is not active")),
            }
        }
    }

    let active_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM clothing_item WHERE user_id=$1 AND status='active'",
    )
    .bind(&auth.id)
    .fetch_one(&state.pool)
    .await?;
    if active_count < MIN_WARDROBE_ITEMS {
        return Err(ApiError::bad_request(
            "Need at least 5 active wardrobe items",
        ));
    }

    let row = sqlx::query_as::<_, RecommendationRow>(&format!(
        r#"INSERT INTO outfit_recommendation_request (id, user_id, kind, based_on_outfit_id, status)
           VALUES (gen_random_uuid(), $1, $2, $3, 'pending')
           RETURNING {COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(&body.kind)
    .bind(body.based_on_outfit_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}
