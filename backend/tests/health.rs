mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn health_is_unauthenticated_and_ok(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = axum::http::Request::builder()
        .uri("/health")
        .body(axum::body::Body::empty())
        .unwrap();
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
}

#[sqlx::test(migrations = "./migrations")]
async fn api_requires_bearer_token(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = axum::http::Request::builder()
        .uri("/api/credits")
        .body(axum::body::Body::empty())
        .unwrap();
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "UNAUTHORIZED");
}

#[sqlx::test(migrations = "./migrations")]
async fn unknown_api_route_returns_404(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/does-not-exist", "user-a", None);
    let (status, _) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}