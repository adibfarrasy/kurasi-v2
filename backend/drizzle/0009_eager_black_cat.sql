CREATE INDEX "outfit_headwear_id_idx" ON "outfit" USING btree ("headwear_id");--> statement-breakpoint
CREATE INDEX "outfit_base_id_idx" ON "outfit" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "outfit_outer_id_idx" ON "outfit" USING btree ("outer_id");--> statement-breakpoint
CREATE INDEX "outfit_bottom_id_idx" ON "outfit" USING btree ("bottom_id");--> statement-breakpoint
CREATE INDEX "outfit_footwear_id_idx" ON "outfit" USING btree ("footwear_id");