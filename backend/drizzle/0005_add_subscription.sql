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
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;