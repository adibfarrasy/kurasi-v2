use crate::models::ColorInfo;

/// Verbatim ANALYZE_PROMPT from the legacy analyze-clothing-service.ts
/// (rendered value of the old ANALYZE_PROMPT template literal, extracted
/// from commit 096c47a, 2172 bytes).
pub const ANALYZE_PROMPT: &str = r##"You are a wardrobe metadata extractor. The photo contains EXACTLY ONE clothing item the user wants to add to their wardrobe. The item may be shown flat-lay (laid on a surface), on a hanger, on a mannequin, or worn by a person. Identify the GARMENT or accessory only — ignore any background, surface, person, body part, mannequin, hanger, or props.

DO NOT INVENT items. If the photo shows a boot, the answer is footwear — do NOT mention shirts. If the photo shows a pair of jeans, the answer is pants — do NOT mention shirts.

(1) CATEGORY — pick exactly ONE of:
- headwear: hat, cap, beanie, headband, bucket hat, sun hat
- shirt: any top worn on the torso — t-shirt, tank, henley, button-down, polo, oxford, blouse, hoodie that is a pull-over without an outer shell
- jacket: any outer-layer garment — jacket, coat, hooded jacket, parka, cardigan, blazer, vest, sweater
- pants: any full-length lower garment — trousers, jeans, leggings, chinos, joggers
- footwear: any shoes, boots, sandals, heels, sneakers, slippers

If the photo's MAIN subject does not fit one of the five categories above (e.g. a bag, scarf, dress, skirt, shorts, glasses, jewelry), respond with exactly:
unsupported

(2) FIT — only for shirt / jacket / pants. For headwear / footwear, output "fit: null".
- skinny: skin-tight or close to body, light tapering
- regular: standard cut, light ease, follows body shape
- relaxed: clearly loose with visible airspace, but not boxy
- oversize: deliberately boxy/baggy, dropped shoulders, significant slack

(3) LENGTH — only for jacket and pants; for the rest, output "length: null".
- jacket lengths (hem position): cropped, waist, hip, thigh, knee, full-length
- pants lengths (inseam): thigh-shorts, knee-shorts, ankle-length, full-length

(4) TITLE — a concise descriptive title for the GARMENT shown, 3 to 7 words, plain English, no marketing fluff, no brand names. Examples: "Tan leather lace-up boots", "Black ribbed cotton tank top", "Faded blue straight-leg jeans".

Reply in EXACTLY this format, no extra lines, no commentary:
title: <text>
category: <category-value>
fit: <fit-value-or-null>
length: <length-value-or-null>"##;

const ITEM_CATEGORIES: [&str; 5] = ["headwear", "shirt", "jacket", "pants", "footwear"];
const FIT_PROFILES: [&str; 4] = ["skinny", "regular", "relaxed", "oversize"];
const JACKET_LENGTHS: [&str; 6] = ["cropped", "waist", "hip", "thigh", "knee", "full-length"];
const PANTS_LENGTHS: [&str; 4] = ["thigh-shorts", "knee-shorts", "ankle-length", "full-length"];

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct AnalyzedItem {
    pub title: String,
    pub category: String,
    pub fit: Option<String>,
    pub length: Option<String>,
    pub colors: Vec<ColorInfo>,
}

pub struct ParsedAnalysis {
    pub kind: String,
    pub item: Option<AnalyzedItem>,
}

/// Port of the legacy visionAnalyze regex parsing: unsupported marker,
/// then title/category/fit/length lines with category whitelist and
/// category-scoped fit/length validation. Title defaults to "Wardrobe item".
pub fn parse_analysis(text: &str) -> ParsedAnalysis {
    if text
        .lines()
        .any(|l| l.trim().eq_ignore_ascii_case("unsupported"))
    {
        return ParsedAnalysis { kind: "unsupported".into(), item: None };
    }
    let category = match field_value(text, "category") {
        Some(v) if ITEM_CATEGORIES.contains(&v) => v.to_string(),
        _ => return ParsedAnalysis { kind: "unsupported".into(), item: None },
    };
    let title = field_value(text, "title")
        .filter(|t| !t.is_empty())
        .unwrap_or("Wardrobe item")
        .to_string();
    let fit = if matches!(category.as_str(), "shirt" | "jacket" | "pants") {
        field_value(text, "fit")
            .map(|v| v.to_ascii_lowercase())
            .filter(|v| v != "null")
            .filter(|v| FIT_PROFILES.contains(&v.as_str()))
    } else {
        None
    };
    let allowed: &[&str] = match category.as_str() {
        "jacket" => &JACKET_LENGTHS,
        "pants" => &PANTS_LENGTHS,
        _ => &[],
    };
    let length = field_value(text, "length")
        .map(|v| v.to_ascii_lowercase())
        .filter(|v| v != "null")
        .filter(|v| allowed.contains(&v.as_str()));
    ParsedAnalysis {
        kind: "ok".into(),
        item: Some(AnalyzedItem {
            title,
            category,
            fit,
            length,
            colors: Vec::new(),
        }),
    }
}

/// First line shaped `key: value` (case-insensitive key), value trimmed.
fn field_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    text.lines().find_map(|line| {
        let (head, rest) = line.split_once(':')?;
        if head.trim().eq_ignore_ascii_case(key) {
            Some(rest.trim())
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyze_prompt_matches_legacy_byte_length() {
        assert_eq!(ANALYZE_PROMPT.len(), 2172);
        assert!(ANALYZE_PROMPT.starts_with("You are a wardrobe metadata extractor"));
        assert!(ANALYZE_PROMPT.ends_with("length: <length-value-or-null>"));
    }

    #[test]
    fn parses_full_reply_with_fit_and_length() {
        let parsed = parse_analysis(
            "title: Black ribbed cotton tank top\ncategory: shirt\nfit: relaxed\nlength: null\n",
        );
        assert_eq!(parsed.kind, "ok");
        let item = parsed.item.unwrap();
        assert_eq!(item.title, "Black ribbed cotton tank top");
        assert_eq!(item.category, "shirt");
        assert_eq!(item.fit.as_deref(), Some("relaxed"));
        assert_eq!(item.length, None);
    }

    #[test]
    fn length_is_scoped_to_category() {
        // pants with an invalid jacket length → null
        let parsed = parse_analysis(
            "title: Jeans\ncategory: pants\nfit: regular\nlength: knee\n",
        );
        let item = parsed.item.unwrap();
        assert_eq!(item.length, None);
        // pants with a valid pants length → kept
        let parsed = parse_analysis(
            "title: Jeans\ncategory: pants\nfit: regular\nlength: ankle-length\n",
        );
        assert_eq!(parsed.item.unwrap().length.as_deref(), Some("ankle-length"));
    }

    #[test]
    fn invalid_category_is_unsupported() {
        let parsed = parse_analysis("title: A dress\ncategory: dress\nfit: null\nlength: null\n");
        assert_eq!(parsed.kind, "unsupported");
    }

    #[test]
    fn missing_category_is_unsupported() {
        let parsed = parse_analysis("title: A boot\n");
        assert_eq!(parsed.kind, "unsupported");
    }
}