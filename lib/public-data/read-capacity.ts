import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  channelMerchants,
  channelProducts,
  channelPublicOffers,
  transitStations,
  transitOffers,
  transitAvailabilitySamples,
} from "@/lib/db/schema";
import { PUBLIC_DATA_LIMITS as limits } from "./limits";

/** Count only a bounded index prefix before transferring any row payloads. */
export async function assertPublicReadCapacity(
  database: Database,
  domain: "channels" | "transit",
  generationId: string,
) {
  const checks =
    domain === "channels"
      ? [
          { table: channelMerchants, limit: limits.merchants },
          { table: channelProducts, limit: limits.products },
          { table: channelPublicOffers, limit: limits.channelOffers },
        ]
      : [
          { table: transitStations, limit: limits.stations },
          { table: transitOffers, limit: limits.transitOffers },
          { table: transitAvailabilitySamples, limit: limits.samples },
        ];
  const [counts] = await database.execute(
    sql`select ${sql.join(
      checks.map(
        ({ table, limit }, index) =>
          sql`(select count(*) from (select 1 from ${table} where generation_id = ${generationId}::uuid limit ${limit + 1}) bounded) as ${sql.identifier(`count${index}`)}`,
      ),
      sql`, `,
    )}`,
  );
  if (
    checks.some(({ limit }, index) => Number(counts[`count${index}`]) > limit)
  )
    throw new Error(
      "Public snapshot capacity exceeded; no partial data served.",
    );
}
