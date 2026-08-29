-- Ported from the Drizzle migration set (see git history backend/drizzle/).
-- Better Auth's account/session/verification tables are dropped: auth is
-- Firebase now. User table retains trial_started_at.

CREATE TABLE "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "image" text,
    "created_at" timestamp NOT NULL,
    "updated_at" timestamp NOT NULL,
    "trial_started_at" timestamp NOT NULL,
    CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "subscription" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "interval" text DEFAULT 'monthly' NOT NULL,
    "status" text NOT NULL,
    "started_at" timestamp NOT NULL,
    "current_period_end" timestamp NOT NULL,
    "cancelled_at" timestamp,
    "lapsed_at" timestamp,
    "grace_started_at" timestamp,
    "grace_ends_at" timestamp,
    "provider_ref" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "subscription_user_id_unique" UNIQUE("user_id")
);
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

CREATE TABLE "onboarding_progress" (
    "user_id" text PRIMARY KEY NOT NULL,
    "status" text DEFAULT 'in_progress' NOT NULL,
    "biometrics_completed_at" timestamp,
    "starter_wardrobe_completed_at" timestamp,
    "started_at" timestamp DEFAULT now() NOT NULL,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

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
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "name" text
);
ALTER TABLE "clothing_item" ADD CONSTRAINT "clothing_item_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

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
    "notes" text,
    "rating" text,
    "worn_at" timestamp,
    "status" text DEFAULT 'active' NOT NULL,
    "deleted_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_headwear_id_clothing_item_id_fk"
    FOREIGN KEY ("headwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null;
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_base_id_clothing_item_id_fk"
    FOREIGN KEY ("base_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null;
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_outer_id_clothing_item_id_fk"
    FOREIGN KEY ("outer_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null;
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_bottom_id_clothing_item_id_fk"
    FOREIGN KEY ("bottom_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null;
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_footwear_id_clothing_item_id_fk"
    FOREIGN KEY ("footwear_id") REFERENCES "public"."clothing_item"("id") ON DELETE set null;
CREATE INDEX "outfit_user_id_idx" ON "outfit" USING btree ("user_id");
CREATE INDEX "outfit_headwear_id_idx" ON "outfit" USING btree ("headwear_id");
CREATE INDEX "outfit_base_id_idx" ON "outfit" USING btree ("base_id");
CREATE INDEX "outfit_outer_id_idx" ON "outfit" USING btree ("outer_id");
CREATE INDEX "outfit_bottom_id_idx" ON "outfit" USING btree ("bottom_id");
CREATE INDEX "outfit_footwear_id_idx" ON "outfit" USING btree ("footwear_id");

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
ALTER TABLE "fit_adjustment" ADD CONSTRAINT "fit_adjustment_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "fit_adjustment" ADD CONSTRAINT "fit_adjustment_item_id_clothing_item_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."clothing_item"("id") ON DELETE cascade;

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
ALTER TABLE "outfit_recommendation_request" ADD CONSTRAINT "outfit_recommendation_request_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "outfit_recommendation_request" ADD CONSTRAINT "outfit_recommendation_request_based_on_outfit_id_outfit_id_fk"
    FOREIGN KEY ("based_on_outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade;
CREATE INDEX "outfit_recommendation_user_idx" ON "outfit_recommendation_request" USING btree ("user_id","requested_at");

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
ALTER TABLE "shared_outfit" ADD CONSTRAINT "shared_outfit_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "shared_outfit" ADD CONSTRAINT "shared_outfit_outfit_id_outfit_id_fk"
    FOREIGN KEY ("outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade;
CREATE INDEX "shared_outfit_status_idx" ON "shared_outfit" USING btree ("status","shared_at");

CREATE TABLE "user_biometrics" (
    "user_id" text PRIMARY KEY NOT NULL,
    "height_cm" integer NOT NULL,
    "weight_kg" integer NOT NULL,
    "face_photo_url" text,
    "default_avatar_url" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "user_biometrics" ADD CONSTRAINT "user_biometrics_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

CREATE TABLE "style_card" (
    "id" uuid PRIMARY KEY NOT NULL,
    "image_url" text NOT NULL,
    "source_attribution" text NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "retired_at" timestamp
);

CREATE TABLE "style_interaction" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "card_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "occurred_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "style_interaction" ADD CONSTRAINT "style_interaction_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "style_interaction" ADD CONSTRAINT "style_interaction_card_id_style_card_id_fk"
    FOREIGN KEY ("card_id") REFERENCES "public"."style_card"("id") ON DELETE cascade;
CREATE INDEX "style_interaction_user_card_idx" ON "style_interaction" USING btree ("user_id","card_id");
CREATE INDEX "style_interaction_user_kind_idx" ON "style_interaction" USING btree ("user_id","kind");

CREATE TABLE "saved_style" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "card_id" uuid NOT NULL,
    "saved_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "saved_style_user_card_unique" UNIQUE("user_id","card_id")
);
ALTER TABLE "saved_style" ADD CONSTRAINT "saved_style_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
ALTER TABLE "saved_style" ADD CONSTRAINT "saved_style_card_id_style_card_id_fk"
    FOREIGN KEY ("card_id") REFERENCES "public"."style_card"("id") ON DELETE cascade;

CREATE TABLE "credit_account" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "last_weekly_grant_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "credit_account_user_id_unique" UNIQUE("user_id")
);
ALTER TABLE "credit_account" ADD CONSTRAINT "credit_account_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;

CREATE TABLE "credit_grant" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "amount" integer NOT NULL,
    "source" text NOT NULL,
    "granted_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
CREATE INDEX "credit_grant_userId_idx" ON "credit_grant" USING btree ("user_id");

CREATE TABLE "credit_hold" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "amount" integer NOT NULL,
    "operation" text NOT NULL,
    "status" text DEFAULT 'held' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "committed_at" timestamp,
    "released_at" timestamp
);
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
CREATE INDEX "credit_hold_userId_idx" ON "credit_hold" USING btree ("user_id");