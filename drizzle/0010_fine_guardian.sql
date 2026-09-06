DROP INDEX "channel_merchants_generation_search_idx";--> statement-breakpoint
DROP INDEX "channel_products_generation_search_idx";--> statement-breakpoint
DROP INDEX "channel_public_offers_generation_search_idx";--> statement-breakpoint
DROP INDEX "transit_stations_generation_search_idx";--> statement-breakpoint
CREATE INDEX "channel_merchants_generation_search_idx" ON "channel_merchants" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "channel_products_generation_search_idx" ON "channel_products" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "channel_public_offers_generation_search_idx" ON "channel_public_offers" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "transit_stations_generation_search_idx" ON "transit_stations" USING btree ("generation_id");