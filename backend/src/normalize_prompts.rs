/// Verbatim prompt port of `normalize-avatar-service.ts` (commit 096c47a).
///
/// Pipeline structure: classify (gemini vision) → build directive → pass1
/// (seedream pose+body normalization) → pass2 (seedream identity refinement)
/// → face-swap → rembg → finalize.
pub const BUILD_VALUES: [&str; 5] = ["lean", "athletic", "average", "fuller", "heavy"];

/// Verbatim CLASSIFY_PROMPT template literal from classifyBuild(), with the
/// `${dimsContext}` interpolation rendered at assembly time.
const CLASSIFY_PROMPT_TEMPLATE: &str = r##"You are a body-build classifier. Classify the person in this photo on the lean–heavy spectrum, focusing on body fat distribution and overall mass (NOT clothing).

Categories:
- lean: low body fat, minimal soft tissue, narrow frame, no significant muscle bulk.
- athletic: low-to-moderate body fat with visible muscle definition, toned, V-taper or hourglass.
- average: typical adult build, neither lean nor heavy, soft tissue present but no obvious excess.
- fuller: carries noticeable extra weight, soft tissue clearly visible (belly, arms, thighs, face), no defined musculature.
- heavy: significantly higher body mass, pronounced soft tissue across torso and limbs.

${dimsContext}

If the photo is half-body, classify based on what's visible (torso, arms, face shape) and say so in your notes.

Reply in EXACTLY this format, no commentary:
build: <lean|athletic|average|fuller|heavy>
notes: <one short sentence describing the specific features that drove the classification>"##;

/// Verbatim BUILD_DIRECTIVES from the legacy pipeline.
const LEAN_DIRECTIVE: &str = "The person has a LEAN build: low body fat, minimal soft tissue, narrow frame, no significant muscle bulk. Render with narrow shoulders, slim limbs, flat abdomen, and visible bone structure (collarbones, jawline). Do NOT add muscle definition or athletic shaping.";
const ATHLETIC_DIRECTIVE: &str = "The person has an ATHLETIC build: low-to-moderate body fat with visible muscle definition. Render with toned arms, defined shoulders, slight V-taper (or hourglass for femme), and a flat abdomen. Muscle definition is appropriate but not exaggerated.";
const AVERAGE_DIRECTIVE: &str = "The person has an AVERAGE build: typical adult, neither lean nor heavy, with soft tissue present but no obvious excess and no defined musculature. Render with a relaxed silhouette, no abs visible, no visible muscle striation, slight softness around the abdomen and arms.";
const FULLER_DIRECTIVE: &str = "The person carries a FULLER build: noticeable extra weight, with soft tissue clearly visible across the belly, arms, thighs, and face. Render with a rounded abdomen (NOT flat), fuller arms, fuller thighs, softer jawline, and possibly a double chin or fuller cheeks. Do NOT slim, do NOT athleticize, do NOT add muscle definition. Preserve every roll and curve.";
const HEAVY_DIRECTIVE: &str = "The person has a HEAVY build: significantly higher body mass with pronounced soft tissue across torso and limbs. Render with a clearly rounded abdomen, fuller chest, fuller arms (visible upper-arm softness), fuller thighs, fuller face (double chin, fuller cheeks, softer jawline), and a wider overall silhouette. Do NOT slim under any circumstances.";

/// Verbatim buildPass1Prompt() template literal, with the three
/// `${buildDirective}` / `${buildNotesClause}` / `${dimsClause}`
/// interpolations rendered at assembly time.
const PASS1_PROMPT_TEMPLATE: &str = r##"A full-body, photorealistic studio photograph of one person on a deep teal seamless background, eye-level shot, 85mm lens look.

The output figure IS the person in image 1 — same face, same hair, same skin tone, same identity — relocated into image 2's pose, wearing a plain white outfit.

IDENTITY LOCK (FROM IMAGE 1 ONLY — image 1 IS the person being rendered): copy image 1's face exactly — facial features, eye shape, eye spacing, nose, mouth, lips, jawline, cheekbones, chin, ears, eyebrows, eyelashes. Copy image 1's hair exactly — same style, length, color, hairline, parting, density, volume. If image 1 shows a BALD or SHAVED head, the output MUST be BALD (visible scalp, no hair). If image 1 shows SHORT hair, render short hair. If image 1 shows long hair, render that exact long hair. Copy image 1's facial hair exactly — if image 1 is CLEAN-SHAVEN with no beard/mustache/stubble, the output MUST also be clean-shaven. If image 1 shows facial hair, render matching facial hair.

Image 2 contributes ZERO identity. Image 2's face, hair, hairline, hair color, beard, mustache, stubble, ears, and skin tone MUST NOT appear in the output under any circumstances.

