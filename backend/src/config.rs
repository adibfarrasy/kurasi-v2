use std::env::var;

pub const DEFAULT_JWKS_URL: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub firebase_project_id: String,
    pub jwks_url: String,
    pub environment: String,
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            database_url: var("DATABASE_URL").unwrap_or_else(|_| {
                "postgresql://postgres:postgres@127.0.0.1:5437/postgres".to_string()
            }),
            port: var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8989),
            firebase_project_id: var("FIREBASE_PROJECT_ID").unwrap_or_default(),
            jwks_url: var("FIREBASE_JWKS_URL").unwrap_or_else(|_| DEFAULT_JWKS_URL.to_string()),
            environment: var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_old_env() {
        let c = Config::from_env();
        assert_eq!(c.database_url, "postgresql://postgres:postgres@127.0.0.1:5437/postgres");
        assert_eq!(c.port, 8989);
        assert_eq!(c.environment, "production");
    }
}