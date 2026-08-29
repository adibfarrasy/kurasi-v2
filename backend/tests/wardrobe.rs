mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn list_is_empty_for_fresh_user(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/wardrobe/items", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, serde_json::json!([]));
}

#[sqlx::test(migrations = "./migrations")]
async fn create_then_list_returns_item(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({
            "imageUrl": "https://example.com/item.jpg",
            "originalImageUrl": null,
            "category": "shirt",
            "name": "Black Hoodie",
            "brand": null,
            "fit": "oversize",
            "length": null,
            "customNotes": null,
            "colors": [{ "name": "black", "hex": "#1a1a1a", "ratio": 100 }]
        })),
    );
    let (status, created) = common::send(&app, create).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created["category"], "shirt");
    assert_eq!(created["name"], "Black Hoodie");
    assert_eq!(created["outfitCount"], 0);
    assert_eq!(created["status"], "active");

    let list = common::authed_request(Method::GET, "/api/wardrobe/items", "user-a", None);
    let (_, body) = common::send(&app, list).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn update_item_patches_fields(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({
            "imageUrl": "https://example.com/item.jpg",
            "category": "shirt"
        })),
    );
    let (_, created) = common::send(&app, create).await;
    let id = created["id"].as_str().unwrap().to_string();

    let update = common::authed_request(
        Method::PATCH,
        &format!("/api/wardrobe/items/{id}"),
        "user-a",
        Some(serde_json::json!({ "name": "Renamed" })),
    );
    let (status, body) = common::send(&app, update).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Renamed");
    assert_eq!(body["category"], "shirt");
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_soft_removes_and_preserves_outfits(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({
            "imageUrl": "https://example.com/item.jpg",
            "category": "pants"
        })),
    );
    let (_, created) = common::send(&app, create).await;
    let id = created["id"].as_str().unwrap().to_string();

    let del = common::authed_request(Method::DELETE, &format!("/api/wardrobe/items/{id}"), "user-a", None);
    let (status, body) = common::send(&app, del).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "removed");

    let list = common::authed_request(Method::GET, "/api/wardrobe/items", "user-a", None);
    let (_, body) = common::send(&app, list).await;
    assert_eq!(body.as_array().unwrap().len(), 0);

    let again = common::authed_request(Method::DELETE, &format!("/api/wardrobe/items/{id}"), "user-a", None);
    let (status, _) = common::send(&app, again).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn creating_five_items_completes_starter_wardrobe_step(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    for _ in 0..5 {
        let req = common::authed_request(
            Method::POST,
            "/api/wardrobe/items",
            "user-a",
            Some(serde_json::json!({ "imageUrl": "https://example.com/item.jpg", "category": "shirt" })),
        );
        common::send(&app, req).await;
    }
    let onboard = common::authed_request(Method::GET, "/api/onboarding", "user-a", None);
    let (_, body) = common::send(&app, onboard).await;
    assert_eq!(body["starterWardrobeDone"], true);
    assert_eq!(body["allStepsDone"], false);
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_other_users_item_is_not_found(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({ "imageUrl": "https://example.com/item.jpg", "category": "shirt" })),
    );
    let (_, created) = common::send(&app, create).await;
    let id = created["id"].as_str().unwrap().to_string();

    let del = common::authed_request(Method::DELETE, &format!("/api/wardrobe/items/{id}"), "user-b", None);
    let (status, _) = common::send(&app, del).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}