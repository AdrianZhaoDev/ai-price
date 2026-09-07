ALTER TABLE public_data_generations ADD COLUMN source_versions jsonb;
--> statement-breakpoint
INSERT INTO public_offer_baselines(domain, offer_id, identity, payload, first_seen_at, updated_at)
SELECT 'channel-products', id, jsonb_build_array(platform, product_type), '{}'::jsonb, updated_at, updated_at
FROM channel_products
ON CONFLICT (domain, offer_id) DO NOTHING;
