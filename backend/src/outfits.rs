use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{ColorInfo, ItemCategory, ItemFit, ItemLength};
use axum::extract::{Path, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::types::Json as SqlxJson;
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct OutfitRow {
    pub id: Uuid,
    pub user_id: String,
    pub name: Option<String>,
    pub hero_image_url: Option<String>,
    pub headwear_id: Option<Uuid>,
    pub base_id: Option<Uuid>,
    pub outer_id: Option<Uuid>,
    pub bottom_id: Option<Uuid>,
    pub footwear_id: Option<Uuid>,
    pub notes: Option<String>,
    pub rating: Option<String>,
    pub worn_at: Option<NaiveDateTime>,
    pub status: String,
    pub deleted_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const OUTFIT_COLUMNS: &str = "id, user_id, name, hero_image_url, headwear_id, base_id, outer_id, \
     bottom_id, footwear_id, notes, rating, worn_at, status, deleted_at, created_at, updated_at";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOutfitBody {
    pub name: Option<String>,
    pub hero_image_url: Option<String>,
    pub headwear_id: Option<Uuid>,
    pub base_id: Option<Uuid>,
    pub outer_id: Option<Uuid>,
    pub bottom_id: Option<Uuid>,
    pub footwear_id: Option<Uuid>,
    pub notes: Option<String>,
    pub rating: Option<String>,
    pub worn_at: Option<NaiveDateTime>,
}

pub async fn list_outfits(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<OutfitRow>>> {
    let rows = sqlx::query_as::<_, OutfitRow>(&format!(
        "SELECT {OUTFIT_COLUMNS} FROM outfit WHERE user_id=$1 AND status <> 'deleted' ORDER BY created_at DESC"
    ))
    .bind(&auth.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn find_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Option<OutfitRow>>> {
    let row = sqlx::query_as::<_, OutfitRow>(&format!(
        "SELECT {OUTFIT_COLUMNS} FROM outfit WHERE id=$1 AND user_id=$2"
    ))
    .bind(id)
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row))
}

async fn ensure_slot_item_available(
    pool: &sqlx::PgPool,
    user_id: &str,
    id: Uuid,
) -> ApiResult<()> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT status FROM clothing_item WHERE id=$1 AND user_id=$2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    match row {
        Some((status,)) if status != "removed" => Ok(()),
        _ => Err(ApiError::bad_request("slot item not available")),
    }
}

pub async fn create_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateOutfitBody>,
) -> ApiResult<Json<OutfitRow>> {
    let slot_ids = [body.headwear_id, body.base_id, body.outer_id, body.bottom_id, body.footwear_id];
    if slot_ids.iter().all(|s| s.is_none()) {
        return Err(ApiError::bad_request("outfit must include at least one piece"));
    }
    for id in slot_ids.iter().flatten() {
        ensure_slot_item_available(&state.pool, &auth.id, *id).await?;
    }
    let row = sqlx::query_as::<_, OutfitRow>(&format!(
        r#"INSERT INTO outfit (id, user_id, name, hero_image_url, headwear_id, base_id, outer_id, bottom_id, footwear_id, notes, rating, worn_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING {OUTFIT_COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(&body.name)
    .bind(&body.hero_image_url)
    .bind(body.headwear_id)
    .bind(body.base_id)
    .bind(body.outer_id)
    .bind(body.bottom_id)
    .bind(body.footwear_id)
    .bind(&body.notes)
    .bind(&body.rating)
    .bind(body.worn_at)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FromTryOnBody {
    pub name: Option<String>,
    pub hero_image_url: Option<String>,
    pub slots: Vec<SlotInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotInput {
    pub category: ItemCategory,
    pub wardrobe_id: Option<Uuid>,
    pub ai_item: Option<AiItemInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiItemInput {
    pub image_url: String,
    pub category: ItemCategory,
    pub brand: Option<String>,
    pub fit: Option<ItemFit>,
    pub length: Option<ItemLength>,
    pub colors: Vec<ColorInfo>,
}

fn slot_key_for_category(c: ItemCategory) -> &'static str {
    match c {
        ItemCategory::Headwear => "headwear_id",
        ItemCategory::Shirt => "base_id",
        ItemCategory::Jacket => "outer_id",
        ItemCategory::Pants => "bottom_id",
        ItemCategory::Footwear => "footwear_id",
    }
}

pub async fn save_from_tryon(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<FromTryOnBody>,
) -> ApiResult<Json<OutfitRow>> {
    if body.slots.is_empty() {
        return Err(ApiError::bad_request("slots must include at least one piece"));
    }
    let mut tx = state.pool.begin().await?;
    let mut headwear: Option<Uuid> = None;
    let mut base: Option<Uuid> = None;
    let mut outer: Option<Uuid> = None;
    let mut bottom: Option<Uuid> = None;
    let mut footwear: Option<Uuid> = None;

    for slot in &body.slots {
        match (&slot.wardrobe_id, &slot.ai_item) {
            (Some(id), None) => {
                let (exists, category, status): (bool, String, String) = sqlx::query_as(
                    "SELECT EXISTS(SELECT 1 FROM clothing_item WHERE id=$1 AND user_id=$2), \
                     (SELECT category FROM clothing_item WHERE id=$1 AND user_id=$2), \
                     (SELECT status FROM clothing_item WHERE id=$1 AND user_id=$2)",
                )
                .bind(id)
                .bind(&auth.id)
                .fetch_one(&mut *tx)
                .await?;
                if !exists || status == "removed" {
                    return Err(ApiError::bad_request("slot item not available"));
                }
                if category != slot.category.as_str() {
                    return Err(ApiError::bad_request("slot category mismatch"));
                }
                match slot_key_for_category(slot.category) {
                    "headwear_id" => headwear = Some(*id),
                    "base_id" => base = Some(*id),
                    "outer_id" => outer = Some(*id),
                    "bottom_id" => bottom = Some(*id),
                    _ => footwear = Some(*id),
                }
            }
            (None, Some(ai)) => {
                let row = sqlx::query_as::<_, (Uuid,)>(r#"INSERT INTO clothing_item (id, user_id, image_url, category, brand, fit, length, colors, owned)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, false)
                    RETURNING id"#)
                    .bind(&auth.id)
                    .bind(&ai.image_url)
                    .bind(ai.category.as_str())
                    .bind(&ai.brand)
                    .bind(ai.fit.map(|f| f.as_str()))
                    .bind(ai.length.map(|l| l.as_str()))
                    .bind(SqlxJson(&ai.colors))
                    .fetch_optional(&mut *tx)
                    .await?
                    .ok_or_else(ApiError::internal)?;
                match slot_key_for_category(slot.category) {
                    "headwear_id" => headwear = Some(row.0),
                    "base_id" => base = Some(row.0),
                    "outer_id" => outer = Some(row.0),
                    "bottom_id" => bottom = Some(row.0),
                    _ => footwear = Some(row.0),
                }
            }
            _ => {
                return Err(ApiError::bad_request(
                    "slot must specify exactly one of wardrobeId or aiItem",
                ))
            }
        }
    }

    let outfit = sqlx::query_as::<_, OutfitRow>(&format!(
        r#"INSERT INTO outfit (id, user_id, name, hero_image_url, headwear_id, base_id, outer_id, bottom_id, footwear_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING {OUTFIT_COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(&body.name)
    .bind(&body.hero_image_url)
    .bind(headwear)
    .bind(base)
    .bind(outer)
    .bind(bottom)
    .bind(footwear)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(outfit))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOutfitBody {
    pub name: Option<String>,
    pub notes: Option<String>,
}

pub async fn update_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateOutfitBody>,
) -> ApiResult<Json<OutfitRow>> {
    let row = sqlx::query_as::<_, OutfitRow>(&format!(
        r#"UPDATE outfit SET name=COALESCE($3, name), notes=COALESCE($4, notes), updated_at=now()
           WHERE id=$1 AND user_id=$2 AND status='active'
           RETURNING {OUTFIT_COLUMNS}"#
    ))
    .bind(id)
    .bind(&auth.id)
    .bind(&body.name)
    .bind(&body.notes)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Outfit not found"))?;
    Ok(Json(row))
}

pub async fn delete_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let res = sqlx::query(
        r#"UPDATE outfit SET status='deleted', deleted_at=now(), updated_at=now()
           WHERE id=$1 AND user_id=$2 AND status='active'"#,
    )
    .bind(id)
    .bind(&auth.id)
    .execute(&state.pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::not_found("Outfit not found"));
    }
    Ok(Json(json!(true)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateOutfitBody {
    pub rating: String,
    pub worn_at: Option<NaiveDateTime>,
}

pub async fn rate_outfit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<RateOutfitBody>,
) -> ApiResult<Json<OutfitRow>> {
    if !matches!(body.rating.as_str(), "loved" | "ok" | "didnt_work") {
        return Err(ApiError::validation("rating must be one of loved, ok, didnt_work"));
    }
    let row = sqlx::query_as::<_, OutfitRow>(&format!(
        r#"UPDATE outfit SET rating=$3, worn_at=COALESCE($4, worn_at), updated_at=now()
           WHERE id=$1 AND user_id=$2 AND status='active'
           RETURNING {OUTFIT_COLUMNS}"#
    ))
    .bind(id)
    .bind(&auth.id)
    .bind(&body.rating)
    .bind(body.worn_at)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Outfit not found"))?;
    Ok(Json(row))
}