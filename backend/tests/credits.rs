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

#[sqlx::test(migrations = "./migrations")]
async fn two_users_share_email(pool: sqlx::PgPool) {
    let cu1 = kurasi_backend::auth::ClaimsUser {
        uid: "user-1".to_string(),
        email: Some("shared@test.com".to_string()),
        name: Some("One".to_string()),
        picture: None,
    };
    let cu2 = kurasi_backend::auth::ClaimsUser {
        uid: "user-2".to_string(),
        email: Some("shared@test.com".to_string()),
        name: Some("Two".to_string()),
        picture: None,
    };
    let u1 = kurasi_backend::user::ensure_user(&pool, &cu1)
        .await
        .unwrap();
    let u2 = kurasi_backend::user::ensure_user(&pool, &cu2)
        .await
        .unwrap();
    assert_eq!(u1.id, "user-1");
    assert_eq!(u2.id, "user-2");
    assert_eq!(u1.email, "shared@test.com");
    assert_eq!(u2.email, "shared@test.com");

    for uid in ["user-1", "user-2"] {
        let (onboard_count, credit_count): (i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM onboarding_progress WHERE user_id=$1), \
                    (SELECT count(*) FROM credit_account WHERE user_id=$1)",
        )
        .bind(uid)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(onboard_count, 1);
        assert_eq!(credit_count, 1);
    }
}
