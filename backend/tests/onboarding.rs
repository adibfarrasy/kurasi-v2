mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn unauthenticated_request_is_rejected(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = axum::http::Request::builder()
        .uri("/api/onboarding")
        .body(axum::body::Body::empty())
        .unwrap();
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "UNAUTHORIZED");
}

#[sqlx::test(migrations = "./migrations")]
async fn get_onboarding_returns_provisioned_row(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let req = common::authed_request(Method::GET, "/api/onboarding", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["userId"], "user-a");
    assert_eq!(body["status"], "in_progress");
    assert_eq!(body["biometricsDone"], false);
    assert_eq!(body["starterWardrobeDone"], false);
    assert_eq!(body["allStepsDone"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn complete_onboarding_grants_signup_credits_once(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let req = common::authed_request(
        Method::POST,
        "/api/onboarding",
        "user-a",
        Some(serde_json::json!({})),
    );
    let (status, _) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);

    let balance: i32 = sqlx::query_scalar(
        "SELECT balance FROM credit_account WHERE user_id=$1",
    )
    .bind("user-a")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(balance, 15);

    let second = common::authed_request(
        Method::POST,
        "/api/onboarding",
        "user-a",
        Some(serde_json::json!({})),
    );
    common::send(&app, second).await;
    let grants: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM credit_grant WHERE user_id=$1 AND source='signup'",
    )
    .bind("user-a")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(grants, 1);
}