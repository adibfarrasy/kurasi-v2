use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::outfits::{OutfitRow, OUTFIT_COLUMNS};
use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct SharedOutfitRow {
    pub id: Uuid,
    pub user_id: String,
    pub outfit_id: Uuid,
    pub face_anonymisation: String,
    pub show_username: bool,
    pub status: String,
    pub shared_at: NaiveDateTime,
    pub unpublished_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const COLUMNS: &str = "id, user_id, outfit_id, face_anonymisation, show_username, status, shared_at, unpublished_at, created_at, updated_at";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBody {
    pub outfit_id: Uuid,
    pub face_anonymisation: String,
    pub show_username: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpublishBody {
    pub outfit_id: Uuid,
}

#[derive(Deserialize, Default)]
pub struct DiscoverQuery {
    pub limit: Option<i32>,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverOut {
    #[serde(flatten)]
    pub row: SharedOutfitRow,
    pub outfit: OutfitRow,
    pub publisher_username: Option<String>,
}

pub async fn discover(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<DiscoverQuery>,
) -> ApiResult<Json<Vec<DiscoverOut>>> {
    let limit = q.limit.unwrap_or(20).clamp(1, 100) as i64;
    let rows = sqlx::query_as::<_, SharedOutfitRow>(&format!(
        "SELECT {COLUMNS} FROM shared_outfit WHERE status='published' AND user_id <> $1 ORDER BY shared_at DESC LIMIT $2"
    ))
    .bind(&auth.id)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let outfit = sqlx::query_as::<_, OutfitRow>(&format!(
            "SELECT {OUTFIT_COLUMNS} FROM outfit WHERE id=$1",
        ))
        .bind(r.outfit_id)
        .fetch_one(&state.pool)
        .await?;
        let publisher_username = if r.show_username {
            sqlx::query_scalar::<_, Option<String>>("SELECT name FROM \"user\" WHERE id=$1")
                .bind(&r.user_id)
                .fetch_one(&state.pool)
                .await?
        } else {
            None
        };
        out.push(DiscoverOut {
            row: r,
            outfit,
            publisher_username,
        });
    }
    Ok(Json(out))
}

pub async fn find_by_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(outfit_id): Path<Uuid>,
) -> ApiResult<Json<Option<SharedOutfitRow>>> {
    let row = sqlx::query_as::<_, SharedOutfitRow>(&format!(
        "SELECT {COLUMNS} FROM shared_outfit WHERE outfit_id=$1 AND user_id=$2"
    ))
    .bind(outfit_id)
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn publish(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PublishBody>,
) -> ApiResult<Json<SharedOutfitRow>> {
    if !matches!(
        body.face_anonymisation.as_str(),
        "none" | "blur_face" | "block_eyes"
    ) {
        return Err(ApiError::validation(
            "faceAnonymisation must be none, blur_face, or block_eyes",
        ));
    }
    let outfit_status: Option<String> =
        sqlx::query_scalar("SELECT status FROM outfit WHERE id=$1 AND user_id=$2")
            .bind(body.outfit_id)
            .bind(&auth.id)
            .fetch_optional(&state.pool)
            .await?;
    match outfit_status {
        None => return Err(ApiError::not_found("Outfit not found")),
        Some(s) if s != "active" => return Err(ApiError::bad_request("Outfit is not active")),
        _ => {}
    }

    let existing: Option<(String,)> =
        sqlx::query_as("SELECT status FROM shared_outfit WHERE outfit_id=$1 AND user_id=$2")
            .bind(body.outfit_id)
            .bind(&auth.id)
            .fetch_optional(&state.pool)
            .await?;

    if existing.is_some() {
        let row = sqlx::query_as::<_, SharedOutfitRow>(&format!(
            r#"UPDATE shared_outfit SET status='published', face_anonymisation=$3, show_username=$4, shared_at=now(), unpublished_at=NULL, updated_at=now()
               WHERE outfit_id=$1 AND user_id=$2
               RETURNING {COLUMNS}"#
        ))
        .bind(body.outfit_id)
        .bind(&auth.id)
        .bind(&body.face_anonymisation)
        .bind(body.show_username)
        .fetch_one(&state.pool)
        .await?;
        Ok(Json(row))
    } else {
        let row = sqlx::query_as::<_, SharedOutfitRow>(&format!(
            r#"INSERT INTO shared_outfit (id, user_id, outfit_id, face_anonymisation, show_username, status)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, 'published')
               RETURNING {COLUMNS}"#
        ))
        .bind(&auth.id)
        .bind(body.outfit_id)
        .bind(&body.face_anonymisation)
        .bind(body.show_username)
        .fetch_one(&state.pool)
        .await?;
        Ok(Json(row))
    }
}

pub async fn unpublish(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UnpublishBody>,
) -> ApiResult<Json<Value>> {
    let res = sqlx::query(
        r#"UPDATE shared_outfit SET status='unpublished', unpublished_at=now(), updated_at=now()
           WHERE outfit_id=$1 AND user_id=$2 AND status='published'"#,
    )
    .bind(body.outfit_id)
    .bind(&auth.id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::not_found("No active SharedOutfit to unpublish"));
    }
    Ok(Json(json!(true)))
}
