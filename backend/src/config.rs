use std::env::var;

pub const DEFAULT_KRATOS_JWKS_URL: &str = "http://localhost:4435/jwks.json";
/// Placeholder issuer. `ENVIRONMENT=production` fails fast unless this is
/// overridden with a real `KRATOS_ISSUER` matching Kratos's
/// `serve.public.base_url`.
pub const DEFAULT_KRATOS_ISSUER: &str = "https://auth.example.com";

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub kratos_jwks_url: String,
    pub kratos_issuer: String,
    pub environment: String,
    pub fal_key: String,
    pub tripo_key: String,
    pub output_dir: String,
}

impl Config {
    pub fn from_env() -> Self {
        let environment = var("ENVIRONMENT").unwrap_or_else(|_| "dev".to_string());
        let kratos_issuer =
            var("KRATOS_ISSUER").unwrap_or_else(|_| DEFAULT_KRATOS_ISSUER.to_string());
        let config = Config {
            database_url: var("DATABASE_URL").unwrap_or_else(|_| {
                "postgresql://postgres:postgres@127.0.0.1:5437/postgres".to_string()
            }),
            port: var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8989),
            kratos_jwks_url: var("KRATOS_JWKS_URL")
                .unwrap_or_else(|_| DEFAULT_KRATOS_JWKS_URL.to_string()),
            kratos_issuer,
            environment,
            fal_key: var("FAL_KEY").unwrap_or_default(),
            tripo_key: var("TRIPO_KEY").unwrap_or_default(),
            output_dir: var("OUTPUT_DIR").unwrap_or_else(|_| "outputs".to_string()),
        };
        config.validate_environment();
        config
    }

    /// Fails fast when a production deployment still uses the dev placeholder
    /// issuer, so a misconfigured production never silently serves.
    pub fn validate_environment(&self) {
        if self.environment == "production" && self.kratos_issuer == DEFAULT_KRATOS_ISSUER {
            panic!(
                "ENVIRONMENT=production requires KRATOS_ISSUER set to Kratos's \
                 serve.public.base_url (default '{}' is the dev placeholder)",
                DEFAULT_KRATOS_ISSUER
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_local_dev_coherent() {
        let c = Config::from_env();
        match var("DATABASE_URL") {
            Ok(url) => assert_eq!(c.database_url, url),
            Err(_) => assert_eq!(
                c.database_url,
                "postgresql://postgres:postgres@127.0.0.1:5437/postgres"
            ),
        }
        assert_eq!(c.port, 8989);
        assert_eq!(c.environment, "dev");
        assert_eq!(c.kratos_jwks_url, "http://localhost:4435/jwks.json");
        assert_eq!(c.kratos_issuer, DEFAULT_KRATOS_ISSUER);
    }

    #[test]
    #[should_panic(expected = "KRATOS_ISSUER")]
    fn production_fails_fast_on_placeholder_issuer() {
        let c = Config {
            database_url: String::new(),
            port: 0,
            kratos_jwks_url: String::new(),
            kratos_issuer: DEFAULT_KRATOS_ISSUER.to_string(),
            environment: "production".to_string(),
            fal_key: String::new(),
            tripo_key: String::new(),
            output_dir: String::new(),
        };
        c.validate_environment();
    }
}
