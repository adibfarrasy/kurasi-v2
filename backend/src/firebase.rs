use crate::auth::{Authenticator, FirebaseUser};
use crate::error::{ApiError, ApiResult};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

const JWKS_TTL: Duration = Duration::from_secs(3600);

#[derive(Clone)]
pub struct FirebaseVerifier {
    project_id: String,
    jwks_url: String,
    client: Client,
    cache: Arc<RwLock<Option<JwksCache>>>,
}

#[derive(Clone)]
struct JwksCache {
    keys: Vec<Jwk>,
    fetched_at: Instant,
}

#[derive(Clone, Deserialize)]
struct Jwk {
    kid: String,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct JwksResponse {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct FirebaseClaims {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
}

impl FirebaseVerifier {
    pub fn new(project_id: String, jwks_url: String) -> Self {
        FirebaseVerifier {
            project_id,
            jwks_url,
            client: Client::new(),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn keys(&self, force: bool) -> ApiResult<Vec<Jwk>> {
        if !force {
            let guard = self.cache.read().await;
            if let Some(c) = guard.as_ref() {
                if c.fetched_at.elapsed() < JWKS_TTL {
                    return Ok(c.keys.clone());
                }
            }
        }
        let resp = self
            .client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(ApiError::internal_err)?
            .json::<JwksResponse>()
            .await
            .map_err(ApiError::internal_err)?;
        let mut guard = self.cache.write().await;
        *guard = Some(JwksCache {
            keys: resp.keys.clone(),
            fetched_at: Instant::now(),
        });
        Ok(resp.keys)
    }

    fn verify_with_key(token: &str, key: &DecodingKey, project_id: &str) -> ApiResult<FirebaseUser> {
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[format!("https://securetoken.google.com/{project_id}")]);
        validation.set_audience(&[project_id]);
        validation.validate_exp = true;
        let data = decode::<FirebaseClaims>(token, key, &validation)
            .map_err(|_| ApiError::unauthorized())?;
        if data.claims.sub.trim().is_empty() {
            return Err(ApiError::unauthorized());
        }
        Ok(FirebaseUser {
            uid: data.claims.sub,
            email: data.claims.email,
            name: data.claims.name,
            picture: data.claims.picture,
        })
    }
}

#[async_trait::async_trait]
impl Authenticator for FirebaseVerifier {
    async fn verify(&self, token: &str) -> ApiResult<FirebaseUser> {
        if self.project_id.is_empty() {
            return Err(ApiError::unauthorized());
        }
        let header = decode_header(token).map_err(|_| ApiError::unauthorized())?;
        if header.alg != Algorithm::RS256 {
            return Err(ApiError::unauthorized());
        }
        let kid = header.kid.ok_or(ApiError::unauthorized())?;

        let mut keys = self.keys(false).await?;
        let jwk = keys.iter().find(|k| k.kid == kid);
        let jwk = match jwk {
            Some(j) => j.clone(),
            None => {
                keys = self.keys(true).await?;
                keys.iter()
                    .find(|k| k.kid == kid)
                    .cloned()
                    .ok_or(ApiError::unauthorized())?
            }
        };
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)
            .map_err(|_| ApiError::unauthorized())?;
        Self::verify_with_key(token, &key, &self.project_id)
    }
}

pub use crate::config::DEFAULT_JWKS_URL;

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header};
    use rsa::pkcs1::{DecodeRsaPublicKey, EncodeRsaPrivateKey};
    use rsa::traits::PublicKeyParts;
    use rsa::{RsaPrivateKey, RsaPublicKey};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    fn base64url(data: &[u8]) -> String {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        use base64::Engine;
        URL_SAFE_NO_PAD.encode(data)
    }

    fn test_verifier() -> (FirebaseVerifier, EncodingKey, String) {
        let mut rng = rand::thread_rng();
        let priv_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let pem = priv_key.to_pkcs1_pem(rsa::pkcs1::LineEnding::LF).unwrap();
        let encoding_key = EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap();
        let pub_pem = rsa::pkcs1::EncodeRsaPublicKey::to_pkcs1_pem(&RsaPublicKey::from(&priv_key), rsa::pkcs1::LineEnding::LF).unwrap();
        let pub_key = RsaPublicKey::from_pkcs1_pem(&pub_pem).unwrap();
        let jwk = Jwk {
            kid: "test-key".to_string(),
            n: base64url(&pub_key.n().to_bytes_be()),
            e: base64url(&pub_key.e().to_bytes_be()),
        };
        let verifier = FirebaseVerifier {
            project_id: "test-project".to_string(),
            jwks_url: String::new(),
            client: reqwest::Client::new(),
            cache: Arc::new(RwLock::new(Some(JwksCache {
                keys: vec![jwk],
                fetched_at: Instant::now(),
            }))),
        };
        (verifier, encoding_key, "test-key".to_string())
    }

    fn sign(claims: serde_json::Value, key: &EncodingKey, kid: &str) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(kid.to_string());
        jsonwebtoken::encode(&header, &claims, key).unwrap()
    }

    fn valid_claims() -> serde_json::Value {
        serde_json::json!({
            "iss": "https://securetoken.google.com/test-project",
            "aud": "test-project",
            "iat": now() - 10,
            "exp": now() + 3600,
            "auth_time": now() - 10,
            "sub": "user-a",
            "email": "a@test.com",
            "name": "Test User",
        })
    }

    #[tokio::test]
    async fn accepts_valid_token() {
        let (v, key, kid) = test_verifier();
        let token = sign(valid_claims(), &key, &kid);
        let user = v.verify(&token).await.unwrap();
        assert_eq!(user.uid, "user-a");
        assert_eq!(user.email.as_deref(), Some("a@test.com"));
    }

    #[tokio::test]
    async fn rejects_expired_token() {
        let (v, key, kid) = test_verifier();
        let mut claims = valid_claims();
        claims["exp"] = serde_json::json!(now() - 100);
        let token = sign(claims, &key, &kid);
        assert!(v.verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_wrong_audience() {
        let (v, key, kid) = test_verifier();
        let mut claims = valid_claims();
        claims["aud"] = serde_json::json!("other-project");
        let token = sign(claims, &key, &kid);
        assert!(v.verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_missing_subject() {
        let (v, key, kid) = test_verifier();
        let mut claims = valid_claims();
        claims["sub"] = serde_json::json!("");
        let token = sign(claims, &key, &kid);
        assert!(v.verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_empty_project_id() {
        let (mut v, _, _) = test_verifier();
        v.project_id = String::new();
        let token = "x";
        assert!(v.verify(token).await.is_err());
    }
}