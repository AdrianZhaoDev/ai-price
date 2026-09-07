ALTER TABLE "channel_offer_observations" DROP CONSTRAINT "channel_offer_observations_offer_id_channel_public_offers_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_offer_observations" DROP CONSTRAINT "channel_offer_observations_generation_id_public_data_generations_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_offer_observations" ADD COLUMN "offer_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_offer_observations" ADD CONSTRAINT "channel_offer_observations_generation_id_public_data_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."public_data_generations"("id") ON DELETE restrict ON UPDATE no action;