use std::collections::HashSet;

pub const SLOTS: [&str; 5] = ["headwear", "base", "outer", "bottom", "footwear"];

/// Order in which the legacy pipeline appends absence clauses (footwear first,
/// then headwear, then outer) — see dress-avatar-pipeline.ts.
const ABSENCE_SLOT_ORDER: [&str; 3] = ["footwear", "headwear", "outer"];

/// Maps app item categories to dress-avatar slots.
pub fn category_to_slot(category: &str) -> Option<&'static str> {
    match category {
        "shirt" => Some("base"),
        "pants" => Some("bottom"),
        "jacket" => Some("outer"),
        "footwear" => Some("footwear"),
        "headwear" => Some("headwear"),
        _ => None,
    }
}

/// Verbatim `fitDescriptor` from the legacy dress-avatar pipeline. Renders an
/// empty string for unknown/null fits.
pub fn fit_descriptor(fit: Option<&str>) -> String {
    let Some(fit) = fit else { return String::new() };
    let desc = match fit {
        "skinny" => "a SKINNY fit (close to the body, narrow silhouette through torso/limbs)",
        "regular" => "a REGULAR fit (standard cut, neither tight nor loose)",
        "relaxed" => "a RELAXED fit (loose drape with extra room through torso/limbs, but not oversize)",
        "oversize" => "an OVERSIZE fit (intentionally large, dropped shoulders, voluminous silhouette)",
        _ => return String::new(),
    };
    format!(" The garment must be rendered with {desc}; do NOT idealize toward a different fit.")
}

/// Verbatim `topLengthDescriptor` from the legacy pipeline (jacket lengths).
pub fn top_length_descriptor(length: Option<&str>) -> String {
    let Some(length) = length else { return String::new() };
    let desc = match length {
        "cropped" => "CROPPED — hem above the natural waist, exposing midriff or the very upper waistband",
        "waist" => "WAIST length — hem sits exactly at the natural waist",
        "hip" => "HIP length — hem falls at the hip line, just below the natural waist",
        "thigh" => "THIGH length — hem extends down to mid-thigh, like a tunic or long sweater",
        "knee" => "KNEE length — hem reaches the knee, like a long coat",
        "full-length" => "FULL-LENGTH — hem extends past the knee toward the ankle, like a long coat",
        _ => return String::new(),
    };
    format!(" The hem length is {desc}; match that exact hem position regardless of how the source image is framed.")
}

/// Verbatim `pantsLengthDescriptor` from the legacy pipeline.
pub fn pants_length_descriptor(length: Option<&str>) -> String {
    let Some(length) = length else { return String::new() };
    let desc = match length {
        "thigh-shorts" => "THIGH SHORTS — hem ends at mid-thigh",
        "knee-shorts" => "KNEE SHORTS — hem ends at the knee",
        "ankle-length" => "ANKLE LENGTH — hem sits at the ankle bone, slightly above the foot",
        "full-length" => "FULL LENGTH — hem reaches the ankle and breaks over the foot",
        _ => return String::new(),
    };
    format!(" The hem length is {desc}; do NOT default to full-length if the metadata says otherwise.")
}

fn base_clause(i: usize, fit: Option<&str>) -> String {
    format!(
        "Image {i} is a BASE-LAYER top garment (t-shirt, blouse, sweater, dress, etc.). REMOVE the plain white t-shirt from image 1 entirely and replace it with this garment, draped naturally on the body in three dimensions — fabric wraps around the torso, sleeves wrap around the arms, with realistic folds and shading. Match the neckline, sleeve length, hem position, and overall silhouette to what is shown in image {i} (if the source is short-sleeve, output is short-sleeve; if long-sleeve, output is long-sleeve; if cropped, output is cropped). If image {i} shows a dress, the dress replaces BOTH the white tee AND the white shorts; do not draw any visible bottom under it. Do not render this garment as a flat 2D panel pasted on the body.{}",
        fit_descriptor(fit)
    )
}

