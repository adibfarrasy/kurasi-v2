CREATE TABLE "fit_adjustment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"length" text,
	"width" text,
	"sleeve" text,
	"rise" text,
	"custom_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fit_adjustment_user_item_unique" UNIQUE("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "outfit_recommendation_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"based_on_outfit_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"computed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_outfit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"outfit_id" uuid NOT NULL,
	"face_anonymisation" text NOT NULL,
	"show_username" boolean NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL,
	"unpublished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_outfit_outfit_id_unique" UNIQUE("outfit_id")
);
--> statement-breakpoint
CREATE TABLE "user_biometrics" (
	"user_id" text PRIMARY KEY NOT NULL,
	"height_cm" integer NOT NULL,
	"weight_kg" integer NOT NULL,
	"face_photo_url" text,
	"default_avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fit_adjustment" ADD CONSTRAINT "fit_adjustment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_adjustment" ADD CONSTRAINT "fit_adjustment_item_id_clothing_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."clothing_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_recommendation_request" ADD CONSTRAINT "outfit_recommendation_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_recommendation_request" ADD CONSTRAINT "outfit_recommendation_request_based_on_outfit_id_outfit_id_fk" FOREIGN KEY ("based_on_outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_outfit" ADD CONSTRAINT "shared_outfit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_outfit" ADD CONSTRAINT "shared_outfit_outfit_id_outfit_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_biometrics" ADD CONSTRAINT "user_biometrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_recommendation_user_idx" ON "outfit_recommendation_request" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "shared_outfit_status_idx" ON "shared_outfit" USING btree ("status","shared_at");