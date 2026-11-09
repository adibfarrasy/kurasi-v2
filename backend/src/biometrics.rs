use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::onboarding;
use axum::extract::State;
use axum::Json;
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(sqlx::FromRow, Serialize)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "camelCase")]
pub struct BiometricsRow {
    pub user_id: String,
    pub height_cm: i32,
    pub weight_kg: i32,
    pub face_photo_url: Option<String>,
    pub default_avatar_url: Option<String>,
    pub default_avatar_turntable_url: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

const COLUMNS: &str =
    "user_id, height_cm, weight_kg, face_photo_url, default_avatar_url, default_avatar_turntable_url, created_at, updated_at";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBody {
    pub height_cm: i32,
    pub weight_kg: i32,
    pub face_photo_url: Option<String>,
}

pub async fn get(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Option<BiometricsRow>>> {
    let row = sqlx::query_as::<_, BiometricsRow>(&format!(
        "SELECT {COLUMNS} FROM user_biometrics WHERE user_id=$1"
    ))
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row))
}

pub async fn set(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SetBody>,
) -> ApiResult<Json<BiometricsRow>> {
    if !(130..=220).contains(&body.height_cm) || !(30..=200).contains(&body.weight_kg) {
        return Err(ApiError::validation(
            "heightCm must be 130-220 and weightKg must be 30-200",
        ));
    }
    let row = sqlx::query_as::<_, BiometricsRow>(&format!(
        r#"INSERT INTO user_biometrics (user_id, height_cm, weight_kg, face_photo_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET height_cm=EXCLUDED.height_cm, weight_kg=EXCLUDED.weight_kg, face_photo_url=EXCLUDED.face_photo_url, updated_at=now()
           RETURNING {COLUMNS}"#
    ))
    .bind(&auth.id)
    .bind(body.height_cm)
    .bind(body.weight_kg)
    .bind(&body.face_photo_url)
    .fetch_one(&state.pool)
    .await?;

    let pending: Option<String> = sqlx::query_scalar(
        "SELECT user_id FROM onboarding_progress WHERE user_id=$1 AND biometrics_completed_at IS NULL",
    )
    .bind(&auth.id)
    .fetch_optional(&state.pool)
    .await?;
    if pending.is_some() {
        sqlx::query(
            "UPDATE onboarding_progress SET biometrics_completed_at=now(), updated_at=now() WHERE user_id=$1",
        )
        .bind(&auth.id)
        .execute(&state.pool)
        .await?;
        onboarding::maybe_complete_onboarding(&state.pool, &auth.id).await?;
    }
    Ok(Json(row))
}

pub async fn remove_photo(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Value>> {
    let current: Option<Option<String>> =
        sqlx::query_scalar("SELECT face_photo_url FROM user_biometrics WHERE user_id=$1")
            .bind(&auth.id)
            .fetch_optional(&state.pool)
            .await?;
    match current {
        None => Err(ApiError::not_found("Biometrics not set")),
        Some(None) => Err(ApiError::bad_request("Face photo is already not set")),
        Some(Some(_)) => {
            let row = sqlx::query_as::<_, BiometricsRow>(&format!(
                "UPDATE user_biometrics SET face_photo_url=NULL, updated_at=now() WHERE user_id=$1 RETURNING {COLUMNS}"
            ))
            .bind(&auth.id)
            .fetch_one(&state.pool)
            .await?;
            Ok(Json(json!(row)))
        }
    }
}
