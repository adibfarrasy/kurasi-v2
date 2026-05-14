CREATE TABLE "credit_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"last_weekly_grant_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_account_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "credit_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"source" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "credit_account" ADD CONSTRAINT "credit_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_grant_userId_idx" ON "credit_grant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_hold_userId_idx" ON "credit_hold" USING btree ("user_id");