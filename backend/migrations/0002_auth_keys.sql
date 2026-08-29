ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";
CREATE UNIQUE INDEX "credit_grant_user_source_unique" ON "credit_grant" ("user_id", "source");