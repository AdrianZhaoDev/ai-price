CREATE TYPE "public"."public_data_domain" AS ENUM('channels', 'transit');--> statement-breakpoint
CREATE TYPE "public"."public_data_generation_status" AS ENUM('building', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "channel_merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"website_url" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"operator_type" text,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"in_stock_count" integer DEFAULT 0 NOT NULL,
	"latest_seen_at" timestamp with time zone,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_offer_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" text NOT NULL,
	"generation_id" uuid NOT NULL,
	"price_minor" numeric(20, 6),
	"currency" text NOT NULL,
	"availability" text NOT NULL,
	"stock_count" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"raw_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_products" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"platform" text NOT NULL,
	"product_type" text NOT NULL,
	"spec" text,
	"summary" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"in_stock_count" integer DEFAULT 0 NOT NULL,
	"latest_seen_at" timestamp with time zone,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_public_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"merchant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"offer_url" text NOT NULL,
	"price_minor" numeric(20, 6),
	"currency" text NOT NULL,
	"availability" text DEFAULT 'unknown' NOT NULL,
	"stock_count" integer,
	"min_order_quantity" integer,
	"bulk_pricing_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_data_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" "public_data_domain" NOT NULL,
	"status" "public_data_generation_status" DEFAULT 'building' NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_availability_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"station_id" text NOT NULL,
	"offer_id" text,
	"scope" text NOT NULL,
	"standard_model" text,
	"group_name" text,
	"source_type" text NOT NULL,
	"source_url" text,
	"match_level" text NOT NULL,
	"success" boolean NOT NULL,
	"latency_ms" integer,
	"sample_count" integer DEFAULT 1 NOT NULL,
	"seven_day_rate" numeric(8, 5),
	"checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "transit_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"station_id" text NOT NULL,
	"family" text NOT NULL,
	"standard_model" text NOT NULL,
	"group_name" text,
	"billing_mode" text NOT NULL,
	"currency" text NOT NULL,
	"recharge_ratio" numeric(20, 8),
	"recharge_coefficient" numeric(20, 8),
	"model_multiplier" numeric(20, 8),
	"station_group_multiplier" numeric(20, 8),
	"combined_multiplier" numeric(20, 8),
	"input_price" numeric(20, 8),
	"output_price" numeric(20, 8),
	"cache_read_price" numeric(20, 8),
	"cache_write_price" numeric(20, 8),
	"image_output_price" numeric(20, 8),
	"fixed_price" numeric(20, 8),
	"fixed_price_currency" text,
	"fixed_price_unit" text,
	"account_pool" text,
	"channel_type" text,
	"price_source_url" text,
	"price_source_label" text,
	"last_verified_at" timestamp with time zone,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"website_url" text NOT NULL,
	"api_base_url" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"data_status" text DEFAULT 'pending_review' NOT NULL,
	"station_system" text,
	"operator_type" text,
	"commercial_relation" text DEFAULT 'none' NOT NULL,
	"summary" text,
	"channel_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"account_pools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_advice" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"lowest_multiplier" numeric(20, 8),
	"currency" text,
	"last_updated_at" timestamp with time zone,
	"last_collected_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_merchants" ADD CONSTRAINT "channel_merchants_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_offer_observations" ADD CONSTRAINT "channel_offer_observations_offer_id_channel_public_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."channel_public_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_offer_observations" ADD CONSTRAINT "channel_offer_observations_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_products" ADD CONSTRAINT "channel_products_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_public_offers" ADD CONSTRAINT "channel_public_offers_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_public_offers" ADD CONSTRAINT "channel_public_offers_merchant_id_channel_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."channel_merchants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_public_offers" ADD CONSTRAINT "channel_public_offers_product_id_channel_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."channel_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_availability_samples" ADD CONSTRAINT "transit_availability_samples_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_availability_samples" ADD CONSTRAINT "transit_availability_samples_station_id_transit_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."transit_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_availability_samples" ADD CONSTRAINT "transit_availability_samples_offer_id_transit_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."transit_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_offers" ADD CONSTRAINT "transit_offers_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_offers" ADD CONSTRAINT "transit_offers_station_id_transit_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."transit_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_stations" ADD CONSTRAINT "transit_stations_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_merchants_generation_slug_unique" ON "channel_merchants" USING btree ("generation_id","slug");--> statement-breakpoint
CREATE INDEX "channel_merchants_generation_search_idx" ON "channel_merchants" USING btree ("generation_id","search_text");--> statement-breakpoint
CREATE INDEX "channel_merchants_generation_status_idx" ON "channel_merchants" USING btree ("generation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_offer_observations_identity_unique" ON "channel_offer_observations" USING btree ("offer_id","observed_at","raw_hash");--> statement-breakpoint
CREATE INDEX "channel_offer_observations_offer_idx" ON "channel_offer_observations" USING btree ("offer_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_products_generation_slug_unique" ON "channel_products" USING btree ("generation_id","slug");--> statement-breakpoint
CREATE INDEX "channel_products_generation_filter_idx" ON "channel_products" USING btree ("generation_id","platform","product_type");--> statement-breakpoint
CREATE INDEX "channel_products_generation_search_idx" ON "channel_products" USING btree ("generation_id","search_text");--> statement-breakpoint
CREATE INDEX "channel_public_offers_generation_filter_idx" ON "channel_public_offers" USING btree ("generation_id","availability","currency","price_minor");--> statement-breakpoint
CREATE INDEX "channel_public_offers_generation_merchant_idx" ON "channel_public_offers" USING btree ("generation_id","merchant_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "channel_public_offers_generation_product_idx" ON "channel_public_offers" USING btree ("generation_id","product_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "channel_public_offers_generation_search_idx" ON "channel_public_offers" USING btree ("generation_id","search_text");--> statement-breakpoint
CREATE INDEX "public_data_generations_latest_idx" ON "public_data_generations" USING btree ("domain","status","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_data_generations_domain_hash_unique" ON "public_data_generations" USING btree ("domain","content_hash");--> statement-breakpoint
CREATE INDEX "transit_availability_samples_scope_idx" ON "transit_availability_samples" USING btree ("station_id","scope","standard_model","group_name","checked_at");--> statement-breakpoint
CREATE INDEX "transit_availability_samples_generation_idx" ON "transit_availability_samples" USING btree ("generation_id","checked_at");--> statement-breakpoint
CREATE INDEX "transit_offers_generation_station_idx" ON "transit_offers" USING btree ("generation_id","station_id","status");--> statement-breakpoint
CREATE INDEX "transit_offers_generation_model_idx" ON "transit_offers" USING btree ("generation_id","standard_model","family","combined_multiplier");--> statement-breakpoint
CREATE UNIQUE INDEX "transit_stations_generation_slug_unique" ON "transit_stations" USING btree ("generation_id","slug");--> statement-breakpoint
CREATE INDEX "transit_stations_generation_filter_idx" ON "transit_stations" USING btree ("generation_id","status","data_status","lowest_multiplier");--> statement-breakpoint
CREATE INDEX "transit_stations_generation_search_idx" ON "transit_stations" USING btree ("generation_id","search_text");