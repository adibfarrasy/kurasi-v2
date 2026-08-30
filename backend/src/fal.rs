use serde_json::{json, Value};

#[derive(Clone)]
pub struct FalClient {
    http: reqwest::Client,
    key: String,
    endpoint: String,
}

const QUEUE_BASE: &str = "https://queue.fal.run";
const STORAGE_BASE: &str = "https://rest.alpha.fal.ai/storage";

impl FalClient {
    pub fn new(key: String) -> Self {
        FalClient {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
            key,
            endpoint: QUEUE_BASE.to_string(),
        }
    }

    pub async fn run(&self, model: &str, input: Value) -> Result<Value, String> {
        self.run_with_timeout(model, input, std::time::Duration::from_secs(180)).await
    }

    pub async fn run_with_timeout(
        &self,
        model: &str,
        input: Value,
        deadline: std::time::Duration,
    ) -> Result<Value, String> {
        let start = std::time::Instant::now();
        let submit = self
            .http
            .post(format!("{}/{}", self.endpoint, model))
            .header("Authorization", format!("Key {}", self.key))
            .json(&input)
            .send()
            .await
            .map_err(|e| format!("fal submit failed: {e}"))?;
        if !submit.status().is_success() {
            return Err(format!("fal submit HTTP {}", submit.status()));
        }
        let submit_json: Value = submit.json().await.map_err(|e| format!("fal submit parse: {e}"))?;
        let request_id = submit_json
            .get("request_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("fal submit missing request_id: {submit_json}"))?
            .to_string();

        loop {
            if start.elapsed() >= deadline {
                return Err(format!("fal run {model} timeout after {}ms", deadline.as_millis()));
            }
            let status = self
                .http
                .get(format!("{}/{}/requests/{}/status", self.endpoint, model, request_id))
                .header("Authorization", format!("Key {}", self.key))
                .send()
                .await
                .map_err(|e| format!("fal status failed: {e}"))?;
            let status_json: Value = status.json().await.map_err(|e| format!("fal status parse: {e}"))?;
            let state = status_json.get("status").and_then(|v| v.as_str()).unwrap_or("");
            match state {
                "COMPLETED" => {
                    let response_url = status_json
                        .get("response_url")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| format!("fal completed without response_url: {status_json}"))?;
                    let res = self
                        .http
                        .get(response_url)
                        .send()
                        .await
                        .map_err(|e| format!("fal result failed: {e}"))?;
                    return res
                        .json::<Value>()
                        .await
                        .map_err(|e| format!("fal result parse: {e}"));
                }
                "ERROR" | "FAILED" => {
                    let detail = status_json.get("error").cloned().unwrap_or(json!("unknown"));
                    return Err(format!("fal {model} {state}: {detail}"));
                }
                _ => {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
            }
        }
    }

    pub async fn upload(&self, bytes: &[u8], filename: &str, mime: &str) -> Result<String, String> {
        let uploader = FalClient {
            endpoint: STORAGE_BASE.to_string(),
            ..self.clone()
        };
        uploader.upload_to_path("/upload", bytes, filename, mime).await
    }

    pub(crate) async fn upload_to_path(
        &self,
        path: &str,
        bytes: &[u8],
        filename: &str,
        mime: &str,
    ) -> Result<String, String> {
        let part = reqwest::multipart::Part::bytes(bytes.to_vec())
            .file_name(filename.to_string())
            .mime_str(mime)
            .map_err(|e| format!("fal multipart mime: {e}"))?;
        let form = reqwest::multipart::Form::new().part("file", part);
        let res = self
            .http
            .post(format!("{}{path}", self.endpoint))
            .header("Authorization", format!("Key {}", self.key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("fal upload failed: {e}"))?;
        let body: Value = res.json().await.map_err(|e| format!("fal upload parse: {e}"))?;
        body.get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| format!("fal upload missing url: {body}"))
    }

    pub async fn fetch_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        let res = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| format!("fal fetch failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("fal fetch HTTP {}", res.status()));
        }
        res.bytes().await.map(|b| b.to_vec()).map_err(|e| format!("fal fetch bytes: {e}"))
    }
}

fn is_local_url(url: &str) -> bool {
    // matches http://localhost / 127.0.0.1 / 0.0.0.0 / 10.* / 192.168.* / 172.16-31.*
    let host = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .and_then(|rest| rest.split('/').next())
        .unwrap_or("");
    host == "localhost"
        || host == "127.0.0.1"
        || host == "0.0.0.0"
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("172.")
}

