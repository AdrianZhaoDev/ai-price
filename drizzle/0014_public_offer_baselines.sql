CREATE TABLE "public_offer_baselines" (
	"domain" text NOT NULL,
	"offer_id" text NOT NULL,
	"identity" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_offer_baselines_domain_offer_id_pk" PRIMARY KEY("domain","offer_id")
);
--> statement-breakpoint
CREATE INDEX "public_offer_baselines_identity_idx" ON "public_offer_baselines" USING btree ("domain",md5("identity"::text));
--> statement-breakpoint
INSERT INTO public_offer_baselines(domain, offer_id, identity, payload, first_seen_at, updated_at)
SELECT DISTINCT ON (o.offer_id) 'channels', o.offer_id,
  jsonb_build_array(o.offer_snapshot->'merchantId', o.offer_snapshot->'productId', o.offer_snapshot->'offerUrl'),
  jsonb_build_object('bulkPricingTiers', '[]'::jsonb) || o.offer_snapshot ||
    jsonb_build_object('priceMinor', o.price_minor, 'currency', o.currency),
  min(least(o.observed_at, (o.offer_snapshot->>'firstSeenAt')::timestamptz)) OVER (PARTITION BY o.offer_id),
  coalesce(g.published_at, o.observed_at)
FROM channel_offer_observations o JOIN public_data_generations g ON g.id = o.generation_id
WHERE g.status = 'published'
ORDER BY o.offer_id, g.published_at DESC NULLS LAST, o.observed_at DESC, o.id;
--> statement-breakpoint
INSERT INTO public_offer_baselines(domain, offer_id, identity, payload, first_seen_at, updated_at)
SELECT 'channels', id, jsonb_build_array(merchant_id, product_id, offer_url),
  jsonb_build_object('id', id, 'merchantId', merchant_id, 'productId', product_id, 'offerUrl', offer_url,
    'priceMinor', price_minor, 'currency', currency, 'bulkPricingTiers', bulk_pricing_tiers),
  first_seen_at, clock_timestamp()
FROM channel_public_offers
ON CONFLICT (domain, offer_id) DO UPDATE SET identity = excluded.identity, payload = excluded.payload,
  first_seen_at = least(public_offer_baselines.first_seen_at, excluded.first_seen_at), updated_at = excluded.updated_at;
--> statement-breakpoint
INSERT INTO public_offer_baselines(domain, offer_id, identity, payload, first_seen_at, updated_at)
SELECT 'transit', id, jsonb_build_array(station_id, standard_model, group_name, billing_mode),
  jsonb_build_object('id', id, 'stationId', station_id, 'currency', currency, 'billingMode', billing_mode,
    'inputPrice', input_price, 'outputPrice', output_price, 'cacheReadPrice', cache_read_price,
    'cacheWritePrice', cache_write_price, 'imageOutputPrice', image_output_price, 'fixedPrice', fixed_price,
    'fixedPriceCurrency', fixed_price_currency, 'fixedPriceUnit', fixed_price_unit, 'combinedMultiplier', combined_multiplier),
  coalesce(last_verified_at, updated_at), clock_timestamp()
FROM transit_offers;
