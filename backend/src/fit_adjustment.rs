use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use axum::extract::{Path, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct FitAdjustmentRow {
    pub id: Uuid,
    pub user_id: String,
    pub item_id: Uuid,
    pub length: Option<String>,
    pub width: Option<String>,
    pub sleeve: Option<String>,
    pub rise: Option<String>,
    pub custom_notes: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const COLUMNS: &str = "id, user_id, item_id, length, width, sleeve, rise, custom_notes, created_at, updated_at";

const LENGTHS: [&str; 3] = ["shorter", "true_to_size", "longer"];
const WIDTHS: [&str; 3] = ["tighter", "true_to_size", "looser"];
const SLEEVES: [&str; 3] = ["too_short", "true_to_size", "too_long"];
const RISES: [&str; 3] = ["low_rise", "mid_rise", "high_rise"];

fn valid_enum(v: &Option<String>, allowed: &[&str; 3]) -> bool {
    v.as_deref().map(|s| allowed.contains(&s)).unwrap_or(true)
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBody {
    pub length: Option<String>,
    pub width: Option<String>,
    pub sleeve: Option<String>,
    pub rise: Option<String>,
    pub custom_notes: Option<String>,
}

pub async fn get_for_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<Option<FitAdjustmentRow>>> {
    let row = sqlx::query_as::<_, FitAdjustmentRow>(&format!(
        "SELECT {COLUMNS} FROM fit_adjustment WHERE user_id=$1 AND item_id=$2"
    ))
    .bind(&auth.id)
    .bind(item_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn upsert(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(body): Json<UpsertBody>,
) -> ApiResult<Json<FitAdjustmentRow>> {
    if !valid_enum(&body.length, &LENGTHS)
        || !valid_enum(&body.width, &WIDTHS)
        || !valid_enum(&body.sleeve, &SLEEVES)
        || !valid_enum(&body.rise, &RISES)
    {
        return Err(ApiError::validation("invalid fit adjustment value"));
    }
    if body.custom_notes.as_deref().map(|s| s.len() > 2000).unwrap_or(false) {
        return Err(ApiError::validation("customNotes must be at most 2000 characters"));
    }
    let item: Option<(String,)> = sqlx::query_as(
        "SELECT status FROM clothing_item WHERE id=$1 AND user_id=$2",
    )
    .bind(item_id)
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    match item {
        None => return Err(ApiError::not_found("Item not found")),
        Some((status,)) if status == "removed" => {
            return Err(ApiError::bad_request("Cannot adjust a removed item"))
        }
        _ => {}
    }
    let row = sqlx::query_as::<_, FitAdjustmentRow>(&format!(
        r#"INSERT INTO fit_adjustment (id, user_id, item_id, length, width, sleeve, rise, custom_notes)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, item_id) DO UPDATE SET
             length=EXCLUDED.length, width=EXCLUDED.width, sleeve=EXCLUDED.sleeve,
             rise=EXCLUDED.rise, custom_notes=EXCLUDED.custom_notes, updated_at=now()
           RETURNING {COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(item_id)
    .bind(&body.length)
    .bind(&body.width)
    .bind(&body.sleeve)
    .bind(&body.rise)
    .bind(&body.custom_notes)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn remove(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let res = sqlx::query("DELETE FROM fit_adjustment WHERE user_id=$1 AND item_id=$2")
        .bind(&auth.id)
        .bind(item_id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::not_found("Fit adjustment not found"));
    }
    Ok(Json(json!(true)))
}