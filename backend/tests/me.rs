mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn me_returns_profile_and_access(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/me", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "user-a");
    assert_eq!(body["email"], "user-a@test.com");
    assert_eq!(body["emailVerified"], true);
    assert_eq!(body["isInTrial"], true);
    assert_eq!(body["hasAccess"], true);
}

#[sqlx::test(migrations = "./migrations")]
async fn me_requires_auth(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = axum::http::Request::builder()
        .uri("/api/me")
        .body(axum::body::Body::empty())
        .unwrap();
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "UNAUTHORIZED");
}
