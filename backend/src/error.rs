use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: &'static str,
    pub status: StatusCode,
    pub message: String,
    pub data: Option<Value>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn unauthorized() -> Self {
        ApiError {
            code: "UNAUTHORIZED",
            status: StatusCode::UNAUTHORIZED,
            message: "You need to be logged in.".to_string(),
            data: None,
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        ApiError {
            code: "NOT_FOUND",
            status: StatusCode::NOT_FOUND,
            message: message.into(),
            data: None,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        ApiError {
            code: "VALIDATION",
            status: StatusCode::UNPROCESSABLE_ENTITY,
            message: message.into(),
            data: None,
        }
    }

    pub fn internal() -> Self {
        ApiError {
            code: "INTERNAL",
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "Internal server error".to_string(),
            data: None,
        }
    }

    pub fn internal_err(e: impl std::fmt::Display) -> Self {
        tracing::error!(error = %e, "internal error");
        ApiError::internal()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        ApiError::internal_err(e)
    }
}

impl From<JsonRejection> for ApiError {
    fn from(e: JsonRejection) -> Self {
        ApiError::validation(format!("invalid request body: {e}"))
    }
}

impl From<PathRejection> for ApiError {
    fn from(e: PathRejection) -> Self {
        ApiError::validation(format!("invalid path parameter: {e}"))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({
            "code": self.code,
            "message": self.message,
            "data": self.data,
        }));
        (self.status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn body_json(res: axum::response::Response) -> Value {
        let bytes = axum::body::to_bytes(res.into_body(), 1024).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn not_found_renders_standard_shape() {
        let res = ApiError::not_found("Clothing item not found").into_response();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
        let body = body_json(res).await;
        assert_eq!(body["code"], "NOT_FOUND");
        assert_eq!(body["message"], "Clothing item not found");
        assert_eq!(body["data"], Value::Null);
    }

    #[tokio::test]
    async fn unauthorized_has_401() {
        let res = ApiError::unauthorized().into_response();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn validation_has_422() {
        let res = ApiError::validation("bad input").into_response();
        assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = body_json(res).await;
        assert_eq!(body["code"], "VALIDATION");
    }
}