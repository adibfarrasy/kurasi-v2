mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn get_credits_returns_zero_for_fresh_user(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/credits", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["balance"], 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn purchase_increments_balance_and_records_grant(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let req = common::authed_request(
        Method::POST,
        "/api/credits/purchase",
        "user-a",
        Some(serde_json::json!({ "amount": 100 })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["balance"], 100);

    let grants: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM credit_grant WHERE user_id=$1 AND source='purchase'",
    )
    .bind("user-a")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(grants, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn purchase_rejects_non_positive_amount(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/credits/purchase",
        "user-a",
        Some(serde_json::json!({ "amount": 0 })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "VALIDATION");
}