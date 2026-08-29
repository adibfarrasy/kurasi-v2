mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn request_gap_filling_requires_five_active_items(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/outfit-recommendations",
        "user-a",
        Some(serde_json::json!({ "kind": "gap_filling" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "Need at least 5 active wardrobe items");
}

#[sqlx::test(migrations = "./migrations")]
async fn request_outfit_generation_requires_active_seed(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let seed = common::authed_request(
        Method::POST,
        "/api/outfits",
        "user-a",
        Some(serde_json::json!({ "name": "seed" })),
    );
    let (status, body) = common::send(&app, seed).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "outfit must include at least one piece");

    // request with a nonexistent seed id → NOT_FOUND
    let req = common::authed_request(
        Method::POST,
        "/api/outfit-recommendations",
        "user-a",
        Some(serde_json::json!({ "kind": "outfit_generation", "basedOnOutfitId": "00000000-0000-0000-0000-000000000000" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["message"], "Seed outfit not found");
}

#[sqlx::test(migrations = "./migrations")]
async fn request_insists_kind_has_correct_based_on(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    // gap_filling must omit basedOnOutfitId
    let req = common::authed_request(
        Method::POST,
        "/api/outfit-recommendations",
        "user-a",
        Some(serde_json::json!({ "kind": "gap_filling", "basedOnOutfitId": "00000000-0000-0000-0000-000000000000" })),
    );
    let (status, _) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn request_with_enough_items_inserts_pending_row(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    for _ in 0..5 {
        let req = common::authed_request(
            Method::POST,
            "/api/wardrobe/items",
            "user-a",
            Some(serde_json::json!({ "imageUrl": "https://example.com/i.jpg", "category": "shirt" })),
        );
        common::send(&app, req).await;
    }
    let req = common::authed_request(
        Method::POST,
        "/api/outfit-recommendations",
        "user-a",
        Some(serde_json::json!({ "kind": "gap_filling" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["kind"], "gap_filling");
    assert_eq!(body["status"], "pending");

    let list = common::authed_request(Method::GET, "/api/outfit-recommendations", "user-a", None);
    let (_, body) = common::send(&app, list).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
}