use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::models::{ColorInfo, ItemCategory, ItemFit, ItemLength};
use crate::onboarding;
use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::types::Json as SqlxJson;
use sqlx::{PgPool, QueryBuilder};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct ClothingItemRow {
    pub id: Uuid,
    pub user_id: String,
    pub image_url: String,
    pub original_image_url: Option<String>,
    pub category: String,
    pub colors: SqlxJson<Vec<ColorInfo>>,
    pub brand: Option<String>,
    pub fit: Option<String>,
    pub length: Option<String>,
    pub name: Option<String>,
    pub custom_notes: Option<String>,
    pub owned: bool,
    pub status: String,
    pub removed_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const ITEM_COLUMNS: &str = "id, user_id, image_url, original_image_url, category, colors, brand, \
     fit, length, name, custom_notes, owned, status, removed_at, created_at, updated_at";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClothingItemOut {
    pub id: Uuid,
    pub user_id: String,
    pub image_url: String,
    pub original_image_url: Option<String>,
    pub category: String,
    pub colors: Vec<ColorInfo>,
    pub brand: Option<String>,
    pub fit: Option<String>,
    pub length: Option<String>,
    pub name: Option<String>,
    pub custom_notes: Option<String>,
    pub owned: bool,
    pub status: String,
    pub removed_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub outfit_count: i64,
}

impl ClothingItemOut {
    fn from_row(r: ClothingItemRow, outfit_count: i64) -> Self {
        ClothingItemOut {
            id: r.id,
            user_id: r.user_id,
            image_url: r.image_url,
            original_image_url: r.original_image_url,
            category: r.category,
            colors: r.colors.0,
            brand: r.brand,
            fit: r.fit,
            length: r.length,
            name: r.name,
            custom_notes: r.custom_notes,
            owned: r.owned,
            status: r.status,
            removed_at: r.removed_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
            outfit_count,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateItemBody {
    pub image_url: String,
    pub original_image_url: Option<String>,
    pub category: ItemCategory,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub fit: Option<ItemFit>,
    pub length: Option<ItemLength>,
    pub custom_notes: Option<String>,
    #[serde(default)]
    pub colors: Vec<ColorInfo>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItemBody {
    #[serde(default, deserialize_with = "double_option")]
    pub original_image_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub name: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub brand: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub fit: Option<Option<ItemFit>>,
    #[serde(default, deserialize_with = "double_option")]
    pub length: Option<Option<ItemLength>>,
    #[serde(default, deserialize_with = "double_option")]
    pub custom_notes: Option<Option<String>>,
    pub image_url: Option<String>,
    pub category: Option<ItemCategory>,
    pub colors: Option<Vec<ColorInfo>>,
}

fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<T>::deserialize(deserializer)?))
}

#[derive(Deserialize)]
pub struct DeleteQuery {
    #[serde(rename = "deleteOutfits")]
    pub delete_outfits: Option<bool>,
}

pub async fn list_items(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<ClothingItemOut>>> {
    let rows = sqlx::query_as::<_, ClothingItemRow>(
        &format!(
            "SELECT {ITEM_COLUMNS} FROM clothing_item WHERE user_id=$1 AND status='active' ORDER BY created_at DESC"
        ),
    )
    .bind(&auth.id)
    .fetch_all(&state.pool)
    .await?;
    let counts = outfit_counts(&state.pool, &auth.id).await?;
    let out = rows
        .into_iter()
        .map(|r| {
            let count = counts.get(&r.id).copied().unwrap_or(0);
            ClothingItemOut::from_row(r, count)
        })
        .collect();
    Ok(Json(out))
}

async fn outfit_counts(pool: &PgPool, user_id: &str) -> Result<HashMap<Uuid, i64>, sqlx::Error> {
    let rows: Vec<(Uuid, i64)> = sqlx::query_as(
        r#"SELECT id, count(*) FROM (
             SELECT headwear_id AS id FROM outfit WHERE user_id=$1 AND status='active' AND headwear_id IS NOT NULL
             UNION ALL SELECT base_id FROM outfit WHERE user_id=$1 AND status='active' AND base_id IS NOT NULL
             UNION ALL SELECT outer_id FROM outfit WHERE user_id=$1 AND status='active' AND outer_id IS NOT NULL
             UNION ALL SELECT bottom_id FROM outfit WHERE user_id=$1 AND status='active' AND bottom_id IS NOT NULL
             UNION ALL SELECT footwear_id FROM outfit WHERE user_id=$1 AND status='active' AND footwear_id IS NOT NULL
           ) t GROUP BY id"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

pub async fn get_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Option<ClothingItemOut>>> {
    let row = sqlx::query_as::<_, ClothingItemRow>(&format!(
        "SELECT {ITEM_COLUMNS} FROM clothing_item WHERE id=$1 AND user_id=$2 AND status <> 'removed'"
    ))
    .bind(id)
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row.map(|r| ClothingItemOut::from_row(r, 0))))
}

pub async fn create_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateItemBody>,
) -> ApiResult<Json<ClothingItemOut>> {
    let row = sqlx::query_as::<_, ClothingItemRow>(&format!(
        r#"INSERT INTO clothing_item (id, user_id, image_url, original_image_url, category, colors, brand, fit, length, name, custom_notes)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING {ITEM_COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(&body.image_url)
    .bind(&body.original_image_url)
    .bind(body.category.as_str())
    .bind(SqlxJson(&body.colors))
    .bind(&body.brand)
    .bind(body.fit.map(|f| f.as_str()))
    .bind(body.length.map(|l| l.as_str()))
    .bind(&body.name)
    .bind(&body.custom_notes)
    .fetch_one(&state.pool)
    .await?;
    onboarding::complete_starter_wardrobe_step(&state.pool, &auth.id).await?;
    Ok(Json(ClothingItemOut::from_row(row, 0)))
}

pub async fn update_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateItemBody>,
) -> ApiResult<Json<ClothingItemOut>> {
    let mut qb = QueryBuilder::new("UPDATE clothing_item SET updated_at=now()");
    if let Some(v) = body.image_url {
        qb.push(", image_url = ");
        qb.push_bind(v);
    }
    match body.original_image_url {
        Some(Some(v)) => {
            qb.push(", original_image_url = ");
            qb.push_bind(v);
        }
        Some(None) => {
            qb.push(", original_image_url = NULL");
        }
        None => {}
    }
    if let Some(v) = body.category {
        qb.push(", category = ");
        qb.push_bind(v.as_str());
    }
    match body.name {
        Some(Some(v)) => {
            qb.push(", name = ");
            qb.push_bind(v);
        }
        Some(None) => {
            qb.push(", name = NULL");
        }
        None => {}
    }
    match body.brand {
        Some(Some(v)) => {
            qb.push(", brand = ");
            qb.push_bind(v);
        }
        Some(None) => {
            qb.push(", brand = NULL");
        }
        None => {}
    }
    match body.fit {
        Some(Some(v)) => {
            qb.push(", fit = ");
            qb.push_bind(v.as_str());
        }
        Some(None) => {
            qb.push(", fit = NULL");
        }
        None => {}
    }
    match body.length {
        Some(Some(v)) => {
            qb.push(", length = ");
            qb.push_bind(v.as_str());
        }
        Some(None) => {
            qb.push(", length = NULL");
        }
        None => {}
    }
    match body.custom_notes {
        Some(Some(v)) => {
            qb.push(", custom_notes = ");
            qb.push_bind(v);
        }
        Some(None) => {
            qb.push(", custom_notes = NULL");
        }
        None => {}
    }
    if let Some(v) = body.colors {
        qb.push(", colors = ");
        qb.push_bind(SqlxJson(v));
    }
    qb.push(" WHERE id = ");
    qb.push_bind(id);
    qb.push(" AND user_id = ");
    qb.push_bind(&auth.id);
    qb.push(" RETURNING ");
    qb.push(ITEM_COLUMNS);

    let row = qb
        .build_query_as::<ClothingItemRow>()
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::not_found("Clothing item not found"))?;
    Ok(Json(ClothingItemOut::from_row(row, 0)))
}

pub async fn delete_item(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Query(q): Query<DeleteQuery>,
) -> ApiResult<Json<ClothingItemOut>> {
    if q.delete_outfits.unwrap_or(false) {
        delete_item_and_outfits(&state.pool, &auth.id, id).await
    } else {
        delete_item_preserving(&state.pool, &auth.id, id).await
    }
}

async fn delete_item_preserving(
    pool: &PgPool,
    user_id: &str,
    id: Uuid,
) -> ApiResult<Json<ClothingItemOut>> {
    let row = sqlx::query_as::<_, ClothingItemRow>(&format!(
        r#"UPDATE clothing_item SET status='removed', removed_at=now(), updated_at=now()
           WHERE id=$1 AND user_id=$2 AND status <> 'removed'
           RETURNING {ITEM_COLUMNS}"#
    ))
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::not_found("Clothing item not found or already removed"))?;
    Ok(Json(ClothingItemOut::from_row(row, 0)))
}

async fn delete_item_and_outfits(
    pool: &PgPool,
    user_id: &str,
    id: Uuid,
) -> ApiResult<Json<ClothingItemOut>> {
    let mut tx = pool.begin().await?;
    sqlx::query_as::<_, ClothingItemRow>(&format!(
        r#"SELECT {ITEM_COLUMNS} FROM clothing_item
           WHERE id=$1 AND user_id=$2 AND status <> 'removed'"#
    ))
    .bind(id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::not_found("Clothing item not found or already removed"))?;

    sqlx::query(
        r#"UPDATE outfit SET status='deleted', deleted_at=now(), updated_at=now()
           WHERE user_id=$1 AND status='active'
             AND (headwear_id=$2 OR base_id=$2 OR outer_id=$2 OR bottom_id=$2 OR footwear_id=$2)"#,
    )
    .bind(user_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    let removed = sqlx::query_as::<_, ClothingItemRow>(&format!(
        r#"UPDATE clothing_item SET status='removed', removed_at=now(), updated_at=now()
           WHERE id=$1 AND user_id=$2
           RETURNING {ITEM_COLUMNS}"#
    ))
    .bind(id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(ClothingItemOut::from_row(removed, 0)))
}
