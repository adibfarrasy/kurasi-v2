mod common;

use axum::http::{Method, StatusCode};

async fn seed_card(pool: &sqlx::PgPool, url: &str, attribution: &str) -> String {
    let id: String = sqlx::query_scalar(
        "INSERT INTO style_card (id, image_url, source_attribution) VALUES (gen_random_uuid(), $1, $2) RETURNING id::text",
    )
    .bind(url)
    .bind(attribution)
    .fetch_one(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test(migrations = "./migrations")]
async fn create_then_feed_excludes_interacted(pool: sqlx::PgPool) {
    let app = common::test_app(pool);
    let c1 = common::authed_request(
        Method::POST,
        "/api/style-cards",
        "user-a",
        Some(serde_json::json!({ "imageUrl": "https://example.com/1.jpg", "sourceAttribution": "src1" })),
    );
    let (_, created) = common::send(&app, c1).await;
    assert_eq!(created["status"], "active");

    let feed = common::authed_request(Method::GET, "/api/style-cards/feed", "user-a", None);
    let (_, body) = common::send(&app, feed).await;
    assert_eq!(body["items"].as_array().unwrap().len(), 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn retire_is_soft(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let id = seed_card(&pool, "https://example.com/1.jpg", "src1").await;
    let retire = common::authed_request(Method::POST, &format!("/api/style-cards/{id}/retire"), "user-a", None);
    let (status, body) = common::send(&app, retire).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "retired");

    let again = common::authed_request(Method::POST, &format!("/api/style-cards/{id}/retire"), "user-a", None);
    let (status, _) = common::send(&app, again).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let find = common::authed_request(Method::GET, &format!("/api/style-cards/{id}"), "user-a", None);
    let (status, body) = common::send(&app, find).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "retired");
}

#[sqlx::test(migrations = "./migrations")]
async fn feed_paginates_by_cursor(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    for i in 0..3 {
        let _ = seed_card(&pool, &format!("https://example.com/{i}.jpg"), &format!("s{i}")).await;
    }
    let feed = common::authed_request(Method::GET, "/api/style-cards/feed?limit=2", "user-a", None);
    let (_, body) = common::send(&app, feed).await;
    assert_eq!(body["items"].as_array().unwrap().len(), 2);
    let cursor = body["nextCursor"].as_str().unwrap().to_string();
    let feed2 = common::authed_request(
        Method::GET,
        &format!("/api/style-cards/feed?limit=2&cursor={cursor}"),
        "user-a",
        None,
    );
    let (_, body2) = common::send(&app, feed2).await;
    assert_eq!(body2["items"].as_array().unwrap().len(), 1);
    assert!(body2["nextCursor"].is_null());
}