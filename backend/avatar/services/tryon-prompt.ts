// Single source of truth for the Try On prompt. Used by:
//   - steal-the-look-pipeline.tryOnFromInspiration (avatar + inspiration photo)
//   - dress-avatar Pass 2 (avatar + Pass 1 composite)
// Lives in its own leaf module so CLI scripts can import it without
// dragging in db/env transitive dependencies.
//
// Tuning notes: image 1 is the avatar (identity/pose source); image 2
// is the inspiration / Pass 1 composite (outfit source only).

export const TRYON_PROMPT = `DO NOT TOUCH THE HEAD: the entire head region of image 1 — face, eyes, nose, mouth, jawline, cheeks, ears, hair (every strand, the full volume and shape), beard, mustache, stubble, neck — must be preserved BIT FOR BIT IDENTICAL to image 1. Copy the head region from image 1 to the output unchanged. Do NOT regenerate the face. Do NOT redraw any facial feature. Do NOT modify the hair in any way.

POSE LOCK (HEAD TO TOE): the EXACT pose of the person in image 1 must be preserved bit-for-bit in the output, from the top of the head all the way down to the tips of the toes. Same body orientation. Same contrapposto / weight distribution. Same arm positions (including hands in pockets, hands at sides, arms crossed, etc. — match exactly). Same leg positions, stance width, knee bend. Same head tilt and gaze direction.

FEET LOCK: foot placement must be a 1:1 match with image 1, including each foot's exact angle, rotation, and ground contact. If image 1's left foot is up on its toes / tip-toed / raised heel / pointed / pivoted outward, the output's left foot MUST be in the identical tip-toe / raised-heel position with the same toe direction. Same for the right foot. Do NOT plant a foot flat that was tip-toed in image 1. Do NOT rotate or re-angle the feet. The shoes go ON the feet in their existing pose — the feet do not re-pose to fit a "default standing" shape.

The output figure must be a 1:1 silhouette match of image 1's pose; do NOT regenerate the body in a different pose, even if image 2's person is in a different pose. Image 2 contributes ONLY garments — never pose, body, or composition.

OUTFIT TRANSFER: replace the entire outfit currently worn by the person in image 1 with the EXACT outfit being worn by the person in image 2. Match every visible garment from image 2 — top (t-shirt / shirt / sweater / etc.), outer layer (jacket / coat / cardigan if present), bottom (pants / jeans / skirt as shown), footwear, headwear (hat / cap if present) — including its color, pattern, fabric texture, fit, length, hem position, sleeve length, neckline, and overall silhouette. Drape each garment naturally on the body in image 1 in three dimensions with realistic fabric folds and shading. If image 2 shows the outer layer open, render it open in the output and let the inner garment show through. Sleeve length and pant length must MATCH image 2 (e.g. short-sleeve stays short-sleeve, full-length pants stay full-length).

HEADWEAR ORIENTATION: if image 2 shows headwear (a cap, hat, beanie, etc.), the headwear in the output must be oriented to match the head direction in image 1, NOT image 2. The headwear rotates with the head — its brim, logo, or front face points in the same direction as image 1's face. If image 1's head is turned to one side and image 2's figure faces forward (or vice versa), render the cap turned to match image 1, with the brim aimed in the direction the face is looking.

PRESERVE from image 1: pose (head to toe, including each foot's angle and tip-toe / heel-raise state), body orientation, contrapposto stance, camera angle, framing (full body visible head to feet, with the toes never cropped), lighting, and background. Do NOT change the body shape or proportions. Do NOT change the head. Do NOT re-plant or re-angle the feet.

Photorealistic, sharp focus, no text, no watermarks.`
