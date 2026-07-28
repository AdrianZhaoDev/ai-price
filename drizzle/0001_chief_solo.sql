CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" text DEFAULT 'CNY' NOT NULL,
	"quote_currency" text NOT NULL,
	"cny_per_unit" numeric(20, 10) NOT NULL,
	"rate_date" text NOT NULL,
	"source_url" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "converted_cny" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "fx_rate" numeric(20, 10);--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "fx_rate_observed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_currency_date_unique" ON "fx_rates" USING btree ("base_currency","quote_currency","rate_date");--> statement-breakpoint
CREATE INDEX "fx_rates_latest_idx" ON "fx_rates" USING btree ("quote_currency","observed_at");