mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn publish_then_discover(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    // user-a creates an item + outfit
    let create_item = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({ "imageUrl": "https://example.com/s.jpg", "category": "shirt" })),
    );
    let (_, item) = common::send(&app, create_item).await;
    let item_id = item["id"].as_str().unwrap().to_string();
    let create_outfit = common::authed_request(
        Method::POST,
        "/api/outfits",
        "user-a",
        Some(serde_json::json!({ "name": "Fit", "baseId": item_id })),
    );
    let (_, outfit) = common::send(&app, create_outfit).await;
    let outfit_id = outfit["id"].as_str().unwrap().to_string();

    let publish = common::authed_request(
        Method::POST,
        "/api/shared-outfits/publish",
        "user-a",
        Some(serde_json::json!({ "outfitId": outfit_id, "faceAnonymisation": "none", "showUsername": true })),
    );
    let (status, body) = common::send(&app, publish).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "published");

    // user-b discovers (user-a's row visible to others)
    let discover = common::authed_request(Method::GET, "/api/shared-outfits", "user-b", None);
    let (status, body) = common::send(&app, discover).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["outfit"]["id"], outfit_id);

    // user-a does not discover their own
    let discover_a = common::authed_request(Method::GET, "/api/shared-outfits", "user-a", None);
    let (_, body) = common::send(&app, discover_a).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn unpublish_and_find_by_outfit(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create_item = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({ "imageUrl": "https://example.com/s.jpg", "category": "shirt" })),
    );
    let (_, item) = common::send(&app, create_item).await;
    let item_id = item["id"].as_str().unwrap().to_string();
    let create_outfit = common::authed_request(
        Method::POST,
        "/api/outfits",
        "user-a",
        Some(serde_json::json!({ "baseId": item_id })),
    );
    let (_, outfit) = common::send(&app, create_outfit).await;
    let outfit_id = outfit["id"].as_str().unwrap().to_string();

    let publish = common::authed_request(
        Method::POST,
        "/api/shared-outfits/publish",
        "user-a",
        Some(serde_json::json!({ "outfitId": outfit_id, "faceAnonymisation": "none", "showUsername": false })),
    );
    common::send(&app, publish).await;

    let find = common::authed_request(
        Method::GET,
        &format!("/api/shared-outfits/by-outfit/{outfit_id}"),
        "user-a",
        None,
    );
    let (_, body) = common::send(&app, find).await;
    assert_eq!(body["outfitId"], outfit_id);

    let unpublish = common::authed_request(
        Method::POST,
        "/api/shared-outfits/unpublish",
        "user-a",
        Some(serde_json::json!({ "outfitId": outfit_id })),
    );
    let (status, _) = common::send(&app, unpublish).await;
    assert_eq!(status, StatusCode::OK);

    let find2 = common::authed_request(
        Method::GET,
        &format!("/api/shared-outfits/by-outfit/{outfit_id}"),
        "user-a",
        None,
    );
    let (_, body) = common::send(&app, find2).await;
    assert_eq!(body["status"], "unpublished");
}

#[sqlx::test(migrations = "./migrations")]
async fn publish_rejects_missing_outfit(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let publish = common::authed_request(
        Method::POST,
        "/api/shared-outfits/publish",
        "user-a",
        Some(serde_json::json!({ "outfitId": "00000000-0000-0000-0000-000000000000", "faceAnonymisation": "none", "showUsername": false })),
    );
    let (status, body) = common::send(&app, publish).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["message"], "Outfit not found");
}