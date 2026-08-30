use crate::auth::Authenticator;
use crate::auth::ClaimsUser;
use crate::error::{ApiError, ApiResult};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

const JWKS_TTL: Duration = Duration::from_secs(3600);

#[derive(Clone)]
pub struct KratosVerifier {
    pub jwks_url: String,
    pub issuer: String,
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
    #[allow(dead_code)]
    kty: String,
    #[allow(dead_code)]
    alg: String,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct JwksResponse {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct KratosClaims {
    sub: String,
    #[allow(dead_code)]
    sid: Option<String>,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
}

impl KratosVerifier {
    pub fn new(jwks_url: String, issuer: String) -> Self {
        KratosVerifier {
            jwks_url,
            issuer,
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest client"),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn keys(&self, force: bool) -> ApiResult<Vec<Jwk>> {
        if !force {
            let g = self.cache.read().await;
            if let Some(c) = g.as_ref() {
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
            .error_for_status()
            .map_err(ApiError::internal_err)?
            .json::<JwksResponse>()
            .await
            .map_err(ApiError::internal_err)?;
        let mut g = self.cache.write().await;
        *g = Some(JwksCache {
            keys: resp.keys.clone(),
            fetched_at: Instant::now(),
        });
        Ok(resp.keys)
    }
}

#[async_trait::async_trait]
impl Authenticator for KratosVerifier {
    async fn verify(&self, token: &str) -> ApiResult<ClaimsUser> {
        let header = decode_header(token).map_err(|_| ApiError::unauthorized())?;
        if header.alg != Algorithm::RS256 {
            return Err(ApiError::unauthorized());
        }
        let kid = header.kid.ok_or(ApiError::unauthorized())?;
        let mut keys = self.keys(false).await?;
        let jwk = match keys.iter().find(|k| k.kid == kid) {
            Some(j) => j.clone(),
            None => {
                keys = self.keys(true).await?;
                keys.iter()
                    .find(|k| k.kid == kid)
                    .cloned()
                    .ok_or(ApiError::unauthorized())?
            }
        };
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e).map_err(|_| ApiError::unauthorized())?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(std::slice::from_ref(&self.issuer));
        validation.validate_exp = true;
        let data = decode::<KratosClaims>(token, &key, &validation).map_err(|_| ApiError::unauthorized())?;
        if data.claims.sub.trim().is_empty() {
            return Err(ApiError::unauthorized());
        }
        Ok(ClaimsUser {
            uid: data.claims.sub,
            email: data.claims.email,
            name: data.claims.name,
            picture: data.claims.picture,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header};
    use rsa::pkcs1::EncodeRsaPrivateKey;
    use rsa::pkcs8::DecodePublicKey;
    use rsa::traits::PublicKeyParts;
    use rsa::{RsaPrivateKey, RsaPublicKey};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }
    fn b64u(data: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
    }

    fn test_verifier() -> (KratosVerifier, EncodingKey, String) {
        let mut rng = rand::thread_rng();
        let priv_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let pem = priv_key.to_pkcs1_pem(rsa::pkcs1::LineEnding::LF).unwrap();
        let enc = EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap();
        let pub_pem = rsa::pkcs8::EncodePublicKey::to_public_key_pem(
            &RsaPublicKey::from(&priv_key),
            rsa::pkcs8::LineEnding::LF,
        )
        .unwrap();
        let pub_key = RsaPublicKey::from_public_key_pem(&pub_pem).unwrap();
        let jwk = Jwk {
            kid: "k1".into(),
            kty: "RSA".into(),
            alg: "RS256".into(),
            n: b64u(&pub_key.n().to_bytes_be()),
            e: b64u(&pub_key.e().to_bytes_be()),
        };
        let v = KratosVerifier {
            jwks_url: String::new(),
            issuer: "https://auth.example.com".into(),
            client: reqwest::Client::new(),
            cache: Arc::new(RwLock::new(Some(JwksCache {
                keys: vec![jwk],
                fetched_at: Instant::now(),
            }))),
        };
        (v, enc, "k1".into())
    }

    fn sign(claims: serde_json::Value, key: &EncodingKey, kid: &str) -> String {
        let mut h = Header::new(jsonwebtoken::Algorithm::RS256);
        h.kid = Some(kid.into());
        jsonwebtoken::encode(&h, &claims, key).unwrap()
    }

    fn valid_claims() -> serde_json::Value {
        serde_json::json!({
            "iss": "https://auth.example.com",
            "sub": "id-123",
            "sid": "sess-1",
            "email": "a@test.com",
            "name": "Test User",
            "iat": now() - 5, "exp": now() + 600, "nbf": now() - 5,
        })
    }

    #[tokio::test]
    async fn accepts_valid_token() {
        let (v, key, kid) = test_verifier();
        let u = v.verify(&sign(valid_claims(), &key, &kid)).await.unwrap();
        assert_eq!(u.uid, "id-123");
        assert_eq!(u.email.as_deref(), Some("a@test.com"));
    }

    #[tokio::test]
    async fn rejects_expired() {
        let (v, key, kid) = test_verifier();
        let mut c = valid_claims();
        c["exp"] = serde_json::json!(now() - 100);
        assert!(v.verify(&sign(c, &key, &kid)).await.is_err());
    }

    #[tokio::test]
    async fn rejects_wrong_issuer() {
        let (v, key, kid) = test_verifier();
        let mut c = valid_claims();
        c["iss"] = serde_json::json!("https://evil.example.com");
        assert!(v.verify(&sign(c, &key, &kid)).await.is_err());
    }

    #[tokio::test]
    async fn rejects_missing_subject() {
        let (v, key, kid) = test_verifier();
        let mut c = valid_claims();
        c["sub"] = serde_json::json!("");
        assert!(v.verify(&sign(c, &key, &kid)).await.is_err());
    }

    #[tokio::test]
    async fn rejects_tampered() {
        let (v, key, kid) = test_verifier();
        let token = sign(valid_claims(), &key, &kid);
        let mut parts: Vec<&str> = token.split('.').collect();
        let payload = parts[1]
            .chars()
            .map(|c| if c == 'A' { 'B' } else { 'A' })
            .collect::<String>();
        parts[1] = &payload;
        assert!(v.verify(&parts.join(".")).await.is_err());
    }
}