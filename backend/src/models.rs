use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ItemCategory {
    Headwear,
    Shirt,
    Jacket,
    Pants,
    Footwear,
}

impl ItemCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemCategory::Headwear => "headwear",
            ItemCategory::Shirt => "shirt",
            ItemCategory::Jacket => "jacket",
            ItemCategory::Pants => "pants",
            ItemCategory::Footwear => "footwear",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ItemFit {
    Skinny,
    Regular,
    Relaxed,
    Oversize,
}

impl ItemFit {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemFit::Skinny => "skinny",
            ItemFit::Regular => "regular",
            ItemFit::Relaxed => "relaxed",
            ItemFit::Oversize => "oversize",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum ItemLength {
    #[serde(rename = "cropped")]
    Cropped,
    #[serde(rename = "waist")]
    Waist,
    #[serde(rename = "hip")]
    Hip,
    #[serde(rename = "thigh")]
    Thigh,
    #[serde(rename = "knee")]
    Knee,
    #[serde(rename = "full-length")]
    FullLength,
    #[serde(rename = "thigh-shorts")]
    ThighShorts,
    #[serde(rename = "knee-shorts")]
    KneeShorts,
    #[serde(rename = "ankle-length")]
    AnkleLength,
}

impl ItemLength {
    pub fn as_str(self) -> &'static str {
        match self {
            ItemLength::Cropped => "cropped",
            ItemLength::Waist => "waist",
            ItemLength::Hip => "hip",
            ItemLength::Thigh => "thigh",
            ItemLength::Knee => "knee",
            ItemLength::FullLength => "full-length",
            ItemLength::ThighShorts => "thigh-shorts",
            ItemLength::KneeShorts => "knee-shorts",
            ItemLength::AnkleLength => "ankle-length",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ColorInfo {
    pub name: String,
    pub hex: String,
    pub ratio: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_round_trips() {
        let s = serde_json::to_string(&ItemCategory::Headwear).unwrap();
        assert_eq!(s, "\"headwear\"");
        assert_eq!(ItemCategory::Headwear.as_str(), "headwear");
    }

    #[test]
    fn length_uses_hyphenated_values() {
        let s = serde_json::to_string(&ItemLength::FullLength).unwrap();
        assert_eq!(s, "\"full-length\"");
        assert_eq!(ItemLength::FullLength.as_str(), "full-length");
    }

    #[test]
    fn rejects_unknown_category() {
        let r: Result<ItemCategory, _> = serde_json::from_str("\"hat\"");
        assert!(r.is_err());
    }
}