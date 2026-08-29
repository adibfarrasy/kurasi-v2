mod common;

use axum::http::{Method, StatusCode};

async fn seed_item(pool: &sqlx::PgPool, user: &str) -> String {
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, created_at, updated_at, trial_started_at) \
         VALUES ($1, $1, $1 || '@test.com', now(), now(), now()) \
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(user)
    .execute(pool)
    .await
    .unwrap();
    let id: String = sqlx::query_scalar(
        "INSERT INTO clothing_item (id, user_id, image_url, category) VALUES (gen_random_uuid(), $1, 'https://example.com/i.jpg', 'shirt') RETURNING id::text",
    )
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test(migrations = "./migrations")]
async fn upsert_then_get_then_remove(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let item_id = seed_item(&pool, "user-a").await;
    let upsert = common::authed_request(
        Method::PUT,
        &format!("/api/fit-adjustments/{item_id}"),
        "user-a",
        Some(serde_json::json!({ "length": "true_to_size", "width": "tighter", "customNotes": "fits well" })),
    );
    let (status, body) = common::send(&app, upsert).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["length"], "true_to_size");

    let get = common::authed_request(Method::GET, &format!("/api/fit-adjustments/{item_id}"), "user-a", None);
    let (status, body) = common::send(&app, get).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["width"], "tighter");

    let del = common::authed_request(Method::DELETE, &format!("/api/fit-adjustments/{item_id}"), "user-a", None);
    let (status, _) = common::send(&app, del).await;
    assert_eq!(status, StatusCode::OK);

    let get2 = common::authed_request(Method::GET, &format!("/api/fit-adjustments/{item_id}"), "user-a", None);
    let (_, body) = common::send(&app, get2).await;
    assert!(body.is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn upsert_rejects_removed_item(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let item_id = seed_item(&pool, "user-a").await;
    sqlx::query("UPDATE clothing_item SET status='removed' WHERE id=$1")
        .bind(uuid::Uuid::parse_str(&item_id).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let upsert = common::authed_request(
        Method::PUT,
        &format!("/api/fit-adjustments/{item_id}"),
        "user-a",
        Some(serde_json::json!({ "length": "true_to_size" })),
    );
    let (status, body) = common::send(&app, upsert).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "Cannot adjust a removed item");
}

#[sqlx::test(migrations = "./migrations")]
async fn upsert_other_users_item_not_found(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let item_id = seed_item(&pool, "user-b").await;
    let upsert = common::authed_request(
        Method::PUT,
        &format!("/api/fit-adjustments/{item_id}"),
        "user-a",
        Some(serde_json::json!({ "length": "true_to_size" })),
    );
    let (status, _) = common::send(&app, upsert).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}