fn outer_clause(i: usize, fit: Option<&str>, length: Option<&str>) -> String {
    format!(
        "Image {i} is an OUTER-LAYER garment (jacket, coat, cardigan, sweater, pullover, hoodie, blazer, etc.). Add this garment OVER whatever upper-body garment is now present in image 1, draped naturally in three dimensions — collar, lapels, sleeves, and hem matching what is shown in image {i}. The outer layer's OWN fabric, color, knit texture, distressing, prints, and graphics come EXCLUSIVELY from image {i}; do NOT transfer the base-layer top's print, graphic, logo, or color onto the outer layer's surface. The outer layer is OPAQUE wherever its fabric exists in image {i} — its body, sleeves, and front fully OCCLUDE the base-layer top's chest design. Only if image {i} explicitly shows the outer as OPEN/UNZIPPED/UNBUTTONED at the front, or shows actual TORN HOLES with empty space behind them, may the base-layer top peek through — and then only inside those exact openings, never bleeding onto the outer's intact fabric. Do not render this garment as a flat 2D panel.{}{}",
        fit_descriptor(fit),
        top_length_descriptor(length)
    )
}

fn bottom_clause(i: usize, fit: Option<&str>, length: Option<&str>) -> String {
    format!(
        "Image {i} is a BOTTOM garment (pants, shorts, skirt, etc.). REMOVE the plain white shorts from image 1 entirely and replace them with this garment. The garment wraps fully around the lower body in three dimensions — both legs are completely covered by fabric, with no see-through and no bare leg visible behind the fabric (it is NOT a flat 2D panel, it is real garment fabric draped around the legs). The waistband sits at the natural waist or hip as shown in image {i}, and the fabric drapes naturally over the legs with realistic folds and shading.{}{}",
        fit_descriptor(fit),
        pants_length_descriptor(length)
    )
}

fn footwear_clause(i: usize) -> String {
    format!(
        "Image {i} is FOOTWEAR (shoes, sneakers, boots, sandals, etc.). Add this footwear to the figure's bare feet in image 1, with both feet wearing the same pair, properly fitted, and rendered in three dimensions. Do not leave the feet bare."
    )
}

fn headwear_clause(i: usize) -> String {
    format!(
        "Image {i} is HEADWEAR (hat, cap, beanie, etc.). Add this headwear to the figure's head in image 1, sitting naturally on top of the hair without crushing or removing it."
    )
}

/// Verbatim `SLOT_CLAUSES[slot]` from the legacy pipeline, rendered for a
/// garment at image index `idx` (mannequin = image 1, garments start at 2).
pub fn slot_clause(slot: &str, idx: usize, fit: Option<&str>, length: Option<&str>) -> String {
    match slot {
        "base" => base_clause(idx, fit),
        "outer" => outer_clause(idx, fit, length),
        "bottom" => bottom_clause(idx, fit, length),
        "footwear" => footwear_clause(idx),
        "headwear" => headwear_clause(idx),
        _ => unreachable!("unknown slot {slot}"),
    }
}

/// Verbatim `drapeClause` from the legacy pipeline.
pub const DRAPE_CLAUSE: &str = "Render each new garment with realistic fabric drape, shadows, and folds appropriate to its shape and material as shown in its source image. Match the cut shown in each source: if the source shows a relaxed-fit garment, drape it loosely; if fitted, drape it close to the body. Do not idealize or alter the cut.";

/// Verbatim `pass1SceneClause` from the legacy pipeline.
pub const PASS1_SCENE_CLAUSE: &str = "Preserve from image 1: camera angle, framing (full body visible head to feet), and overall figure proportions. Photorealistic, sharp focus, no text, no watermarks. Plain studio lighting.";

/// Verbatim absence clauses emitted when a slot has no garment.
pub const NO_FOOTWEAR_CLAUSE: &str = "NO FOOTWEAR: the output figure must be BAREFOOT. Do not add shoes, sneakers, boots, sandals, socks, or any covering on the feet. The placeholder shoes / socks visible on the mannequin in image 1 are NOT part of the outfit — render the bare feet showing skin and toes naturally.";
pub const NO_HEADWEAR_CLAUSE: &str = "NO HEADWEAR: the output figure must be BAREHEADED. Do not add a hat, cap, beanie, headband, or any head covering — leave the hair fully visible and uncovered.";
pub const NO_OUTER_CLAUSE: &str = "NO OUTER LAYER: do not add a jacket, coat, cardigan, blazer, vest, or any second top layer over the base garment.";

