// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { createDatabaseConnection, type Database } from "@/lib/db/client";
import {
  plans,
  products,
  sources,
  priceObservations,
  priceChangeEvents,
} from "@/lib/db/schema";

let transactionDatabase: Database;
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/pricing/page-cache", () => ({
  PRICING_PAGE_CACHE_TAG: "pricing-page-data",
}));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getReadDatabase: () => transactionDatabase,
  isReadDatabaseConfigured: () => true,
}));
import { loadSubscriptionHistory } from "@/lib/pricing/history";

const url = process.env.PRICE_HISTORY_TEST_DATABASE_URL;
const connection = url ? createDatabaseConnection(url, 1) : null;
afterAll(async () => {
  await connection?.client.end();
});

describe.skipIf(!connection)(
  "subscription history SQL against PostgreSQL",
  () => {
    it("returns comparable original-currency changes and excludes mismatched identities and FX-only changes", async () => {
      const rollback = new Error("test rollback");
      await expect(
        connection!.database.transaction(async (tx) => {
          transactionDatabase = tx as unknown as Database;
          const [target] = await tx
            .select({
              planId: plans.id,
              sourceId: sources.id,
              slug: products.slug,
            })
            .from(plans)
            .innerJoin(products, eq(products.id, plans.productId))
            .innerJoin(sources, eq(sources.productId, products.id))
            .where(
              and(
                ne(products.mode, "api"),
                eq(products.enabled, true),
                eq(sources.enabled, true),
              ),
            )
            .limit(1);
          expect(target).toBeDefined();
          const cases = [
            { amountMinor: 900 },
            { amountMinor: 1000, convertedCny: 123 },
            { amountMinor: 900, currency: "USD" },
            { amountMinor: 900, billingPeriod: "year" },
            { amountMinor: 900, storefront: "CA" },
            { amountMinor: -1 },
          ];
          const ids: string[] = [];
          for (const change of cases) {
            const base = {
              planId: target.planId,
              sourceId: target.sourceId,
              rawPlanName: "History SQL test",
              storefront: "US",
              currency: "CNY",
              amountMinor: 1000,
              convertedCny: 10,
              displayPrice: "¥10/月",
              billingPeriod: "month",
              rawHash: "history-sql-rollback",
            };
            const [previous] = await tx
              .insert(priceObservations)
              .values(base)
              .returning();
            const [current] = await tx
              .insert(priceObservations)
              .values({ ...base, ...change })
              .returning();
            const [event] = await tx
              .insert(priceChangeEvents)
              .values({
                planId: target.planId,
                storefront: "US",
                previousObservationId: previous.id,
                currentObservationId: current.id,
              })
              .returning();
            ids.push(event.id);
          }
          const history = await loadSubscriptionHistory(target.slug);
          expect(history.available).toBe(true);
          expect(
            history.events
              .filter((event) => ids.includes(event.id))
              .map((event) => event.id),
          ).toEqual([ids[0]]);
          expect(
            history.events.find((event) => event.id === ids[0]),
          ).toMatchObject({
            previousAmountMinor: 1000,
            currentAmountMinor: 900,
            currency: "CNY",
            providerId: target.slug,
          });
          expect(
            (await loadSubscriptionHistory("missing-history-product")).events,
          ).toEqual([]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
