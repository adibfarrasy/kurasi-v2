CREATE TABLE "clothing_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"image_url" text NOT NULL,
	"original_image_url" text,
	"category" text NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand" text,
	"fit" text,
	"length" text,
	"custom_notes" text,
	"owned" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"hero_image_url" text,
	"headwear_id" uuid,
	"base_id" uuid,
	"outer_id" uuid,
	"bottom_id" uuid,
	"footwear_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"rating" text,
	"worn_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clothing_item" ADD CONSTRAINT "clothing_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_headwear_id_clothing_item_id_fk" FOREIGN KEY ("headwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_base_id_clothing_item_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_outer_id_clothing_item_id_fk" FOREIGN KEY ("outer_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_bottom_id_clothing_item_id_fk" FOREIGN KEY ("bottom_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_footwear_id_clothing_item_id_fk" FOREIGN KEY ("footwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_user_id_idx" ON "outfit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outfit_headwear_id_idx" ON "outfit" USING btree ("headwear_id");--> statement-breakpoint
CREATE INDEX "outfit_base_id_idx" ON "outfit" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "outfit_outer_id_idx" ON "outfit" USING btree ("outer_id");--> statement-breakpoint
CREATE INDEX "outfit_bottom_id_idx" ON "outfit" USING btree ("bottom_id");--> statement-breakpoint
CREATE INDEX "outfit_footwear_id_idx" ON "outfit" USING btree ("footwear_id");