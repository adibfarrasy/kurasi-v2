use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{Method, Request, StatusCode};
use kurasi_backend::app::{build_router, AppState};
use kurasi_backend::auth::{Authenticator, FirebaseUser};
use kurasi_backend::error::ApiError;
use sqlx::PgPool;
use std::sync::Arc;
use tower::ServiceExt;

pub struct TestAuthenticator;

#[async_trait::async_trait]
impl Authenticator for TestAuthenticator {
    async fn verify(&self, token: &str) -> Result<FirebaseUser, ApiError> {
        let uid = token
            .strip_prefix("t-")
            .filter(|s| !s.is_empty())
            .ok_or_else(ApiError::unauthorized)?
            .to_string();
        Ok(FirebaseUser {
            uid: uid.clone(),
            email: Some(format!("{uid}@test.com")),
            name: Some(uid.clone()),
            picture: None,
        })
    }
}

pub fn test_app(pool: PgPool) -> axum::Router {
    build_router(AppState::new(pool, Arc::new(TestAuthenticator)))
}

pub fn authed_request(
    method: Method,
    uri: &str,
    uid: &str,
    body: Option<serde_json::Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(AUTHORIZATION, format!("Bearer t-{uid}"));
    if let Some(json) = body {
        builder = builder.header(CONTENT_TYPE, "application/json");
        return builder
            .body(Body::from(json.to_string()))
            .unwrap();
    }
    builder.body(Body::empty()).unwrap()
}

pub async fn send(
    app: &axum::Router,
    req: Request<Body>,
) -> (StatusCode, serde_json::Value) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json)
}