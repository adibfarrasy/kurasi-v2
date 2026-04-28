CREATE TABLE "outfit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
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
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_headwear_id_clothing_item_id_fk" FOREIGN KEY ("headwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_base_id_clothing_item_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_outer_id_clothing_item_id_fk" FOREIGN KEY ("outer_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_bottom_id_clothing_item_id_fk" FOREIGN KEY ("bottom_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_footwear_id_clothing_item_id_fk" FOREIGN KEY ("footwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_user_id_idx" ON "outfit" USING btree ("user_id");