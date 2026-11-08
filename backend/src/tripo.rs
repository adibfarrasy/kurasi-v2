use serde_json::{json, Value};
use std::time::Duration;

const API_BASE: &str = "https://openapi.tripo3d.ai";
const MODEL: &str = "v3.1-20260211";
/// Mobile viewers choke on the multi-million-face default; this keeps the
/// GLB to a few MB while still reading as a full figure.
const FACE_LIMIT: u32 = 50_000;

/// Image-to-3D via Tripo's v3 API.
#[derive(Clone)]
pub struct TripoClient {
    http: reqwest::Client,
    key: String,
    base: String,
    poll_interval: Duration,
}

impl TripoClient {
    /// None when no key is configured, so pipelines fall back to 2D only.
    pub fn from_key(key: String) -> Option<Self> {
        if key.trim().is_empty() {
            return None;
        }
        Some(TripoClient {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("reqwest client"),
            key,
            base: API_BASE.to_string(),
            poll_interval: Duration::from_secs(3),
        })
    }

    /// Turns a public image URL into GLB bytes. Downloads immediately because
    /// Tripo's output URLs expire minutes after the task succeeds.
    pub async fn image_to_glb(
        &self,
        image_url: &str,
        timeout: Duration,
    ) -> Result<Vec<u8>, String> {
        let created: Value = self
            .http
            .post(format!("{}/v3/generation/image-to-model", self.base))
            .bearer_auth(&self.key)
            .json(&json!({
                "input": image_url,
                "model": MODEL,
                "texture": true,
                "pbr": true,
                "face_limit": FACE_LIMIT,
            }))
            .send()
            .await
            .map_err(|e| format!("tripo create failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("tripo create parse: {e}"))?;
        if created["code"] != 0 {
            return Err(format!("tripo create rejected: {created}"));
        }
        let task_id = created["data"]["task_id"]
            .as_str()
            .ok_or_else(|| format!("tripo create missing task_id: {created}"))?
            .to_string();

        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let task: Value = self
                .http
                .get(format!("{}/v3/tasks/{task_id}", self.base))
                .bearer_auth(&self.key)
                .send()
                .await
                .map_err(|e| format!("tripo poll failed: {e}"))?
                .json()
                .await
                .map_err(|e| format!("tripo poll parse: {e}"))?;
            match task["data"]["status"].as_str().unwrap_or("") {
                "success" => {
                    let url = task["data"]["output"]["model_url"]
                        .as_str()
                        .ok_or_else(|| format!("tripo success without model_url: {task}"))?;
                    return self.download(url).await;
                }
                "failed" | "cancelled" | "banned" | "expired" => {
                    return Err(format!("tripo task {task_id} ended: {task}"));
                }
                _ => {}
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(format!("tripo task {task_id} timed out"));
            }
            tokio::time::sleep(self.poll_interval).await;
        }
    }

    async fn download(&self, url: &str) -> Result<Vec<u8>, String> {
        let res = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| format!("tripo download failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("tripo download HTTP {}", res.status()));
        }
        res.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("tripo download bytes: {e}"))
    }
}

/// Converts a finished 2D figure to a GLB and re-hosts it on fal storage.
/// Errors are logged and swallowed: the 2D result stays usable without it.
pub async fn figure_to_model(
    tripo: Option<&TripoClient>,
    fal: &crate::fal::FalClient,
    image_url: &str,
    filename: &str,
) -> Option<String> {
    let tripo = tripo?;
    let result = async {
        let glb = tripo
            .image_to_glb(image_url, Duration::from_secs(300))
            .await?;
        fal.upload(&glb, filename, "model/gltf-binary").await
    }
    .await;
    match result {
        Ok(url) => Some(url),
        Err(e) => {
            tracing::error!(error = %e, "3D model generation failed; keeping 2D result");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    #[tokio::test]
    async fn creates_polls_and_downloads_glb() {
        let polls = Arc::new(AtomicUsize::new(0));
        let polls2 = polls.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let base2 = base.clone();
        let app = axum::Router::new().fallback(axum::routing::any(move |req: axum::http::Request<axum::body::Body>| {
            let polls = polls2.clone();
            let base = base2.clone();
            async move {
                let path = req.uri().path().to_string();
                if path == "/v3/generation/image-to-model" {
                    assert_eq!(req.headers()["authorization"], "Bearer k");
                    axum::Json(json!({ "code": 0, "data": { "task_id": "t1" } })).into_response()
                } else if path == "/v3/tasks/t1" {
                    let n = polls.fetch_add(1, Ordering::SeqCst);
                    let status = if n == 0 { "running" } else { "success" };
                    axum::Json(json!({ "code": 0, "data": { "status": status, "output": { "model_url": format!("{base}/out.glb") } } }))
                        .into_response()
                } else {
                    b"glTF-bytes".to_vec().into_response()
                }
            }
        }));
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let client = TripoClient {
            http: reqwest::Client::new(),
            key: "k".into(),
            base,
            poll_interval: Duration::from_millis(10),
        };
        let glb = client
            .image_to_glb("https://x/fig.png", Duration::from_secs(5))
            .await
            .unwrap();
        assert_eq!(glb, b"glTF-bytes");
        assert_eq!(polls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn empty_key_disables_tripo() {
        assert!(TripoClient::from_key("  ".into()).is_none());
    }
}
