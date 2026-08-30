use crate::auth::Authenticator;
use crate::error::ApiError;
use crate::fal::FalClient;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::services::ServeDir;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub authenticator: Arc<dyn Authenticator>,
    pub fal: FalClient,
}

impl AppState {
    pub fn new(pool: PgPool, authenticator: Arc<dyn Authenticator>, fal: FalClient) -> Self {
        AppState {
            pool,
            authenticator,
            fal,
        }
    }
}

pub fn build_router(state: AppState) -> axum::Router {
    use axum::routing::{delete, get, post};
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
        .route("/api/brands", get(crate::brands::list))
        .route(
            "/api/biometrics",
            get(crate::biometrics::get).post(crate::biometrics::set),
        )
        .route(
            "/api/biometrics/photo",
            delete(crate::biometrics::remove_photo),
        )
        .route(
            "/api/fit-adjustments/{itemId}",
            get(crate::fit_adjustment::get_for_item)
                .put(crate::fit_adjustment::upsert)
                .delete(crate::fit_adjustment::remove),
        )
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
        .route(
            "/api/outfits",
            get(crate::outfits::list_outfits).post(crate::outfits::create_outfit),
        )
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
        .route(
            "/api/outfit-recommendations",
            get(crate::outfit_recommendation::list).post(crate::outfit_recommendation::request),
        )
        .route("/api/style-cards", post(crate::style_cards::create_card))
        .route("/api/style-cards/feed", get(crate::style_cards::feed))
        .route("/api/style-cards/{id}", get(crate::style_cards::find))
        .route(
            "/api/style-cards/{id}/retire",
            post(crate::style_cards::retire),
        )
        .route(
            "/api/style-interactions/like",
            post(crate::style_interactions::like),
        )
        .route(
            "/api/style-interactions/skip",
            post(crate::style_interactions::skip),
        )
        .route("/api/saved-styles", get(crate::saved_styles::list))
        .route(
            "/api/saved-styles/{cardId}",
            delete(crate::saved_styles::remove),
        )
        .route("/api/shared-outfits", get(crate::shared_outfits::discover))
        .route(
            "/api/shared-outfits/by-outfit/{outfitId}",
            get(crate::shared_outfits::find_by_outfit),
        )
        .route(
            "/api/shared-outfits/publish",
            post(crate::shared_outfits::publish),
        )
        .route(
            "/api/shared-outfits/unpublish",
            post(crate::shared_outfits::unpublish),
        )
        .route("/api/me", get(crate::me::me))
        .route(
            "/api/steal-the-look",
            post(crate::steal_the_look::start),
        )
        .route(
            "/api/steal-the-look/{sessionId}",
            get(crate::steal_the_look::progress),
        )
        .route("/api/wardrobe/upload", post(crate::add_clothes::start))
        .route(
            "/api/wardrobe/upload/{sessionId}",
            get(crate::add_clothes::progress),
        )
        .route(
            "/api/subscription",
            get(crate::subscription::get).post(crate::subscription::start),
        )
        .route(
            "/api/subscription/cancel",
            post(crate::subscription::cancel),
        )
        .route(
            "/api/subscription/renew-success",
            post(crate::subscription::renew_success),
        )
        .route(
            "/api/subscription/renew-failure",
            post(crate::subscription::renew_failure),
        )
        .route(
            "/api/subscription/lapse-grace",
            post(crate::subscription::lapse_after_grace),
        )
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