pub fn is_dev_mode() -> bool {
    std::env::var("ENVIRONMENT").unwrap_or_else(|_| "production".to_string()) == "dev"
}

pub async fn ensure_fal_reachable(
    fal: &FalClient,
    url: &str,
) -> Result<String, String> {
    if !is_local_url(url) {
        return Ok(url.to_string());
    }
    if !is_dev_mode() {
        return Err(format!(
            "URL {url} is not reachable from fal. Set ENVIRONMENT=dev to enable localhost rehosting, or use a public URL in production."
        ));
    }
    let bytes = fal.fetch_bytes(url).await?;
    let filename = url
        .split('/')
        .next_back()
        .map(|s| s.split('?').next().unwrap_or("rehost.png").to_string())
        .unwrap_or_else(|| "rehost.png".to_string());
    fal.upload(&bytes, &filename, "image/png").await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    async fn mock_fal(handler: impl Clone + Fn(&str, axum::http::Request<axum::body::Body>) -> axum::response::Response + Send + Sync + 'static) -> (FalClient, String) {
        use axum::routing::any;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let base = format!("http://{addr}/api");
        let base2 = base.clone();
        let app = axum::Router::new().fallback(any(move |req| async move { handler(&base2, req) }));
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (FalClient { http: reqwest::Client::new(), key: "test-key".into(), endpoint: base.clone() }, base)
    }

    #[tokio::test]
    async fn run_subscribes_and_polls_to_completion() {
        use axum::Json;
        use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
        let calls = Arc::new(AtomicUsize::new(0));
        let calls2 = calls.clone();
        let (client, _) = mock_fal(move |base, req| {
            let path = req.uri().path().to_string();
            let calls = calls2.clone();
            if path == "/api/model" {
                let _ = calls.fetch_add(1, Ordering::SeqCst);
                Json(serde_json::json!({ "request_id": "req-1" })).into_response()
            } else if path == "/api/model/requests/req-1/status" {
                Json(serde_json::json!({ "status": "COMPLETED", "response_url": format!("{base}/result") })).into_response()
            } else {
                Json(serde_json::json!({ "images": [{ "url": "https://example.com/out.png" }] })).into_response()
            }
        }).await;

        let out = client.run("model", serde_json::json!({ "prompt": "x" })).await.unwrap();
        assert_eq!(out["images"][0]["url"], "https://example.com/out.png");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn run_reports_error_status() {
        use axum::Json;
        let (client, _) = mock_fal(|_, req| {
            let path = req.uri().path().to_string();
            if path.starts_with("/api/model/requests") {
                Json(serde_json::json!({ "status": "ERROR", "error": "boom" })).into_response()
            } else {
                Json(serde_json::json!({ "request_id": "req-2" })).into_response()
            }
        }).await;
        let err = client.run("model", serde_json::json!({})).await.unwrap_err();
        assert!(err.contains("ERROR"), "err = {err}");
    }

    #[tokio::test]
    async fn run_times_out() {
        use axum::Json;
        let (client, _) = mock_fal(|_, req| {
            let path = req.uri().path().to_string();
            if path.starts_with("/api/model/requests") {
                Json(serde_json::json!({ "status": "IN_QUEUE" })).into_response()
            } else {
                Json(serde_json::json!({ "request_id": "req-3" })).into_response()
            }
        }).await;
        let start = std::time::Instant::now();
        let err = client.run_with_timeout("model", serde_json::json!({}), std::time::Duration::from_millis(150)).await.unwrap_err();
        assert!(err.contains("timeout"), "err = {err}");
        assert!(start.elapsed() >= std::time::Duration::from_millis(100));
    }

    #[tokio::test]
    async fn upload_sends_multipart_and_returns_url() {
        use axum::http::StatusCode;
        let (client, base) = mock_fal(|_, req| {
            let path = req.uri().path().to_string();
            if path.ends_with("/upload") {
                axum::Json(serde_json::json!({ "url": "https://storage.example.com/1.png" })).into_response()
            } else {
                (StatusCode::NOT_FOUND, "nope").into_response()
            }
        }).await;
        let client = FalClient { http: client.http, key: client.key, endpoint: base };
        let res = client.upload_to_path("/upload", b"png-bytes", "1.png", "image/png").await.unwrap();
        assert_eq!(res, "https://storage.example.com/1.png");
    }
}