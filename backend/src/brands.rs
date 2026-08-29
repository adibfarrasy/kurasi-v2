use crate::app::AppState;
use crate::auth_extractor::AuthUser;
use crate::error::ApiResult;
use axum::extract::State;
use axum::Json;

const BUNDLED_BRANDS: [&str; 43] = [
    "A.P.C.", "A Bathing Ape (BAPE)", "Acne Studio", "Adidas", "Alexander McQueen",
    "Alexander Wang", "Alpha Industries", "Ami Paris", "Armani", "ASOS", "Balenciaga",
    "Banana Republic", "Barbour", "Burberry", "Calvin Klein", "Carhartt", "Champion",
    "COS", "Diesel", "Dior", "Dr. Martens", "Fila", "Gucci", "H&M", "Levi's", "Loewe",
    "New Balance", "Nike", "North Face", "Patagonia", "Polo Ralph Lauren", "Prada",
    "Puma", "Reebok", "Stone Island", "Stüssy", "Supreme", "Tommy Hilfiger", "Uniqlo",
    "Vans", "Versace", "Yves Saint Laurent", "Zara",
];

pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<String>>> {
    let user_brands: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT brand FROM clothing_item WHERE user_id=$1 AND status='active' AND brand IS NOT NULL AND trim(brand) <> ''",
    )
    .bind(&auth.id)
    .fetch_all(&state.pool)
    .await?;

    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for b in BUNDLED_BRANDS {
        let lower = b.to_lowercase();
        if seen.insert(lower) {
            out.push(b.to_string());
        }
    }
    for b in user_brands {
        let lower = b.to_lowercase();
        if seen.insert(lower) {
            out.push(b);
        }
    }
    out.sort();
    Ok(Json(out))
}