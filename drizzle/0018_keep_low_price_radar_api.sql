UPDATE "transit_directory_entries"
SET "published" = false, "updated_at" = now()
WHERE "website_key" IN ('sub.callai.one', 'wawazz.xyz');
