use crate::app::AppState;
use crate::error::{ApiError, ApiResult};
use crate::user;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::HeaderMap;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> ApiResult<Self> {
        let token = extract_bearer(&parts.headers).ok_or_else(ApiError::unauthorized)?;
        let fb = state
            .authenticator
            .verify(token)
            .await
            .map_err(|_| ApiError::unauthorized())?;
        let db_user = user::ensure_user(&state.pool, &fb)
            .await
            .map_err(ApiError::internal_err)?;
        Ok(AuthUser {
            id: db_user.id,
            email: Some(db_user.email),
            name: Some(db_user.name),
            picture: db_user.image,
        })
    }
}

fn extract_bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}
