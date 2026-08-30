use std::env::var;

pub const DEFAULT_KRATOS_JWKS_URL: &str = "http://localhost:4433/jwks.json";
pub const DEFAULT_KRATOS_ISSUER: &str = "https://auth.example.com";

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub kratos_jwks_url: String,
    pub kratos_issuer: String,
    pub environment: String,
    pub fal_key: String,
    pub output_dir: String,
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
            kratos_jwks_url: var("KRATOS_JWKS_URL").unwrap_or_else(|_| DEFAULT_KRATOS_JWKS_URL.to_string()),
            kratos_issuer: var("KRATOS_ISSUER").unwrap_or_else(|_| DEFAULT_KRATOS_ISSUER.to_string()),
            environment: var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string()),
            fal_key: var("FAL_KEY").unwrap_or_default(),
            output_dir: var("OUTPUT_DIR").unwrap_or_else(|_| "outputs".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_old_env() {
        let c = Config::from_env();
        assert_eq!(
            c.database_url,
            "postgresql://postgres:postgres@127.0.0.1:5437/postgres"
        );
        assert_eq!(c.port, 8989);
        assert_eq!(c.environment, "production");
    }
}
