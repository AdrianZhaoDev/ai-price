CREATE TABLE "transit_directory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website_url" text NOT NULL,
	"website_key" text NOT NULL,
	"description_zh" text NOT NULL,
	"description_en" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"source_submission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transit_submissions" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "transit_submissions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transit_directory_entries" ADD CONSTRAINT "transit_directory_entries_source_submission_id_transit_submissions_id_fk" FOREIGN KEY ("source_submission_id") REFERENCES "public"."transit_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transit_directory_entries_website_key_unique" ON "transit_directory_entries" USING btree ("website_key");--> statement-breakpoint
CREATE UNIQUE INDEX "transit_directory_entries_submission_unique" ON "transit_directory_entries" USING btree ("source_submission_id");--> statement-breakpoint
CREATE INDEX "transit_directory_entries_public_rank_idx" ON "transit_directory_entries" USING btree ("published","rank");--> statement-breakpoint
INSERT INTO "transit_directory_entries" ("name", "website_url", "website_key", "description_zh", "description_en", "rank", "published") VALUES
	('Low Price Radar API', 'https://ai.lowpriceradar.com/', 'ai.lowpriceradar.com', 'Low Price Radar 的 AI API 网关。', 'The AI API gateway from Low Price Radar.', 10, true),
	('CallAI', 'https://sub.callai.one/', 'sub.callai.one', '提供多模型 AI API 中转服务。', 'An API relay service for multiple AI models.', 20, true),
	('WAWA ZZ API', 'https://wawazz.xyz/', 'wawazz.xyz', '提供 AI API 中转调用服务。', 'A gateway for AI API calls.', 30, true)
ON CONFLICT ("website_key") DO NOTHING;
