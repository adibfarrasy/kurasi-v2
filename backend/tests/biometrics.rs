mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn set_then_get_then_remove_photo(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let set = common::authed_request(
        Method::POST,
        "/api/biometrics",
        "user-a",
        Some(serde_json::json!({ "heightCm": 180, "weightKg": 75 })),
    );
    let (status, body) = common::send(&app, set).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["heightCm"], 180);

    let get = common::authed_request(Method::GET, "/api/biometrics", "user-a", None);
    let (_, body) = common::send(&app, get).await;
    assert_eq!(body["weightKg"], 75);

    let remove = common::authed_request(Method::DELETE, "/api/biometrics/photo", "user-a", None);
    let (status, _) = common::send(&app, remove).await;
    assert_eq!(status, StatusCode::BAD_REQUEST); // facePhotoUrl already null

    sqlx::query("UPDATE user_biometrics SET face_photo_url='https://example.com/f.png' WHERE user_id=$1")
        .bind("user-a")
        .execute(&pool)
        .await
        .unwrap();
    let remove2 = common::authed_request(Method::DELETE, "/api/biometrics/photo", "user-a", None);
    let (status, body) = common::send(&app, remove2).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["facePhotoUrl"], serde_json::Value::Null);
}

#[sqlx::test(migrations = "./migrations")]
async fn set_completes_biometrics_onboarding_step(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    // add 5 items so starter wardrobe done too → allStepsDone after biometrics
    for _ in 0..5 {
        let req = common::authed_request(
            Method::POST,
            "/api/wardrobe/items",
            "user-a",
            Some(serde_json::json!({ "imageUrl": "https://example.com/i.jpg", "category": "shirt" })),
        );
        common::send(&app, req).await;
    }
    let set = common::authed_request(
        Method::POST,
        "/api/biometrics",
        "user-a",
        Some(serde_json::json!({ "heightCm": 170, "weightKg": 65 })),
    );
    common::send(&app, set).await;
    let onboard = common::authed_request(Method::GET, "/api/onboarding", "user-a", None);
    let (_, body) = common::send(&app, onboard).await;
    assert_eq!(body["biometricsDone"], true);
    assert_eq!(body["allStepsDone"], true);
    // signup credits granted by auto-complete
    let balance: i32 = sqlx::query_scalar("SELECT balance FROM credit_account WHERE user_id=$1")
        .bind("user-a")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(balance, 15);
}

#[sqlx::test(migrations = "./migrations")]
async fn set_rejects_out_of_range(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let set = common::authed_request(
        Method::POST,
        "/api/biometrics",
        "user-a",
        Some(serde_json::json!({ "heightCm": 99, "weightKg": 75 })),
    );
    let (status, _) = common::send(&app, set).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}