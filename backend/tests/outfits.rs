mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn create_requires_at_least_one_slot(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(
        Method::POST,
        "/api/outfits",
        "user-a",
        Some(serde_json::json!({ "name": "Empty" })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "outfit must include at least one piece");
}

#[sqlx::test(migrations = "./migrations")]
async fn create_with_owned_item_and_list(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    // create a shirt item
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
        Some(serde_json::json!({ "name": "My Fit", "baseId": item_id })),
    );
    let (status, created) = common::send(&app, create_outfit).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created["baseId"], item_id);

    let list = common::authed_request(Method::GET, "/api/outfits", "user-a", None);
    let (_, body) = common::send(&app, list).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_rejects_other_users_item(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create_item = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-b",
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
    let (status, body) = common::send(&app, create_outfit).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "slot item not available");
}

#[sqlx::test(migrations = "./migrations")]
async fn rate_and_delete(pool: sqlx::PgPool) {
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

    let rate = common::authed_request(
        Method::POST,
        &format!("/api/outfits/{outfit_id}/rate"),
        "user-a",
        Some(serde_json::json!({ "rating": "loved", "wornAt": "2026-08-01T00:00:00" })),
    );
    let (status, body) = common::send(&app, rate).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["rating"], "loved");

    let del = common::authed_request(
        Method::DELETE,
        &format!("/api/outfits/{outfit_id}"),
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, del).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, serde_json::json!(true));

    let list = common::authed_request(Method::GET, "/api/outfits", "user-a", None);
    let (_, body) = common::send(&app, list).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn save_from_tryon_with_ai_item(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let req = common::authed_request(
        Method::POST,
        "/api/outfits/from-tryon",
        "user-a",
        Some(serde_json::json!({
            "name": null,
            "heroImageUrl": "https://example.com/hero.png",
            "slots": [{
                "category": "shirt",
                "aiItem": {
                    "imageUrl": "https://example.com/ai.png",
                    "category": "shirt",
                    "brand": null,
                    "fit": null,
                    "length": null,
                    "colors": [{ "name": "black", "hex": "#1a1a1a", "ratio": 1.0 }]
                }
            }]
        })),
    );
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["heroImageUrl"], "https://example.com/hero.png");
    assert!(body["baseId"].is_string());

    let items: i64 =
        sqlx::query_scalar("SELECT count(*) FROM clothing_item WHERE user_id=$1 AND owned=false")
            .bind("user-a")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(items, 1);
}
