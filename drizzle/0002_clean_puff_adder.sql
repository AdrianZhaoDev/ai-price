DROP INDEX "price_observation_identity_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "price_observation_run_identity_unique" ON "price_observations" USING btree ("plan_id","source_id","storefront","currency","raw_hash","collection_run_id");