/// Absence clause for a slot not covered by a provided garment, or None if the
/// slot is present.
pub fn absence_clause(slot: &str, present: bool) -> Option<&'static str> {
    if present {
        return None;
    }
    Some(match slot {
        "footwear" => NO_FOOTWEAR_CLAUSE,
        "headwear" => NO_HEADWEAR_CLAUSE,
        "outer" => NO_OUTER_CLAUSE,
        _ => return None,
    })
}

/// Absence clauses for every missing slot, in the legacy assembly order
/// (footwear → headwear → outer), matching dress-avatar-pipeline.ts.
pub fn absent_slot_clauses(present: &HashSet<&str>) -> Vec<&'static str> {
    ABSENCE_SLOT_ORDER
        .into_iter()
        .filter_map(|slot| absence_clause(slot, present.contains(slot)))
        .collect()
}

/// Assembles the verbatim PASS1 prompt (legacy `pass1Prompt` template literal).
/// `slot_clauses` is the space-joined rendered SLOT_CLAUSES; `absence_clauses`
/// are the "DO NOT INVENT" clauses for missing slots.
pub fn pass1_prompt(slot_clauses: &str, absence_clauses: &[&str]) -> String {
    let absence = if absence_clauses.is_empty() {
        String::new()
    } else {
        format!("\n\n{}", absence_clauses.join(" "))
    };
    format!(
        "DRESS THE MANNEQUIN: image 1 shows a faceless mannequin wearing a plain white t-shirt and plain white shorts as placeholders. Replace those placeholders with the garments described below. If a garment slot is not provided (e.g. no base, no bottom), keep the corresponding placeholder garment as-is. The mannequin has no face — keep it that way; do not add a face. {slot_clauses}{absence}\n\nGARMENT FIT: the base-layer top hangs straight down from the shoulders to the hip, FULLY UNTUCKED, OUTSIDE the bottom garment's waistband — no tucking, no asymmetric bunching, no awkward folds at the waist. The bottom garment's waistband sits at the natural waist or hip and is COVERED by the base-layer top's hem. Any outer layer drapes naturally over the untucked base-layer.\n\nLAYERING ISOLATION: each garment keeps its own source image's fabric, color, texture, prints, graphics, and distressing. NEVER copy the base-layer top's print, logo, or graphic onto the outer layer's surface — the outer layer's body and sleeves are opaque and fully cover the base-layer's chest design wherever the outer's fabric exists. Holes, rips, or distressing visible in the outer layer's source must look like REAL torn fabric edges with the bare base-layer fabric color showing through, NOT like a graphic painted onto the outer's surface.\n\n{DRAPE}\n\n{SCENE}",
        DRAPE = DRAPE_CLAUSE,
        SCENE = PASS1_SCENE_CLAUSE,
    )
}

