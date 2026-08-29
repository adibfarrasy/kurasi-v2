use crate::auth::Authenticator;
use crate::error::ApiError;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::services::ServeDir;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub authenticator: Arc<dyn Authenticator>,
}

impl AppState {
    pub fn new(pool: PgPool, authenticator: Arc<dyn Authenticator>) -> Self {
        AppState {
            pool,
            authenticator,
        }
    }
}

pub fn build_router(state: AppState) -> axum::Router {
    use axum::routing::{get, post};
    let clothing_dir =
        std::env::var("CLOTHING_DIR").unwrap_or_else(|_| "../clothing articles".into());
    let avatar_dir = std::env::var("AVATAR_DIR").unwrap_or_else(|_| "avatar/assets".into());
    axum::Router::new()
        .route("/health", get(health))
        .route(
            "/api/onboarding",
            get(crate::onboarding::get_onboarding).post(crate::onboarding::complete_onboarding),
        )
        .route("/api/credits", get(crate::credits::get_credits))
        .route("/api/credits/purchase", post(crate::credits::purchase))
        .route(
            "/api/wardrobe/items",
            get(crate::wardrobe::list_items).post(crate::wardrobe::create_item),
        )
        .route(
            "/api/wardrobe/items/{id}",
            get(crate::wardrobe::get_item)
                .patch(crate::wardrobe::update_item)
                .delete(crate::wardrobe::delete_item),
        )
        .route("/api/outfits", get(crate::outfits::list_outfits).post(crate::outfits::create_outfit))
        .route(
            "/api/outfits/from-tryon",
            post(crate::outfits::save_from_tryon),
        )
        .route(
            "/api/outfits/{id}",
            get(crate::outfits::find_outfit)
                .patch(crate::outfits::update_outfit)
                .delete(crate::outfits::delete_outfit),
        )
        .route("/api/outfits/{id}/rate", post(crate::outfits::rate_outfit))
        .nest_service("/static/clothing", ServeDir::new(clothing_dir))
        .nest_service("/static/avatar-assets", ServeDir::new(avatar_dir))
        .fallback(not_found)
        .with_state(state)
}

async fn health() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "status": "ok" }))
}

async fn not_found() -> ApiError {
    ApiError::not_found("Route not found")
}
