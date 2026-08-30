use kurasi_backend::app::{build_router, AppState};
use kurasi_backend::config::Config;
use kurasi_backend::db;
use kurasi_backend::kratos::KratosVerifier;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,kurasi_backend=info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let config = Config::from_env();
    let pool = db::connect(&config.database_url).await?;
    db::run_migrations(&pool).await?;
    tracing::info!("database migrations applied");

    let verifier =
        KratosVerifier::new(config.kratos_jwks_url.clone(), config.kratos_issuer.clone());
    let state = AppState::new(
        pool,
        Arc::new(verifier),
        kurasi_backend::fal::FalClient::new(config.fal_key.clone()),
    );
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("kurasi backend listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
