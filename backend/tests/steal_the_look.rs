mod common;

use axum::http::{Method, StatusCode};
use kurasi_backend::steal_the_look::get_outfit_tone;

#[test]
fn tone_is_warm_cool_neutral() {
    assert_eq!(get_outfit_tone(&["Red".into(), "Beige".into()]), "warm");
    assert_eq!(get_outfit_tone(&["Blue".into(), "Green".into()]), "cool");
    assert_eq!(get_outfit_tone(&["Purple".into(), "Pink".into()]), "neutral");
}

#[sqlx::test(migrations = "./migrations")]
async fn start_requires_default_avatar(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/steal-the-look",
        "user-a",
        Some(serde_json::json!({ "imageBase64": "AAAA", "mimeType": "image/jpeg" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::PRECONDITION_FAILED);
    assert_eq!(body["message"], "User has no defaultAvatarUrl. Run the seed.");
}