/// Verbatim legacy TRYON_PROMPT (shared with steal-the-look).
pub use crate::steal_the_look_prompts::TRYON_PROMPT;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_descriptor_renders_verbatim() {
        assert_eq!(fit_descriptor(Some("regular")), " The garment must be rendered with a REGULAR fit (standard cut, neither tight nor loose); do NOT idealize toward a different fit.");
        assert_eq!(fit_descriptor(Some("bogus")), "");
        assert_eq!(fit_descriptor(None), "");
    }

    #[test]
    fn length_descriptors_cover_known_values() {
        assert!(top_length_descriptor(Some("cropped")).starts_with(" The hem length is CROPPED —"));
        assert!(pants_length_descriptor(Some("full-length")).starts_with(" The hem length is FULL LENGTH —"));
        assert_eq!(top_length_descriptor(Some("thigh-shorts")), "");
        assert_eq!(pants_length_descriptor(Some("knee")), "");
    }

    #[test]
    fn slot_clause_uses_image_index_and_descriptors() {
        let base = slot_clause("base", 2, Some("oversize"), None);
        assert!(base.starts_with("Image 2 is a BASE-LAYER top garment"));
        assert!(base.contains("an OVERSIZE fit"));
        assert!(!base.contains("${"));

        let outer = slot_clause("outer", 3, Some("regular"), Some("hip"));
        assert!(outer.starts_with("Image 3 is an OUTER-LAYER garment"));
        assert!(outer.contains("HIP length — hem falls at the hip line"));
        assert!(!outer.contains("${"));
    }

    #[test]
    fn absence_clause_emitted_only_for_missing_slots() {
        assert_eq!(absence_clause("footwear", false), Some(NO_FOOTWEAR_CLAUSE));
        assert_eq!(absence_clause("headwear", false), Some(NO_HEADWEAR_CLAUSE));
        assert_eq!(absence_clause("outer", false), Some(NO_OUTER_CLAUSE));
        assert_eq!(absence_clause("base", false), None);
        assert_eq!(absence_clause("footwear", true), None);
    }

    #[test]
    fn absent_slot_clauses_follow_legacy_order_for_single_shirt() {
        let present: HashSet<&str> = HashSet::from(["base"]);
        let absences = absent_slot_clauses(&present);
        assert_eq!(absences, vec![NO_FOOTWEAR_CLAUSE, NO_HEADWEAR_CLAUSE, NO_OUTER_CLAUSE]);
        assert!(absences[0].starts_with("NO FOOTWEAR"));
        assert!(absences[1].starts_with("NO HEADWEAR"));
        assert!(absences[2].starts_with("NO OUTER LAYER"));
    }

    #[test]
    fn pass1_prompt_assembles_verbatim_shape() {
        let clauses = slot_clause("base", 2, Some("regular"), None);
        let absences = [NO_FOOTWEAR_CLAUSE, NO_HEADWEAR_CLAUSE, NO_OUTER_CLAUSE];
        let p = pass1_prompt(&clauses, &absences);
        assert!(p.starts_with("DRESS THE MANNEQUIN: image 1 shows a faceless mannequin"));
        assert!(p.contains(&clauses));
        assert!(p.contains(NO_FOOTWEAR_CLAUSE));
        assert!(p.contains(NO_HEADWEAR_CLAUSE));
        assert!(p.contains(NO_OUTER_CLAUSE));
        assert!(p.contains("\n\nGARMENT FIT:"));
        assert!(p.contains("\n\nLAYERING ISOLATION:"));
        assert!(p.contains(DRAPE_CLAUSE));
        assert!(p.ends_with(PASS1_SCENE_CLAUSE));
        assert!(!p.contains("${"));
    }

    #[test]
    fn pass1_prompt_without_absences_omits_them() {
        let clauses = slot_clause("footwear", 2, None, None);
        let p = pass1_prompt(&clauses, &[]);
        assert!(p.contains("Image 2 is FOOTWEAR"));
        assert!(!p.contains("NO FOOTWEAR"));
        assert!(!p.contains("NO HEADWEAR"));
        assert!(!p.contains("\n\nNO "));
    }

    #[test]
    fn tryon_prompt_is_shared_verbatim() {
        assert_eq!(TRYON_PROMPT, crate::steal_the_look_prompts::TRYON_PROMPT);
        assert!(TRYON_PROMPT.contains("DO NOT TOUCH THE HEAD"));
    }

    #[test]
    fn category_maps_to_slots() {
        assert_eq!(category_to_slot("shirt"), Some("base"));
        assert_eq!(category_to_slot("pants"), Some("bottom"));
        assert_eq!(category_to_slot("jacket"), Some("outer"));
        assert_eq!(category_to_slot("footwear"), Some("footwear"));
        assert_eq!(category_to_slot("headwear"), Some("headwear"));
        assert_eq!(category_to_slot("dress"), None);
    }
}