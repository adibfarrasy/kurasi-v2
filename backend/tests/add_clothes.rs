mod common;

use axum::http::{Method, StatusCode};
use kurasi_backend::analyze_prompts::parse_analysis;

#[test]
fn parses_analysis_reply() {
    let reply = "title: Tan leather lace-up boots\ncategory: footwear\nfit: null\nlength: null\n";
    let parsed = parse_analysis(reply);
    assert_eq!(parsed.kind, "ok");
    assert_eq!(parsed.item.unwrap().category, "footwear");
}

#[test]
fn parses_unsupported_reply() {
    let parsed = parse_analysis("unsupported\n");
    assert_eq!(parsed.kind, "unsupported");
}

#[sqlx::test(migrations = "./migrations")]
async fn upload_creates_session(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/wardrobe/upload",
        "user-a",
        Some(serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["sessionId"].is_string());
}