use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::{Path, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardOut {
    pub id: Uuid,
    pub image_url: String,
    pub source_attribution: String,
    pub status: String,
    pub created_at: NaiveDateTime,
    pub retired_at: Option<NaiveDateTime>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedStyleOut {
    pub saved_id: Uuid,
    pub saved_at: NaiveDateTime,
    pub card: CardOut,
}

pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<SavedStyleOut>>> {
    let rows = sqlx::query_as::<_, (Uuid, NaiveDateTime, Uuid, String, String, String, NaiveDateTime, Option<NaiveDateTime>)>(
        "SELECT ss.id, ss.saved_at, sc.id, sc.image_url, sc.source_attribution, sc.status, sc.created_at, sc.retired_at
         FROM saved_style ss INNER JOIN style_card sc ON sc.id = ss.card_id
         WHERE ss.user_id=$1 ORDER BY ss.saved_at DESC",
    )
    .bind(&auth.id)
    .fetch_all(&state.pool)
    .await?;
    let out = rows
        .into_iter()
        .map(|(saved_id, saved_at, id, image_url, source_attribution, status, created_at, retired_at)| SavedStyleOut {
            saved_id,
            saved_at,
            card: CardOut { id, image_url, source_attribution, status, created_at, retired_at },
        })
        .collect();
    Ok(Json(out))
}

pub async fn remove(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(card_id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let res = sqlx::query("DELETE FROM saved_style WHERE user_id=$1 AND card_id=$2")
        .bind(&auth.id)
        .bind(card_id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::not_found("Saved style not found"));
    }
    Ok(Json(json!(true)))
}