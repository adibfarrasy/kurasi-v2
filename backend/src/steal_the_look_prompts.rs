/// Verbatim detect prompt from the legacy steal-the-look pipeline (rendered
/// value of the old DETECT_PROMPT template literal).
pub const DETECT_PROMPT: &str = r##"You are a fashion analyst. Look at the photo and detect every clothing item visible on the single person in the frame that fits one of these EXACT categories. DISCARD anything else (bags, scarves, jewelry, watches, glasses, sunglasses, ties, belts, dresses, skirts, shorts, etc.) — do NOT include them in the output.

Special cases (respond with JSON shape `{ "error": "<reason>" }`):
  - More than one person visible → `{ "error": "multiple_people" }`
  - No person visible, or no recognizable garment → `{ "error": "unknown" }`

Otherwise respond with a JSON ARRAY (no commentary, no markdown fences) where each element has this exact shape:
{
  "category": one of "headwear" | "shirt" | "jacket" | "pants" | "footwear",
  "title": short descriptive title (3-7 plain-English words, no brand names),
  "fit": one of "skinny" | "regular" | "relaxed" | "oversize", or null for non-body-worn items,
  "length": hem position — see length rules below; null for items where length doesn't apply,
  "colors": array of 1-3 dominant colors of the garment, each `{ "name": string, "hex": "#rrggbb", "ratio": number 0..1 }`. Ratios sum to ~1.
  "bbox": [x, y, w, h] — NORMALIZED 0..1 floats, top-left origin, of the smallest axis-aligned rectangle that contains the garment. For HEADWEAR specifically, INCLUDE THE BRIM if it has one (a baseball cap's brim must be inside the bbox, not cut off) — bias the bbox a little wider/taller for headwear to be safe.
}

Category rules:
  - headwear: any hat, cap, beanie, headband, bucket hat, sun hat
  - shirt: any top worn directly on the torso — t-shirt, tank, henley, button-down, polo, oxford, blouse
  - jacket: any outer-layer garment — jacket, coat, hoodie, cardigan, blazer, vest, parka, sweater
  - pants: any full-length lower garment — trousers, jeans, leggings, chinos
  - footwear: any shoes, boots, sandals, heels, sneakers, slippers

DO NOT emit items for: bags, scarves, glasses, sunglasses, watches, jewelry, belts, ties, dresses, skirts, shorts. Just leave them out of the array.

Fit rules:
  - "fit" is the silhouette, not the cut name.
  - skinny: garment hugs the body closely — narrow silhouette through torso/limbs.
  - regular: standard cut, neither tight nor loose.
  - relaxed: loose drape with extra room through torso/limbs, but not oversize.
  - oversize: intentionally large — dropped shoulders, voluminous silhouette.
  - Set fit only for shirt, jacket, pants. Otherwise null.

Length rules (hem position):
  - jacket: one of "cropped" | "waist" | "hip" | "thigh" | "knee" | "full-length".
      cropped = above the natural waist, exposing midriff or upper waistband.
      waist = at the natural waist.
      hip = falls at the hip, just below the waist.
      thigh = mid-thigh (tunic / long sweater length).
      knee = reaches the knee (long coat).
      full-length = past the knee toward the ankle (overcoat).
  - pants: one of "thigh-shorts" | "knee-shorts" | "ankle-length" | "full-length".
      thigh-shorts = mid-thigh hem.
      knee-shorts = knee-length hem.
      ankle-length = sits at the ankle, slightly above the foot.
      full-length = reaches the ankle and breaks over the foot.
  - For headwear / shirt / footwear set length to null.

For LAYERED outerwear (open jacket over a shirt) report BOTH items separately with their own bboxes — the bboxes may overlap; that is correct.

Reply with ONLY the JSON. No other text."##;

/// Verbatim try-on prompt (old tryon-prompt.ts TRYON_PROMPT).
pub const TRYON_PROMPT: &str = r##"DO NOT TOUCH THE HEAD: the entire head region of image 1 — face, eyes, nose, mouth, jawline, cheeks, ears, hair (every strand, the full volume and shape), beard, mustache, stubble, neck — must be preserved BIT FOR BIT IDENTICAL to image 1. Copy the head region from image 1 to the output unchanged. Do NOT regenerate the face. Do NOT redraw any facial feature. Do NOT modify the hair in any way.

POSE LOCK (HEAD TO TOE): the EXACT pose of the person in image 1 must be preserved bit-for-bit in the output, from the top of the head all the way down to the tips of the toes. Same body orientation. Same contrapposto / weight distribution. Same arm positions (including hands in pockets, hands at sides, arms crossed, etc. — match exactly). Same leg positions, stance width, knee bend. Same head tilt and gaze direction.

FEET LOCK: foot placement must be a 1:1 match with image 1, including each foot's exact angle, rotation, and ground contact. If image 1's left foot is up on its toes / tip-toed / raised heel / pointed / pivoted outward, the output's left foot MUST be in the identical tip-toe / raised-heel position with the same toe direction. Same for the right foot. Do NOT plant a foot flat that was tip-toed in image 1. Do NOT rotate or re-angle the feet. The shoes go ON the feet in their existing pose — the feet do not re-pose to fit a "default standing" shape.

The output figure must be a 1:1 silhouette match of image 1's pose; do NOT regenerate the body in a different pose, even if image 2's person is in a different pose. Image 2 contributes ONLY garments — never pose, body, or composition.

OUTFIT TRANSFER: replace the entire outfit currently worn by the person in image 1 with the EXACT outfit being worn by the person in image 2. Match every visible garment from image 2 — top (t-shirt / shirt / sweater / etc.), outer layer (jacket / coat / cardigan if present), bottom (pants / jeans / skirt as shown), footwear, headwear (hat / cap if present) — including its color, pattern, fabric texture, fit, length, hem position, sleeve length, neckline, and overall silhouette. Drape each garment naturally on the body in image 1 in three dimensions with realistic fabric folds and shading. If image 2 shows the outer layer open, render it open in the output and let the inner garment show through. Sleeve length and pant length must MATCH image 2 (e.g. short-sleeve stays short-sleeve, full-length pants stay full-length).

HEADWEAR ORIENTATION: if image 2 shows headwear (a cap, hat, beanie, etc.), the headwear in the output must be oriented to match the head direction in image 1, NOT image 2. The headwear rotates with the head — its brim, logo, or front face points in the same direction as image 1's face. If image 1's head is turned to one side and image 2's figure faces forward (or vice versa), render the cap turned to match image 1, with the brim aimed in the direction the face is looking.

PRESERVE from image 1: pose (head to toe, including each foot's angle and tip-toe / heel-raise state), body orientation, contrapposto stance, camera angle, framing (full body visible head to feet, with the toes never cropped), lighting, and background. Do NOT change the body shape or proportions. Do NOT change the head. Do NOT re-plant or re-angle the feet.

Photorealistic, sharp focus, no text, no watermarks."##;

pub const SHARED_SUFFIX: &str =
    r##"Photorealistic, sharp focus, even soft studio lighting, no text, no watermarks, no tags."##;

const HANGER_TOP_TEMPLATE: &str = r##"Place the garment from image 1 (a ${categoryLabel}) onto the EXACT wooden clothes hanger shown in image 2. The garment hangs naturally from the hanger's shoulders, fabric falling straight down with subtle natural folds. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE-PAINTED wooden hanger as in image 2 — same white color, same shape, same size, same hook (chrome metal), same position. Do NOT change the hanger to a darker wood, stained wood, plastic, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, print, logos, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${SHARED_SUFFIX}"##;

const HANGER_BOTTOM_TEMPLATE: &str = r##"Place the bottoms from image 1 (a ${categoryLabel}) onto the EXACT clip hanger shown in image 2. The waistband is held by the hanger's clips with the legs hanging straight down naturally with gravity. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE plastic clip hanger as in image 2 — same white color, same shape, same size, same chrome hook, same clips. Do NOT change the hanger to a darker color, different style, wooden, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${SHARED_SUFFIX}"##;

const HEADWEAR_BASE_TEMPLATE: &str = r##"A photograph of the white mannequin head from image 2 wearing the EXACT headwear shown in image 1. Identify the type from image 1 (cap, beanie, bucket hat, sun hat, etc.) and PRESERVE its exact silhouette in 3D — do NOT morph it into a different category of hat. Image 2 is the canonical scene; do NOT modify it: every pixel of the mannequin and the teal background that is not occluded by the new headwear must be IDENTICAL to image 2. The mannequin's facial orientation is fixed by image 2 and must not change. Rotate the headwear (not the head) so its front aligns with the direction the mannequin's face points. Sizing must be SNUG — the inner band hugs the head's circumference at the brow line, same width as the head, NOT larger, NOT floating. The crown's visible width (excluding any brim) must NOT exceed the visible width of the head at the temples. If anything, render the headwear slightly UNDERSIZED rather than oversized. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the headwear's exact color, material, pattern, branding, and proportions from image 1. Do not add any human figure. ${SHARED_SUFFIX}"##;

const FLAT_PROMPT_TEMPLATE: &str = r##"Clean studio product shot of the footwear from image 1 (a ${categoryLabel}). Show a PAIR of shoes (left and right) sitting side by side, both in a clear THREE-QUARTER ANGLED view — the camera looks down at the shoes from roughly 30 degrees above eye-level and 30 degrees off the side, so BOTH the side profile AND the top of each shoe are clearly visible at the same time. Both shoes sit level on an invisible flat ground, with toes pointing to the right and slightly toward the camera. The two shoes are placed close to each other but NOT overlapping. Preserve the exact color, material, pattern, laces, sole, branding, and proportions from image 1. Do not add any human figure or feet. ${flatSuffix}"##;

/// Verbatim flatSuffix literal from buildFlatPrompt (includes the
/// `${SHARED_SUFFIX}` placeholder which is resolved at assembly time).
const FLAT_SUFFIX: &str = r##"${SHARED_SUFFIX} Plain seamless deep teal studio background, fully saturated solid color, no gradient, no shadow."##;

/// Builds the hanger/headwear composition prompt for a detected item. `mode`
/// is one of "hanger-top" | "hanger-bottom" | "headwear-base".
pub fn build_hanger_prompt(mode: &str, label: &str) -> String {
    match mode {
        "hanger-top" => HANGER_TOP_TEMPLATE
            .replace("${categoryLabel}", label)
            .replace("${SHARED_SUFFIX}", SHARED_SUFFIX),
        "hanger-bottom" => HANGER_BOTTOM_TEMPLATE
            .replace("${categoryLabel}", label)
            .replace("${SHARED_SUFFIX}", SHARED_SUFFIX),
        _ => HEADWEAR_BASE_TEMPLATE.replace("${SHARED_SUFFIX}", SHARED_SUFFIX),
    }
}

/// Builds the flat studio-shot prompt (footwear).
pub fn build_flat_prompt(label: &str) -> String {
    let flat_suffix = FLAT_SUFFIX.replace("${SHARED_SUFFIX}", SHARED_SUFFIX);
    FLAT_PROMPT_TEMPLATE
        .replace("${categoryLabel}", label)
        .replace("${flatSuffix}", &flat_suffix)
}

pub fn category_to_mode(category: &str) -> &'static str {
    match category {
        "shirt" | "jacket" => "hanger-top",
        "pants" => "hanger-bottom",
        "headwear" => "headwear-base",
        _ => "flat",
    }
}

pub fn category_label(category: &str) -> &'static str {
    match category {
        "shirt" => "shirt",
        "jacket" => "outer-layer garment",
        "pants" => "pair of pants",
        "footwear" => "pair of shoes",
        _ => "piece of headwear",
    }
}