SKIN TONE (FROM IMAGE 1 ONLY): sample the exact skin tone (hue, saturation, brightness, undertone) from image 1's visible skin and apply it uniformly across face, neck, arms, hands, legs, and feet. Face skin and body skin MUST be the same color with no seam.

POSE (FROM IMAGE 2 ONLY): the body pose, body orientation, contrapposto, weight distribution, arm positions, leg positions, stance width, knee bend, head tilt, head direction, gaze direction, and foot placement must match image 2 exactly. If image 2's head is turned diagonally to the side, the output's head MUST be turned at that same angle — do NOT default to a front-facing head. If image 2's foot is raised on the toes or pivoted, mirror that.

FEET LOCK: foot placement must be a 1:1 match with image 2, including each foot's exact angle, rotation, and ground contact.

The output figure must be a 1:1 silhouette match of image 2's pose. Do NOT default to a generic "front-facing standing straight" stance.

FRAMING (from image 2): full body visible head to feet, toes never cropped. Eye-level camera angle.

BODY BUILD: ${buildDirective} ${buildNotesClause} ${dimsClause}

OUTFIT: plain pure-white short-sleeve crew-neck cotton T-SHIRT (regular fit, no graphics, no logos, no text, no pockets, no contrast trim, pure #ffffff matte cotton, OPAQUE thick fabric — the chest must read as a smooth flat white surface with no body contours showing through) AND plain pure-white knee-length cotton SHORTS (regular fit, no graphics, no logos, no pockets, pure #ffffff matte cotton, opaque thick fabric). Bare arms below the short sleeves. Bare lower legs below the shorts. Bare feet — no shoes, no socks.

NO glasses, NO sunglasses, NO earrings, NO necklaces, NO watches, NO bracelets, NO rings, NO hats, NO headbands, NO scarves, NO hair clips. If image 1 shows glasses, REMOVE them so bare eyes are fully visible.

The mouth is closed with lips pressed gently together (closed-mouth Mona Lisa smile, no teeth visible).

If image 1 shows only the upper body (half-body shot), infer the lower body's shape and skin tone from the visible upper body, and pose the legs exactly like image 2.

Photorealistic, sharp focus, no text, no watermarks. Plain seamless deep teal studio background, fully saturated solid color, evenly lit with no gradient (no floor, no horizon, no shadow)."##;

/// Verbatim buildPass2Prompt() static prompt.
pub const PASS2_PROMPT: &str = r##"IDENTITY REFINEMENT: image 1 already shows the target avatar with image 2's identity baked in. Sharpen and correct the match using image 2 as the canonical reference for face, hair, and skin tone. The output is a polished version of image 1 with any identity drift corrected to match image 2 exactly.

FACE (refine from image 2): the face in the output must precisely match image 2's facial features — eye shape, eye spacing, nose shape and size, mouth shape, lip thickness, jawline, cheekbones, chin shape, ear shape, eyebrows, eyelashes. If image 1's face differs from image 2 in any of these, correct it. The mouth is closed with lips pressed gently together (closed-mouth Mona Lisa smile, no teeth visible). NO glasses, NO sunglasses.

HAIR (canonical reference is image 2 — OVERRIDE image 1's hair): the hair in the output MUST match image 2 — same style, length, color, hairline, parting, density. CRITICAL: if image 2 shows a BALD or SHAVED head, the output MUST be BALD with visible scalp — DELETE any hair shown in image 1. If image 2 shows SHORT hair, the output MUST have short hair — DELETE any long hair from image 1. Do NOT preserve, average, or blend image 1's hair with image 2's. Image 2 is the SOLE source of hair information.

FACIAL HAIR (canonical reference is image 2): match image 2's beard, mustache, or stubble exactly. If image 2 is CLEAN-SHAVEN, the output MUST be clean-shaven — DELETE any facial hair shown in image 1.

SKIN TONE (canonical reference is image 2): the skin tone across face, neck, arms, hands, legs, and feet must match image 2's skin exactly. If image 1's skin tone drifted lighter or darker than image 2, correct it. Face skin and body skin MUST be the same color with no seam.

POSE LOCK (HEAD TO TOE — FROM IMAGE 1): preserve image 1's pose bit-for-bit. Same body orientation, contrapposto, arm positions, leg positions, stance width, knee bend, head tilt, head direction, gaze direction. The output figure must be a 1:1 silhouette match of image 1's pose.

FEET LOCK: foot placement must be a 1:1 match with image 1, including each foot's exact angle, rotation, and ground contact.

PRESERVE FROM IMAGE 1: body build, body proportions, outfit (plain white t-shirt + plain white shorts), framing (full body visible head to feet, toes never cropped), camera angle, lens, lighting, background.

NO earrings, NO necklaces, NO watches, NO bracelets, NO rings, NO hats, NO headbands, NO scarves, NO hair clips.

Photorealistic, sharp focus, no text, no watermarks."##;

/// Renders the verbatim classify prompt, injecting the dims-context sentence
/// (empty string when no dimensions are provided).
pub fn classify_prompt(dims: &str) -> String {
    CLASSIFY_PROMPT_TEMPLATE.replace("${dimsContext}", dims)
}

/// Verbatim `dimsContext` from classifyBuild().
pub fn dims_context(height_cm: Option<i64>, weight_kg: Option<i64>) -> String {
    if height_cm.is_none() && weight_kg.is_none() {
        return String::new();
    }
    let mut s = String::from("Self-reported dimensions: ");
    if let Some(h) = height_cm {
        s.push_str(&format!("{h} cm tall"));
    }
    if height_cm.is_some() && weight_kg.is_some() {
        s.push_str(", ");
    }
    if let Some(w) = weight_kg {
        s.push_str(&format!("{w} kg"));
    }
    s.push_str(". Use these as a tiebreaker when the image is ambiguous, but do not let them override what is clearly visible.");
    s
}

/// Verbatim `buildDirective` lookup (unknown builds fall back to average).
pub fn build_directive(build: &str) -> String {
    match build {
        "lean" => LEAN_DIRECTIVE,
        "athletic" => ATHLETIC_DIRECTIVE,
        "average" => AVERAGE_DIRECTIVE,
        "fuller" => FULLER_DIRECTIVE,
        "heavy" => HEAVY_DIRECTIVE,
        _ => AVERAGE_DIRECTIVE,
    }
    .to_string()
}

/// Port of the legacy build parse: `/build\s*:\s*(\w+)/i`, lowercased, then
/// the first BUILD_VALUES entry contained as a substring, else "average".
pub fn parse_build(text: &str) -> String {
    let lower = text.to_lowercase();
    let mut offset = 0;
    let mut keyword = None;
    while let Some(rel) = lower[offset..].find("build") {
        let i = offset + rel;
        let rest = lower[i + "build".len()..].trim_start();
        if let Some(rest) = rest.strip_prefix(':').map(str::trim_start) {
            let word: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if !word.is_empty() {
                keyword = Some(word);
                break;
            }
        }
        offset = i + 1;
    }
    match keyword {
        Some(word) => BUILD_VALUES
            .iter()
            .find(|b| word.contains(**b))
            .map(|b| b.to_string())
            .unwrap_or_else(|| "average".to_string()),
        None => "average".to_string(),
    }
}

/// Port of the legacy `/notes\s*:\s*(.+)$/im` capture (rest of line, trimmed).
pub fn parse_notes(text: &str) -> String {
    for line in text.lines() {
        let lower = line.to_lowercase();
        if let Some(rel) = lower.find("notes") {
            let rest = line[rel + "notes".len()..].trim_start();
            if let Some(rest) = rest.strip_prefix(':') {
                return rest.trim().to_string();
            }
        }
    }
    String::new()
}

/// Verbatim `buildNotesClause` from buildPass1Prompt().
pub fn build_notes_clause(notes: &str) -> String {
    if notes.is_empty() {
        String::new()
    } else {
        format!("Specific features observed in image 2: {notes}. Reflect these features in the rendered body.")
    }
}

/// Verbatim `dimsClause` from buildPass1Prompt().
pub fn pass1_dims_clause(height_cm: Option<i64>, weight_kg: Option<i64>) -> String {
    let mut parts = Vec::new();
    if let Some(h) = height_cm {
        parts.push(format!("The person is {h} cm tall"));
    }
    if let Some(w) = weight_kg {
        parts.push(format!("weighs approximately {w} kg"));
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(
            "Self-reported dimensions: {}. Use these to inform overall body mass, limb thickness, and proportions.",
            parts.join(", ")
        )
    }
}

/// Assembles the verbatim pass1 prompt from its three rendered clauses.
pub fn pass1_prompt(directive: &str, notes_clause: &str, dims_clause: &str) -> String {
    PASS1_PROMPT_TEMPLATE
        .replace("${buildDirective}", directive)
        .replace("${buildNotesClause}", notes_clause)
        .replace("${dimsClause}", dims_clause)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_build_reply() {
        assert_eq!(parse_build("build: lean\nnotes: narrow frame"), "lean");
        assert_eq!(parse_build("unknown stuff"), "average");
        assert_eq!(parse_build("build: ATHLETIC\nnotes: toned"), "athletic");
        assert_eq!(parse_build("build: fuller frame"), "fuller");
        assert_eq!(parse_build("BUILD:heavy"), "heavy");
        assert_eq!(parse_build("notes: build: average build"), "average");
    }

    #[test]
    fn parse_build_defaults_unknown_keyword() {
        assert_eq!(parse_build("build: muscular"), "average");
        assert_eq!(parse_build("build: pear-shaped"), "average");
    }

    #[test]
    fn parses_notes_line() {
        assert_eq!(
            parse_notes("build: lean\nnotes: narrow frame"),
            "narrow frame"
        );
        assert_eq!(parse_notes("notes:  toned arms  "), "toned arms");
        assert_eq!(parse_notes("build: lean"), "");
    }

    #[test]
    fn build_directive_renders_all_five_verbatim() {
        assert!(build_directive("lean").starts_with("The person has a LEAN build"));
        assert!(build_directive("athletic").contains("ATHLETIC build"));
        assert!(build_directive("average").contains("AVERAGE build"));
        assert!(build_directive("fuller").contains("FULLER build"));
        assert!(build_directive("heavy").contains("HEAVY build"));
        assert_eq!(build_directive("bogus"), build_directive("average"));
        assert!(!build_directive("lean").contains("${"));
    }

    #[test]
    fn dims_context_matches_legacy_shapes() {
        assert_eq!(dims_context(None, None), "");
        assert_eq!(
            dims_context(Some(170), None),
            "Self-reported dimensions: 170 cm tall. Use these as a tiebreaker when the image is ambiguous, but do not let them override what is clearly visible."
        );
        assert!(dims_context(Some(170), Some(65))
            .starts_with("Self-reported dimensions: 170 cm tall, 65 kg."));
        assert!(dims_context(None, Some(65)).contains("65 kg."));
    }

    #[test]
    fn pass1_dims_clause_matches_legacy_shapes() {
        assert_eq!(pass1_dims_clause(None, None), "");
        assert_eq!(
            pass1_dims_clause(Some(170), Some(65)),
            "Self-reported dimensions: The person is 170 cm tall, weighs approximately 65 kg. Use these to inform overall body mass, limb thickness, and proportions."
        );
        assert!(pass1_dims_clause(Some(170), None).contains("The person is 170 cm tall"));
    }

    #[test]
    fn build_notes_clause_omits_when_empty() {
        assert_eq!(build_notes_clause(""), "");
        assert_eq!(
            build_notes_clause("narrow frame"),
            "Specific features observed in image 2: narrow frame. Reflect these features in the rendered body."
        );
    }

    #[test]
    fn classify_prompt_renders_dims_inline() {
        let with_dims = classify_prompt("Self-reported dimensions: 170 cm tall.");
        assert!(with_dims.starts_with("You are a body-build classifier."));
        assert!(with_dims.contains("Self-reported dimensions: 170 cm tall."));
        assert!(!with_dims.contains("${"));
        let without_dims = classify_prompt("");
        assert!(!without_dims.contains("Self-reported dimensions"));
        assert!(!without_dims.contains("${"));
        assert!(without_dims.ends_with("build: <lean|athletic|average|fuller|heavy>\nnotes: <one short sentence describing the specific features that drove the classification>"));
    }

    #[test]
    fn pass1_prompt_renders_clauses_inline() {
        let directive = build_directive("lean");
        let notes = build_notes_clause("narrow frame");
        let dims = pass1_dims_clause(Some(170), Some(65));
        let p = pass1_prompt(&directive, &notes, &dims);
        assert!(p.starts_with("A full-body, photorealistic studio photograph"));
        assert!(p.contains(&directive));
        assert!(p.contains(&notes));
        assert!(p.contains(&dims));
        assert!(p.contains("BODY BUILD:"));
        assert!(p.contains("IDENTITY LOCK"));
        assert!(p.contains("OUTFIT:"));
        assert!(!p.contains("${"));
        assert!(p.ends_with("no gradient (no floor, no horizon, no shadow)."));
    }

    #[test]
    fn pass1_prompt_without_optional_clauses_keeps_legacy_spacing() {
        let directive = build_directive("average");
        let p = pass1_prompt(&directive, "", "");
        assert!(p.contains(&format!("BODY BUILD: {directive}  ")));
        assert!(!p.contains("${"));
    }

    #[test]
    fn pass2_prompt_is_verbatim_static() {
        assert!(PASS2_PROMPT.starts_with("IDENTITY REFINEMENT:"));
        assert!(PASS2_PROMPT.contains("POSE LOCK (HEAD TO TOE"));
        assert!(PASS2_PROMPT.contains("FACIAL HAIR (canonical reference is image 2)"));
        assert!(PASS2_PROMPT.ends_with("Photorealistic, sharp focus, no text, no watermarks."));
        assert!(!PASS2_PROMPT.contains("${"));
    }

    #[test]
    fn prompts_have_no_unresolved_interpolations() {
        assert!(!classify_prompt("").contains("${"));
        assert!(!pass1_prompt("x", "", "").contains("${"));
        assert!(!PASS2_PROMPT.contains("${"));
    }
}
