-- Index each outfit-slot FK column so the per-item outfit-count query in
-- clothingItem.list (a UNION of 5 lookups, one per slot) becomes O(log n) per
-- slot instead of full scans. Without these, the count query scans the entire
-- outfit table for every item on every wardrobe load.
CREATE INDEX IF NOT EXISTS "outfit_headwear_id_idx" ON "outfit" ("headwear_id");
CREATE INDEX IF NOT EXISTS "outfit_base_id_idx"     ON "outfit" ("base_id");
CREATE INDEX IF NOT EXISTS "outfit_outer_id_idx"    ON "outfit" ("outer_id");
CREATE INDEX IF NOT EXISTS "outfit_bottom_id_idx"   ON "outfit" ("bottom_id");
CREATE INDEX IF NOT EXISTS "outfit_footwear_id_idx" ON "outfit" ("footwear_id");
