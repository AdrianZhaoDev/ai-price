import { eq, sql } from "drizzle-orm";
import { getPublicDataDatabase } from "@/lib/db/client";
import { publicOfferBaselines } from "@/lib/db/schema";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getPublicDataDatabase>["transaction"]>[0]
>[0];
export type BaselineInput = { id: string; identity: unknown[] };

export async function loadOfferBaselines<T extends Record<string, unknown>>(
  tx: Transaction,
  domain: "channels" | "transit",
  incoming: BaselineInput[],
) {
  const result = new Map<
    string,
    { payload: T; firstSeenAt: Date; updatedAt: number; identity: unknown[] }
  >();
  if (!incoming.length) return result;
  const incomingSources = new Map(
    incoming.map((row) => [row.id, row.identity[0]]),
  );
  const input = sql`jsonb_to_recordset(${JSON.stringify(incoming)}::jsonb) as incoming(id text, identity jsonb)`;
  // Separate equijoins preserve indexed/hashable lookup paths. The hash only
  // bounds index keys; exact JSON equality also guards against collisions.
  for (const predicate of [
    sql`${publicOfferBaselines.offerId} = incoming.id`,
    sql`md5(${publicOfferBaselines.identity}::text) = md5(incoming.identity::text) and ${publicOfferBaselines.identity} = incoming.identity`,
  ]) {
    const rows = await tx
      .select({
        id: sql<string>`incoming.id`,
        payload: publicOfferBaselines.payload,
        firstSeenAt: publicOfferBaselines.firstSeenAt,
        // Preserve sub-millisecond order across rapid successive publications.
        updatedAt:
          sql`extract(epoch from ${publicOfferBaselines.updatedAt}) * 1000000`.mapWith(
            Number,
          ),
        identity: publicOfferBaselines.identity,
      })
      .from(publicOfferBaselines)
      .innerJoin(input, predicate)
      .where(eq(publicOfferBaselines.domain, domain));
    for (const row of rows) {
      if (
        row.identity[0] != null &&
        row.identity[0] !== incomingSources.get(row.id)
      )
        throw new Error(
          "Offer source identity changed; previous snapshot retained for review.",
        );
      const old = result.get(row.id);
      const firstSeenAt = new Date(
        Math.min(
          row.firstSeenAt.getTime(),
          old?.firstSeenAt.getTime() ?? Infinity,
        ),
      );
      if (!old || row.updatedAt > old.updatedAt)
        result.set(row.id, { ...row, payload: row.payload as T, firstSeenAt });
      else old.firstSeenAt = firstSeenAt;
    }
  }
  return result;
}

export async function saveOfferBaselines(
  tx: Transaction,
  domain: "channels" | "transit",
  rows: Array<
    BaselineInput & { payload: Record<string, unknown>; firstSeenAt: Date }
  >,
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    await tx
      .insert(publicOfferBaselines)
      .values(
        rows.slice(offset, offset + 500).map((row) => ({
          domain,
          offerId: row.id,
          identity: row.identity,
          payload: row.payload,
          firstSeenAt: row.firstSeenAt,
          updatedAt: sql`clock_timestamp()`,
        })),
      )
      .onConflictDoUpdate({
        target: [publicOfferBaselines.domain, publicOfferBaselines.offerId],
        set: {
          identity: sql`excluded.identity`,
          payload: sql`excluded.payload`,
          firstSeenAt: sql`least(${publicOfferBaselines.firstSeenAt}, excluded.first_seen_at)`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}
