use crate::error::ApiResult;

#[derive(Debug, Clone)]
pub struct FirebaseUser {
    pub uid: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[async_trait::async_trait]
pub trait Authenticator: Send + Sync {
    async fn verify(&self, token: &str) -> ApiResult<FirebaseUser>;
}