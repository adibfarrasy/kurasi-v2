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
    axum::Router::new()
        .route(
            "/api/onboarding",
            axum::routing::get(crate::onboarding::get_onboarding)
                .post(crate::onboarding::complete_onboarding),
        )
        .route("/api/credits", axum::routing::get(crate::credits::get_credits))
        .route(
            "/api/credits/purchase",
            axum::routing::post(crate::credits::purchase),
        )
        .with_state(state)
}