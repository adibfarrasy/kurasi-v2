CREATE TABLE "share_click" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"referred_user_id" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shareable_card" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"caption" text,
	"theme" text NOT NULL,
	"rendered_image_url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"outfit_id" uuid,
	"showcase_mode" text,
	"stats_period" text
);
--> statement-breakpoint
ALTER TABLE "share_click" ADD CONSTRAINT "share_click_card_id_shareable_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."shareable_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_click" ADD CONSTRAINT "share_click_referred_user_id_user_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_event" ADD CONSTRAINT "share_event_card_id_shareable_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."shareable_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareable_card" ADD CONSTRAINT "shareable_card_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareable_card" ADD CONSTRAINT "shareable_card_outfit_id_outfit_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_click_card_idx" ON "share_click" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "share_event_card_idx" ON "share_event" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "shareable_card_user_created_idx" ON "shareable_card" USING btree ("user_id","created_at");