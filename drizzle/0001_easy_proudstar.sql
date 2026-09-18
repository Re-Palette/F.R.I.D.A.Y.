CREATE TABLE "unlock_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "unlock_attempts_created_at_idx" ON "unlock_attempts" USING btree ("created_at");