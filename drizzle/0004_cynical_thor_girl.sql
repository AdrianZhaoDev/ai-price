CREATE TABLE "subscription_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"provider_slug" text NOT NULL,
	"plan_slug" text NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
UPDATE "subscriptions"
SET
	"status" = 'active',
	"confirmed_at" = COALESCE("confirmed_at", "updated_at", "created_at"),
	"unsubscribed_at" = NULL,
	"updated_at" = now()
WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "subscription_attempts_created_idx" ON "subscription_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_attempts_ip_created_idx" ON "subscription_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "subscription_attempts_ip_accepted_created_idx" ON "subscription_attempts" USING btree ("ip_hash","accepted","created_at");