/// True when `mode` has an embedded template asset.
pub fn template_url(mode: &str) -> Result<(), String> {
    match mode {
        "hanger-top" | "hanger-bottom" | "headwear-base" => Ok(()),
        _ => Err(format!("no template asset for mode {mode}")),
    }
}

/// Bytes of the embedded template asset for a refine mode. The PNGs are baked
/// into the binary at compile time so the server is self-contained and
/// CWD-independent.
pub fn template_bytes(mode: &str) -> Result<Vec<u8>, String> {
    match mode {
        "hanger-top" => Ok(include_bytes!("../avatar/assets/hanger-top.png").to_vec()),
        "hanger-bottom" => Ok(include_bytes!("../avatar/assets/hanger-bottom.png").to_vec()),
        "headwear-base" => Ok(include_bytes!("../avatar/assets/headwear-base.png").to_vec()),
        _ => Err(format!("no template asset for mode {mode}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hanger_prompt_inserts_label_and_suffix() {
        let p = build_hanger_prompt("hanger-top", "shirt");
        assert!(p.starts_with("Place the garment from image 1 (a shirt) onto the EXACT wooden"));
        assert!(p.ends_with(SHARED_SUFFIX));
        assert!(!p.contains("${"));
    }

    #[test]
    fn flat_prompt_inserts_label_and_suffix() {
        let p = build_flat_prompt("pair of shoes");
        assert!(p.starts_with(
            "Clean studio product shot of the footwear from image 1 (a pair of shoes)."
        ));
        assert!(p.ends_with("Plain seamless deep teal studio background, fully saturated solid color, no gradient, no shadow."));
        assert!(!p.contains("${"));
    }

    #[test]
    fn mode_and_label_match_legacy_maps() {
        assert_eq!(category_to_mode("shirt"), "hanger-top");
        assert_eq!(category_to_mode("jacket"), "hanger-top");
        assert_eq!(category_to_mode("pants"), "hanger-bottom");
        assert_eq!(category_to_mode("headwear"), "headwear-base");
        assert_eq!(category_to_mode("footwear"), "flat");
        assert_eq!(category_label("jacket"), "outer-layer garment");
        assert_eq!(category_label("pants"), "pair of pants");
        assert_eq!(category_label("footwear"), "pair of shoes");
        assert_eq!(category_label("headwear"), "piece of headwear");
    }

    #[test]
    fn detect_prompt_contains_error_shapes_with_plain_backticks() {
        assert!(DETECT_PROMPT.contains('`'));
        assert!(!DETECT_PROMPT.contains(r"\`"));
        assert!(DETECT_PROMPT.contains("\"multiple_people\""));
    }

    #[test]
    fn tryon_prompt_locks_head_and_pose() {
        assert!(TRYON_PROMPT.contains("DO NOT TOUCH THE HEAD"));
        assert!(TRYON_PROMPT.contains("POSE LOCK"));
        assert!(TRYON_PROMPT.contains("OUTFIT TRANSFER"));
    }
}
