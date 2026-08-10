ALTER TYPE "public"."source_type" ADD VALUE 'community_catalog';--> statement-breakpoint
CREATE TABLE "model_catalog_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"model_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" text NOT NULL,
	"model_count" integer DEFAULT 0 NOT NULL,
	"provider_count" integer DEFAULT 0 NOT NULL,
	"offering_count" integer DEFAULT 0 NOT NULL,
	"changed_model_count" integer DEFAULT 0 NOT NULL,
	"changed_model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"added_model_count" integer DEFAULT 0 NOT NULL,
	"unlinked_provider_model_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"cache_refreshed_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_catalog_models" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"family" text,
	"context_tokens" integer,
	"output_tokens" integer,
	"input_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"knowledge" text,
	"open_weights" boolean DEFAULT false NOT NULL,
	"release_date" text NOT NULL,
	"updated_date" text NOT NULL,
	"provider_count" integer DEFAULT 0 NOT NULL,
	"min_input_price" numeric(20, 8),
	"min_input_provider_id" text,
	"min_output_price" numeric(20, 8),
	"min_output_provider_id" text,
	"origin" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"content_hash" text NOT NULL,
	"detail_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_import_id" uuid
);
--> statement-breakpoint
CREATE TABLE "model_catalog_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"doc_url" text,
	"api_url" text,
	"npm_package" text,
	"origin" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"content_hash" text NOT NULL,
	"last_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_labs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"origin" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"content_hash" text NOT NULL,
	"last_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_provider_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"canonical_model_id" text NOT NULL,
	"context_tokens" integer,
	"output_tokens" integer,
	"input_price" numeric(20, 8),
	"output_price" numeric(20, 8),
	"status" text,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text,
	"origin" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"content_hash" text NOT NULL,
	"last_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_catalog_events" ADD CONSTRAINT "model_catalog_events_import_id_model_catalog_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."model_catalog_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog_models" ADD CONSTRAINT "model_catalog_models_lab_id_model_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."model_labs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog_models" ADD CONSTRAINT "model_catalog_models_last_import_id_model_catalog_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."model_catalog_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog_providers" ADD CONSTRAINT "model_catalog_providers_last_import_id_model_catalog_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."model_catalog_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_labs" ADD CONSTRAINT "model_labs_last_import_id_model_catalog_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."model_catalog_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_provider_offerings" ADD CONSTRAINT "model_provider_offerings_provider_id_model_catalog_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_catalog_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_provider_offerings" ADD CONSTRAINT "model_provider_offerings_canonical_model_id_model_catalog_models_id_fk" FOREIGN KEY ("canonical_model_id") REFERENCES "public"."model_catalog_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_provider_offerings" ADD CONSTRAINT "model_provider_offerings_last_import_id_model_catalog_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."model_catalog_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_catalog_events_import_model_unique" ON "model_catalog_events" USING btree ("import_id","event_type","model_id");--> statement-breakpoint
CREATE INDEX "model_catalog_events_pending_idx" ON "model_catalog_events" USING btree ("notified_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "migrated_from_api_ranking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "subscriptions" SET "provider_slug" = 'api-model-new', "migrated_from_api_ranking" = true, "updated_at" = now() WHERE "provider_slug" = 'api-ranking' AND "plan_slug" = '*';--> statement-breakpoint
CREATE INDEX "model_catalog_imports_content_hash_idx" ON "model_catalog_imports" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "model_catalog_imports_version_idx" ON "model_catalog_imports" USING btree ("version");--> statement-breakpoint
CREATE INDEX "model_catalog_imports_latest_idx" ON "model_catalog_imports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_catalog_models_active_release_idx" ON "model_catalog_models" USING btree ("active","release_date");--> statement-breakpoint
CREATE INDEX "model_catalog_models_lab_idx" ON "model_catalog_models" USING btree ("lab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_offerings_identity_unique" ON "model_provider_offerings" USING btree ("provider_id","provider_model_id");--> statement-breakpoint
CREATE INDEX "model_provider_offerings_model_idx" ON "model_provider_offerings" USING btree ("canonical_model_id");
