ALTER TABLE "channel_public_offers" ADD COLUMN "first_seen_at" timestamp with time zone;
--> statement-breakpoint
WITH history_by_id AS (
  SELECT offer_id, min(observed_at) AS first_seen_at FROM channel_offer_observations GROUP BY offer_id
), history_by_identity AS (
  SELECT offer_snapshot->>'merchantId' AS merchant_id,
    offer_snapshot->>'productId' AS product_id,
    offer_snapshot->>'offerUrl' AS offer_url,
    min(observed_at) AS first_seen_at
  FROM channel_offer_observations
  WHERE offer_snapshot ? 'merchantId' AND offer_snapshot ? 'productId' AND offer_snapshot ? 'offerUrl'
  GROUP BY 1, 2, 3
)
UPDATE channel_public_offers AS target
SET first_seen_at = LEAST(current_offer.observed_at, by_id.first_seen_at, by_identity.first_seen_at)
FROM channel_public_offers AS current_offer
LEFT JOIN history_by_id AS by_id ON by_id.offer_id = current_offer.id
LEFT JOIN history_by_identity AS by_identity ON by_identity.merchant_id = current_offer.merchant_id
  AND by_identity.product_id = current_offer.product_id AND by_identity.offer_url = current_offer.offer_url
WHERE target.id = current_offer.id;
--> statement-breakpoint
ALTER TABLE "channel_public_offers" ALTER COLUMN "first_seen_at" SET NOT NULL;
