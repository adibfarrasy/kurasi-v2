mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn get_returns_trial_access_when_no_subscription(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/subscription", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["isInTrial"], true);
    assert_eq!(body["hasAccess"], true);
    assert!(body["subscription"].is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn start_then_cancel_then_cannot_start(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let start = common::authed_request(
        Method::POST,
        "/api/subscription",
        "user-a",
        Some(serde_json::json!({})),
    );
    let (status, body) = common::send(&app, start).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subscription"]["status"], "active");
    assert_eq!(body["isCurrent"], true);

    let again = common::authed_request(
        Method::POST,
        "/api/subscription",
        "user-a",
        Some(serde_json::json!({})),
    );
    let (status, _) = common::send(&app, again).await;
    assert_eq!(status, StatusCode::CONFLICT);

    let cancel = common::authed_request(Method::POST, "/api/subscription/cancel", "user-a", None);
    let (status, body) = common::send(&app, cancel).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subscription"]["status"], "cancelled");
}

#[sqlx::test(migrations = "./migrations")]
async fn renew_failure_enters_grace_then_lapse(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let start = common::authed_request(
        Method::POST,
        "/api/subscription",
        "user-a",
        Some(serde_json::json!({})),
    );
    common::send(&app, start).await;

    let fail = common::authed_request(
        Method::POST,
        "/api/subscription/renew-failure",
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, fail).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subscription"]["status"], "grace");

    // backdate graceEndsAt so lapse applies
    sqlx::query(
        "UPDATE subscription SET grace_ends_at = now() - interval '1 day' WHERE user_id=$1",
    )
    .bind("user-a")
    .execute(&pool)
    .await
    .unwrap();
    let lapse = common::authed_request(
        Method::POST,
        "/api/subscription/lapse-grace",
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, lapse).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["lapsedCount"], 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn renew_success_from_grace_reinstates(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let start = common::authed_request(
        Method::POST,
        "/api/subscription",
        "user-a",
        Some(serde_json::json!({})),
    );
    common::send(&app, start).await;
    let fail = common::authed_request(
        Method::POST,
        "/api/subscription/renew-failure",
        "user-a",
        None,
    );
    common::send(&app, fail).await;

    let renew = common::authed_request(
        Method::POST,
        "/api/subscription/renew-success",
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, renew).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["subscription"]["status"], "active");
    assert_eq!(body["subscription"]["graceEndsAt"], serde_json::Value::Null);
    assert_eq!(body["isCurrent"], true);
}
