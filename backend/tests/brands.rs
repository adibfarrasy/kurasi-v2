mod common;

use axum::http::{Method, StatusCode};

#[sqlx::test(migrations = "./migrations")]
async fn bundled_brands_returned(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let req = common::authed_request(Method::GET, "/api/brands", "user-a", None);
    let (status, body) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    let arr = body.as_array().unwrap();
    assert!(arr.len() >= 43);
    assert!(arr.iter().any(|b| b == "Nike"));
    assert!(arr.iter().any(|b| b == "Zara"));
}

#[sqlx::test(migrations = "./migrations")]
async fn user_brand_appears_in_list(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let create = common::authed_request(
        Method::POST,
        "/api/wardrobe/items",
        "user-a",
        Some(serde_json::json!({ "imageUrl": "https://example.com/s.jpg", "category": "shirt", "brand": "custom-co" })),
    );
    common::send(&app, create).await;
    let req = common::authed_request(Method::GET, "/api/brands", "user-a", None);
    let (_, body) = common::send(&app, req).await;
    let arr = body.as_array().unwrap();
    assert!(arr.iter().any(|b| b == "custom-co"));
}