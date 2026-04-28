CREATE TABLE "saved_style" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_style_user_card_unique" UNIQUE("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "style_card" (
	"id" uuid PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"source_attribution" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "style_card_tag" (
	"card_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "style_card_tag_card_id_tag_id_pk" PRIMARY KEY("card_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "style_interaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_tag" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "style_tag_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "saved_style" ADD CONSTRAINT "saved_style_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_style" ADD CONSTRAINT "saved_style_card_id_style_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."style_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_card_tag" ADD CONSTRAINT "style_card_tag_card_id_style_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."style_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_card_tag" ADD CONSTRAINT "style_card_tag_tag_id_style_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."style_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_interaction" ADD CONSTRAINT "style_interaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_interaction" ADD CONSTRAINT "style_interaction_card_id_style_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."style_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "style_interaction_user_card_idx" ON "style_interaction" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE INDEX "style_interaction_user_kind_idx" ON "style_interaction" USING btree ("user_id","kind");