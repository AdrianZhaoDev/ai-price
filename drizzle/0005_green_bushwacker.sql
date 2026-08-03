CREATE TABLE "api_ranking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"entry_key" text NOT NULL,
	"provider_slug" text NOT NULL,
	"provider_name" text NOT NULL,
	"model_slug" text NOT NULL,
	"model_name" text NOT NULL,
	"previous_rank" integer,
	"current_rank" integer,
	"previous_price_cny" numeric(20, 6),
	"current_price_cny" numeric(20, 6),
	"previous_display_price" text,
	"current_display_price" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_ranking_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric" text NOT NULL,
	"entry_key" text NOT NULL,
	"provider_slug" text NOT NULL,
	"provider_name" text NOT NULL,
	"provider_color" text NOT NULL,
	"model_slug" text NOT NULL,
	"model_name" text NOT NULL,
	"model_order" integer NOT NULL,
	"offer_plan_slug" text,
	"rank" integer,
	"price_cny" numeric(20, 6),
	"display_price" text,
	"active" boolean DEFAULT true NOT NULL,
	"collection_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_ranking_events" ADD CONSTRAINT "api_ranking_events_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_ranking_state" ADD CONSTRAINT "api_ranking_state_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_ranking_events_run_identity_unique" ON "api_ranking_events" USING btree ("collection_run_id","metric","entry_key");--> statement-breakpoint
CREATE INDEX "api_ranking_events_latest_idx" ON "api_ranking_events" USING btree ("metric","entry_key","created_at");--> statement-breakpoint
CREATE INDEX "api_ranking_events_pending_idx" ON "api_ranking_events" USING btree ("notified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_ranking_state_identity_unique" ON "api_ranking_state" USING btree ("metric","entry_key");--> statement-breakpoint
CREATE INDEX "api_ranking_state_active_idx" ON "api_ranking_state" USING btree ("metric","active");