mod common;

use axum::http::{Method, StatusCode};

async fn seed_user_with_avatar(pool: &sqlx::PgPool, user_id: &str, avatar_url: Option<&str>) {
    sqlx::query(
        r#"INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, trial_started_at)
           VALUES ($1, 'Test User', $2, true, now(), now(), now())"#,
    )
    .bind(user_id)
    .bind(format!("{user_id}@test.com"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_biometrics (user_id, height_cm, weight_kg, default_avatar_url) VALUES ($1, 170, 65, $2)",
    )
    .bind(user_id)
    .bind(avatar_url)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "./migrations")]
async fn start_requires_avatar_and_validates_items(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    // no avatar → 412
    let req = common::authed_request(
        Method::POST,
        "/api/outfits/00000000-0000-0000-0000-000000000000/regenerate-fit",
        "user-a",
        Some(serde_json::json!({ "items": [{ "category": "shirt", "imageUrl": "https://example.com/s.png" }] })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::PRECONDITION_FAILED);
    assert_eq!(body["message"], "User has no defaultAvatarUrl. Run the seed.");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_with_null_avatar_returns_412(pool: sqlx::PgPool) {
    seed_user_with_avatar(&pool, "user-a", None).await;
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/outfits/00000000-0000-0000-0000-000000000000/regenerate-fit",
        "user-a",
        Some(serde_json::json!({ "items": [{ "category": "shirt", "imageUrl": "https://example.com/s.png" }] })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::PRECONDITION_FAILED);
    assert_eq!(body["message"], "User has no defaultAvatarUrl. Run the seed.");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_empty_items(pool: sqlx::PgPool) {
    seed_user_with_avatar(&pool, "user-a", Some("https://example.com/avatar.png")).await;
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/outfits/00000000-0000-0000-0000-000000000000/regenerate-fit",
        "user-a",
        Some(serde_json::json!({ "items": [] })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "dressAvatar requires at least one garment");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_too_many_items(pool: sqlx::PgPool) {
    seed_user_with_avatar(&pool, "user-a", Some("https://example.com/avatar.png")).await;
    let app = common::test_app(pool);
    let items: Vec<_> = (0..6)
        .map(|i| {
            serde_json::json!({
                "category": "shirt",
                "imageUrl": format!("https://example.com/{i}.png"),
            })
        })
        .collect();
    let req = common::authed_request(
        Method::POST,
        "/api/outfits/00000000-0000-0000-0000-000000000000/regenerate-fit",
        "user-a",
        Some(serde_json::json!({ "items": items })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "dressAvatar accepts at most 5 items");
}

#[sqlx::test(migrations = "./migrations")]
async fn progress_returns_error_for_missing_session(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::GET,
        "/api/outfits/regenerate-fit/00000000-0000-0000-0000-000000000000",
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["phase"], "error");
    assert_eq!(body["message"], "Session not found (server may have restarted)");
}