mod common;

use axum::http::{Method, StatusCode};
use kurasi_backend::normalize_prompts::parse_build;

#[test]
fn parses_build_reply() {
    assert_eq!(parse_build("build: lean\nnotes: narrow frame"), "lean");
    assert_eq!(parse_build("unknown stuff"), "average");
}

#[sqlx::test(migrations = "./migrations")]
async fn normalize_creates_session_and_persists_avatar_on_done(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg", "gender": "masc" }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["sessionId"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn progress_returns_error_for_missing_session(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::GET,
        "/api/avatar/normalize/00000000-0000-0000-0000-000000000000",
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["phase"], "error");
    assert_eq!(
        body["message"],
        "Session not found (server may have restarted)"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_invalid_gender(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg", "gender": "other" }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["message"], "gender must be masc or femme");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_height_out_of_range(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg", "gender": "masc", "heightCm": 300 }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["message"], "heightCm must be between 130 and 220");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_weight_out_of_range(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg", "gender": "masc", "weightKg": 10 }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["message"], "weightKg must be between 30 and 200");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_bad_mime(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/gif", "gender": "masc" }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body["message"],
        "mimeType must be image/jpeg, image/png, or image/webp"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn start_rejects_bad_base64(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/avatar/normalize",
        "user-a",
        Some(
            serde_json::json!({ "imageBase64": "!!!", "mimeType": "image/jpeg", "gender": "masc" }),
        ),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["message"], "imageBase64 is not valid base64");
}

#[sqlx::test(migrations = "./migrations")]
async fn persist_default_avatar_writes_url(pool: sqlx::PgPool) {
    sqlx::query(
        r#"INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, trial_started_at)
           VALUES ('user-a', 'Test User', 'user-a@test.com', true, now(), now(), now())"#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_biometrics (user_id, height_cm, weight_kg) VALUES ('user-a', 170, 65)",
    )
    .execute(&pool)
    .await
    .unwrap();
    kurasi_backend::normalize_avatar::persist_default_avatar(
        &pool,
        "user-a",
        "https://example.com/avatar.png",
    )
    .await;
    let url: Option<String> =
        sqlx::query_scalar("SELECT default_avatar_url FROM user_biometrics WHERE user_id='user-a'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(url.as_deref(), Some("https://example.com/avatar.png"));
}
