CREATE TABLE "user_biometrics" (
	"user_id" text PRIMARY KEY NOT NULL,
	"height_cm" integer NOT NULL,
	"weight_kg" integer NOT NULL,
	"face_photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_biometrics" ADD CONSTRAINT "user_biometrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;