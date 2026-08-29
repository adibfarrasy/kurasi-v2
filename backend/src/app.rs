use crate::auth::Authenticator;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub authenticator: Arc<dyn Authenticator>,
}

impl AppState {
    pub fn new(pool: PgPool, authenticator: Arc<dyn Authenticator>) -> Self {
        AppState { pool, authenticator }
    }
}

pub fn build_router_stub(state: AppState) -> axum::Router {
    use axum::routing::{get, post};
    axum::Router::new()
        .route(
            "/api/onboarding",
            get(crate::onboarding::get_onboarding)
                .post(crate::onboarding::complete_onboarding),
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
        .with_state(state)
}