CREATE TYPE "public"."collection_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."price_mode" AS ENUM('global', 'china_subscription', 'api');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('verified', 'stale', 'pending', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('app_store', 'official_web', 'official_api', 'manual_official');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('confirm_subscription', 'unsubscribe');--> statement-breakpoint
CREATE TABLE "collection_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"collection_run_id" uuid,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"alert_sent_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "collection_status" DEFAULT 'running' NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "confirmation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_type" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"canonical_slug" text NOT NULL,
	"name" text NOT NULL,
	"billing_period" text,
	"unit" text,
	"active" boolean DEFAULT true NOT NULL,
	"mapping_confidence" integer DEFAULT 100 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"storefront" text,
	"previous_observation_id" uuid,
	"current_observation_id" uuid NOT NULL,
	"change_percent" integer,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"collection_run_id" uuid,
	"raw_plan_name" text NOT NULL,
	"region" text,
	"storefront" text,
	"currency" text NOT NULL,
	"amount_minor" numeric(20, 6),
	"display_price" text NOT NULL,
	"billing_period" text,
	"unit" text,
	"tax_included" boolean,
	"status" "record_status" DEFAULT 'verified' NOT NULL,
	"raw_hash" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"mode" "price_mode" NOT NULL,
	"app_store_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"type" "source_type" NOT NULL,
	"url" text NOT NULL,
	"parser_version" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_content_hash" text,
	"last_offer_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" text NOT NULL,
	"email_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"provider_slug" text NOT NULL,
	"plan_slug" text,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmation_tokens" ADD CONSTRAINT "confirmation_tokens_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_events" ADD CONSTRAINT "price_change_events_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_events" ADD CONSTRAINT "price_change_events_previous_observation_id_price_observations_id_fk" FOREIGN KEY ("previous_observation_id") REFERENCES "public"."price_observations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_events" ADD CONSTRAINT "price_change_events_current_observation_id_price_observations_id_fk" FOREIGN KEY ("current_observation_id") REFERENCES "public"."price_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_errors_open_idx" ON "collection_errors" USING btree ("source_id","resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "collection_runs_started_idx" ON "collection_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "confirmation_tokens_hash_unique" ON "confirmation_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "confirmation_tokens_lookup_idx" ON "confirmation_tokens" USING btree ("purpose","expires_at","consumed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_dedupe_unique" ON "email_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_created_idx" ON "email_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_product_slug_unique" ON "plans" USING btree ("product_id","canonical_slug");--> statement-breakpoint
CREATE INDEX "price_change_events_pending_idx" ON "price_change_events" USING btree ("notified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_observation_identity_unique" ON "price_observations" USING btree ("plan_id","source_id","storefront","currency","raw_hash");--> statement-breakpoint
CREATE INDEX "price_observations_latest_idx" ON "price_observations" USING btree ("plan_id","storefront","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_provider_slug_unique" ON "products" USING btree ("provider_id","slug");--> statement-breakpoint
CREATE INDEX "products_mode_idx" ON "products" USING btree ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_slug_unique" ON "providers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_product_slug_unique" ON "sources" USING btree ("product_id","slug");--> statement-breakpoint
CREATE INDEX "sources_health_idx" ON "sources" USING btree ("enabled","consecutive_failures","last_success_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email_hash_unique" ON "subscribers" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_scope_unique" ON "subscriptions" USING btree ("subscriber_id","provider_slug","plan_slug");--> statement-breakpoint
CREATE INDEX "subscriptions_active_idx" ON "subscriptions" USING btree ("status","provider_slug","plan_slug");