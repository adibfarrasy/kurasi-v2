mod common;

use axum::http::{Method, StatusCode};

async fn seed_card(pool: &sqlx::PgPool) -> String {
    let id: String = sqlx::query_scalar(
        "INSERT INTO style_card (id, image_url, source_attribution) VALUES (gen_random_uuid(), 'https://example.com/1.jpg', 's') RETURNING id::text",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test(migrations = "./migrations")]
async fn like_creates_interaction_and_saved_style(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    let like = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    let (status, body) = common::send(&app, like).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["interaction"]["kind"], "liked");
    assert!(body["saved"]["savedId"].is_string());

    let saved: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM saved_style WHERE user_id=$1 AND card_id=$2::uuid",
    )
    .bind("user-a")
    .bind(card_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(saved, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn like_twice_is_idempotent(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    for _ in 0..2 {
        let like = common::authed_request(
            Method::POST,
            "/api/style-interactions/like",
            "user-a",
            Some(serde_json::json!({ "cardId": &card_id })),
        );
        let (status, body) = common::send(&app, like).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["interaction"]["kind"], "liked");
        assert!(body["saved"]["savedId"].is_string());
    }

    let saved: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM saved_style WHERE user_id=$1 AND card_id=$2::uuid",
    )
    .bind("user-a")
    .bind(card_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(saved, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn like_after_removing_save_reinserts(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    let like = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    let (status, _) = common::send(&app, like).await;
    assert_eq!(status, StatusCode::OK);

    let remove = common::authed_request(
        Method::DELETE,
        &format!("/api/saved-styles/{card_id}"),
        "user-a",
        None,
    );
    let (status, _) = common::send(&app, remove).await;
    assert_eq!(status, StatusCode::OK);

    let like_again = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    let (status, body) = common::send(&app, like_again).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["interaction"]["kind"], "liked");
    assert!(body["saved"]["savedId"].is_string());

    let saved: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM saved_style WHERE user_id=$1 AND card_id=$2::uuid",
    )
    .bind("user-a")
    .bind(card_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(saved, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn like_then_skip_is_rejected(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    let like = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    common::send(&app, like).await;
    let skip = common::authed_request(
        Method::POST,
        "/api/style-interactions/skip",
        "user-a",
        Some(serde_json::json!({ "cardId": card_id })),
    );
    let (status, body) = common::send(&app, skip).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body["message"],
        "Card was already liked and cannot be skipped"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn retired_card_cannot_be_liked(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    sqlx::query("UPDATE style_card SET status='retired', retired_at=now() WHERE id=$1::uuid")
        .bind(&card_id)
        .execute(&pool)
        .await
        .unwrap();
    let like = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    let (status, body) = common::send(&app, like).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "Card is retired");
}

#[sqlx::test(migrations = "./migrations")]
async fn saved_list_and_remove(pool: sqlx::PgPool) {
    let app = common::test_app(pool.clone());
    let card_id = seed_card(&pool).await;
    let like = common::authed_request(
        Method::POST,
        "/api/style-interactions/like",
        "user-a",
        Some(serde_json::json!({ "cardId": &card_id })),
    );
    common::send(&app, like).await;

    let list = common::authed_request(Method::GET, "/api/saved-styles", "user-a", None);
    let (status, body) = common::send(&app, list).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["card"]["id"], card_id);

    let remove = common::authed_request(
        Method::DELETE,
        &format!("/api/saved-styles/{card_id}"),
        "user-a",
        None,
    );
    let (status, body) = common::send(&app, remove).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, serde_json::json!(true));

    let list2 = common::authed_request(Method::GET, "/api/saved-styles", "user-a", None);
    let (_, body) = common::send(&app, list2).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}
