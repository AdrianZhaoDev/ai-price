CREATE TABLE "transit_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_submission_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_url" text NOT NULL,
	"website_key" text NOT NULL,
	"description" text NOT NULL,
	"submitter_email_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "transit_submission_attempts_ip_created_idx" ON "transit_submission_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "transit_submission_verifications_email_idx" ON "transit_submission_verifications" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "transit_submission_verifications_expiry_idx" ON "transit_submission_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transit_submissions_website_key_unique" ON "transit_submissions" USING btree ("website_key");--> statement-breakpoint
CREATE INDEX "transit_submissions_created_idx" ON "transit_submissions" USING btree ("created_at");
