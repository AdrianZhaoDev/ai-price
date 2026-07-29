CREATE TABLE "price_change_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"storefront_key" text DEFAULT '' NOT NULL,
	"previous_observation_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"last_collection_run_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_change_candidates" ADD CONSTRAINT "price_change_candidates_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_candidates" ADD CONSTRAINT "price_change_candidates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_candidates" ADD CONSTRAINT "price_change_candidates_previous_observation_id_price_observations_id_fk" FOREIGN KEY ("previous_observation_id") REFERENCES "public"."price_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_candidates" ADD CONSTRAINT "price_change_candidates_last_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("last_collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_change_candidates_identity_unique" ON "price_change_candidates" USING btree ("plan_id","source_id","storefront_key");--> statement-breakpoint
CREATE INDEX "price_change_candidates_source_idx" ON "price_change_candidates" USING btree ("source_id");--> statement-breakpoint
INSERT INTO "plans" (
	"product_id",
	"canonical_slug",
	"name",
	"billing_period",
	"active",
	"mapping_confidence",
	"metadata"
)
SELECT
	"id",
	'trae-速通-pro-monthly-plus',
	'速通 Pro+',
	'month',
	true,
	100,
	'{}'::jsonb
FROM "products"
WHERE "slug" = 'trae-subscription'
ON CONFLICT ("product_id", "canonical_slug") DO UPDATE SET
	"name" = EXCLUDED."name",
	"billing_period" = EXCLUDED."billing_period",
	"active" = true,
	"updated_at" = now();--> statement-breakpoint
DELETE FROM "price_change_events" AS "event"
USING "price_observations" AS "observation", "sources" AS "source"
WHERE "event"."current_observation_id" = "observation"."id"
	AND "observation"."source_id" = "source"."id"
	AND "source"."slug" = 'trae-pricing-official';--> statement-breakpoint
UPDATE "price_observations" AS "observation"
SET "plan_id" = "plus_plan"."id"
FROM "sources" AS "source", "plans" AS "plus_plan"
WHERE "observation"."source_id" = "source"."id"
	AND "source"."slug" = 'trae-pricing-official'
	AND "plus_plan"."product_id" = "source"."product_id"
	AND "plus_plan"."canonical_slug" = 'trae-速通-pro-monthly-plus'
	AND "observation"."raw_plan_name" = '速通 Pro+';--> statement-breakpoint
UPDATE "plans"
SET "name" = '速通 Pro', "billing_period" = 'month', "updated_at" = now()
WHERE "canonical_slug" = 'trae-速通-pro-monthly'
	AND "product_id" IN (
		SELECT "id" FROM "products" WHERE "slug" = 'trae-subscription'
	);
