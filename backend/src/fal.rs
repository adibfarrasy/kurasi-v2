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
        self.run_with_timeout(model, input, std::time::Duration::from_secs(180))
            .await
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
        let submit_json: Value = submit
            .json()
            .await
            .map_err(|e| format!("fal submit parse: {e}"))?;
        let request_id = submit_json
            .get("request_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("fal submit missing request_id: {submit_json}"))?
            .to_string();
        // fal serves queue status under the app id (first two path segments),
        // not the full model path; nested models 405 on the full path. Prefer
        // the URL fal hands back, falling back to the app-id form.
        let status_url = submit_json
            .get("status_url")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| {
                let app_id = model.splitn(3, '/').take(2).collect::<Vec<_>>().join("/");
                format!("{}/{app_id}/requests/{request_id}/status", self.endpoint)
            });

        loop {
            if start.elapsed() >= deadline {
                return Err(format!(
                    "fal run {model} timeout after {}ms",
                    deadline.as_millis()
                ));
            }
            let status = self
                .http
                .get(&status_url)
                .header("Authorization", format!("Key {}", self.key))
                .send()
                .await
                .map_err(|e| format!("fal status failed: {e}"))?;
            if !status.status().is_success() {
                return Err(format!(
                    "fal status HTTP {} for {status_url}",
                    status.status()
                ));
            }
            let status_json: Value = status
                .json()
                .await
                .map_err(|e| format!("fal status parse: {e}"))?;
            let state = status_json
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match state {
                "COMPLETED" => {
                    let response_url = status_json
                        .get("response_url")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| {
                            format!("fal completed without response_url: {status_json}")
                        })?;
                    let res = self
                        .http
                        .get(response_url)
                        .header("Authorization", format!("Key {}", self.key))
                        .send()
                        .await
                        .map_err(|e| format!("fal result failed: {e}"))?;
                    if !res.status().is_success() {
                        return Err(format!("fal result HTTP {}", res.status()));
                    }
                    return res
                        .json::<Value>()
                        .await
                        .map_err(|e| format!("fal result parse: {e}"));
                }
                "ERROR" | "FAILED" => {
                    let detail = status_json
                        .get("error")
                        .cloned()
                        .unwrap_or(json!("unknown"));
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
        uploader.upload_two_step(bytes, filename, mime).await
    }

    /// fal storage upload: `initiate` returns a signed `upload_url` plus the
    /// public `file_url`; the bytes are then PUT to the signed URL. fal retired
    /// the old single-step multipart `/upload` endpoint (it now 404s).
    pub(crate) async fn upload_two_step(
        &self,
        bytes: &[u8],
        filename: &str,
        mime: &str,
    ) -> Result<String, String> {
        let res = self
            .http
            .post(format!(
                "{}/upload/initiate?storage_type=fal-cdn-v3",
                self.endpoint
            ))
            .header("Authorization", format!("Key {}", self.key))
            .json(&json!({ "content_type": mime, "file_name": filename }))
            .send()
            .await
            .map_err(|e| format!("fal upload initiate failed: {e}"))?;
        let body: Value = res
            .json()
            .await
            .map_err(|e| format!("fal upload initiate parse: {e}"))?;
        let field = |name: &str| {
            body.get(name)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("fal upload initiate missing {name}: {body}"))
        };
        let upload_url = field("upload_url")?;
        let file_url = field("file_url")?;

        let put = self
            .http
            .put(&upload_url)
            .header("Content-Type", mime)
            .body(bytes.to_vec())
            .send()
            .await
            .map_err(|e| format!("fal upload PUT failed: {e}"))?;
        if !put.status().is_success() {
            return Err(format!("fal upload PUT HTTP {}", put.status()));
        }
        Ok(file_url)
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
        res.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("fal fetch bytes: {e}"))
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

pub async fn ensure_fal_reachable(fal: &FalClient, url: &str) -> Result<String, String> {
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

    async fn mock_fal(
        handler: impl Clone
            + Fn(&str, axum::http::Request<axum::body::Body>) -> axum::response::Response
            + Send
            + Sync
            + 'static,
    ) -> (FalClient, String) {
        use axum::routing::any;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let base = format!("http://{addr}/api");
        let base2 = base.clone();
        let app = axum::Router::new().fallback(any(move |req| async move { handler(&base2, req) }));
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (
            FalClient {
                http: reqwest::Client::new(),
                key: "test-key".into(),
                endpoint: base.clone(),
            },
            base,
        )
    }

    #[tokio::test]
    async fn run_subscribes_and_polls_to_completion() {
        use axum::Json;
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
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

        let out = client
            .run("model", serde_json::json!({ "prompt": "x" }))
            .await
            .unwrap();
        assert_eq!(out["images"][0]["url"], "https://example.com/out.png");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn run_polls_app_id_status_for_nested_model() {
        use axum::Json;
        let (client, _) = mock_fal(|base, req| {
            let path = req.uri().path().to_string();
            if path == "/api/org/app/sub/edit" {
                Json(serde_json::json!({ "request_id": "req-9" })).into_response()
            } else if path == "/api/org/app/requests/req-9/status" {
                Json(serde_json::json!({ "status": "COMPLETED", "response_url": format!("{base}/result") }))
                    .into_response()
            } else if path == "/api/result" {
                Json(serde_json::json!({ "ok": true })).into_response()
            } else {
                axum::http::StatusCode::METHOD_NOT_ALLOWED.into_response()
            }
        })
        .await;
        let out = client
            .run("org/app/sub/edit", serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(out["ok"], true);
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
        })
        .await;
        let err = client
            .run("model", serde_json::json!({}))
            .await
            .unwrap_err();
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
        })
        .await;
        let start = std::time::Instant::now();
        let err = client
            .run_with_timeout(
                "model",
                serde_json::json!({}),
                std::time::Duration::from_millis(150),
            )
            .await
            .unwrap_err();
        assert!(err.contains("timeout"), "err = {err}");
        assert!(start.elapsed() >= std::time::Duration::from_millis(100));
    }

    #[tokio::test]
    async fn upload_initiates_then_puts_and_returns_file_url() {
        use axum::http::{Method, StatusCode};
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        let put_seen = Arc::new(AtomicBool::new(false));
        let put_seen2 = put_seen.clone();
        let (client, _) = mock_fal(move |base, req| {
            let path = req.uri().path().to_string();
            if req.method() == Method::POST && path.ends_with("/upload/initiate") {
                axum::Json(serde_json::json!({
                    "upload_url": format!("{base}/signed/1.png"),
                    "file_url": "https://cdn.example.com/1.png",
                }))
                .into_response()
            } else if req.method() == Method::PUT && path.ends_with("/signed/1.png") {
                put_seen2.store(true, Ordering::SeqCst);
                StatusCode::OK.into_response()
            } else {
                (StatusCode::NOT_FOUND, "nope").into_response()
            }
        })
        .await;
        let res = client
            .upload_two_step(b"png-bytes", "1.png", "image/png")
            .await
            .unwrap();
        assert_eq!(res, "https://cdn.example.com/1.png");
        assert!(put_seen.load(Ordering::SeqCst), "bytes were never PUT");
    }
}
