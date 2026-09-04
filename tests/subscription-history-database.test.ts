// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { createDatabaseConnection, type Database } from "@/lib/db/client";
import {
  providers,
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

    it("withholds large changes only when this product has recorded same-name App Store period ambiguity", async () => {
      const rollback = new Error("test rollback");
      await expect(
        connection!.database.transaction(async (tx) => {
          transactionDatabase = tx as unknown as Database;
          const [provider] = await tx
            .insert(providers)
            .values({
              slug: `history-period-${crypto.randomUUID()}`,
              name: "History fixture",
            })
            .returning();
          const [product, otherProduct] = await tx
            .insert(products)
            .values(
              ["primary", "other"].map((slug) => ({
                providerId: provider.id,
                slug,
                name: slug,
                mode: "global" as const,
              })),
            )
            .returning();
          const [monthly, annual, otherAnnual] = await tx
            .insert(plans)
            .values([
              {
                productId: product.id,
                canonicalSlug: "month",
                name: "Monthly",
                billingPeriod: "month",
              },
              {
                productId: product.id,
                canonicalSlug: "year",
                name: "Annual",
                billingPeriod: "year",
              },
              {
                productId: otherProduct.id,
                canonicalSlug: "year",
                name: "Annual",
                billingPeriod: "year",
              },
            ])
            .returning();
          const [appStore, otherStorefront, officialWeb, unrelatedAppStore] =
            await tx
              .insert(sources)
              .values(
                [
                  {
                    productId: product.id,
                    slug: "us",
                    type: "app_store" as const,
                  },
                  {
                    productId: product.id,
                    slug: "jp",
                    type: "app_store" as const,
                  },
                  {
                    productId: product.id,
                    slug: "web",
                    type: "official_web" as const,
                  },
                  {
                    productId: otherProduct.id,
                    slug: "us",
                    type: "app_store" as const,
                  },
                ].map((source) => ({
                  ...source,
                  url: "https://example.test/history",
                  parserVersion: "test",
                })),
              )
              .returning();
          type Evidence =
            | "same-source"
            | "other-storefront"
            | "case-variant"
            | "space-variant"
            | "other-product"
            | "other-channel"
            | "other-name"
            | "same-period"
            | "unknown-period"
            | "previous-name"
            | "current-name";
          const cases: {
            before: number;
            after: number;
            keep: boolean;
            name?: string;
            evidence?: Evidence;
            nonAppStore?: boolean;
            billingPeriod?: string;
          }[] = [
            {
              before: 1000,
              after: 10000,
              evidence: "same-source",
              keep: false,
            },
            {
              before: 10000,
              after: 1000,
              evidence: "same-source",
              keep: false,
            },
            { before: 1000, after: 6000, evidence: "same-source", keep: false },
            { before: 6000, after: 1000, evidence: "same-source", keep: false },
            { before: 1000, after: 5999, evidence: "same-source", keep: true },
            { before: 5999, after: 1000, evidence: "same-source", keep: true },
            { before: 0, after: 10000, evidence: "same-source", keep: true },
            { before: 10000, after: 0, evidence: "same-source", keep: true },
            { before: 1000, after: 10000, keep: true },
            {
              before: 1000,
              after: 10000,
              evidence: "other-storefront",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "case-variant",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "space-variant",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "other-product",
              keep: true,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "other-channel",
              keep: true,
            },
            { before: 1000, after: 10000, evidence: "other-name", keep: true },
            { before: 1000, after: 10000, evidence: "same-period", keep: true },
            {
              before: 1000,
              after: 10000,
              evidence: "unknown-period",
              keep: true,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "previous-name",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "current-name",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "same-source",
              nonAppStore: true,
              keep: true,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "same-source",
              name: "周年纪念 Plus",
              keep: false,
            },
            {
              before: 1000,
              after: 10000,
              evidence: "same-source",
              name: "Plus year-round",
              keep: false,
            },
            ...[
              "Plus Monthly",
              "Plus month",
              "毎月",
              "매월",
              "monatlich",
              "mensuel",
              "月卡",
            ].map((name) => ({ before: 1000, after: 10000, name, keep: true })),
            {
              before: 1000,
              after: 10000,
              name: "プラス 年間",
              billingPeriod: "year",
              keep: true,
            },
          ];
          const ids: string[] = [];
          const expected: string[] = [];
          for (const [index, testCase] of cases.entries()) {
            // Distinct labels prevent one case's evidence affecting another.
            const label = `${testCase.name ?? "History plan"} ${index}`;
            const previousName =
              testCase.evidence === "current-name" ? `${label} old` : label;
            const currentName =
              testCase.evidence === "previous-name" ? `${label} new` : label;
            const base = {
              planId:
                testCase.billingPeriod === "year" ? annual.id : monthly.id,
              sourceId: testCase.nonAppStore ? officialWeb.id : appStore.id,
              storefront: "US",
              currency: "USD",
              billingPeriod: testCase.billingPeriod ?? "month",
              rawHash: "history-period-rollback",
              displayPrice: "$10.00",
            };
            const [previous] = await tx
              .insert(priceObservations)
              .values({
                ...base,
                rawPlanName: previousName,
                amountMinor: testCase.before,
              })
              .returning();
            const [current] = await tx
              .insert(priceObservations)
              .values({
                ...base,
                rawPlanName: currentName,
                amountMinor: testCase.after,
              })
              .returning();
            if (testCase.evidence) {
              const otherRegion = [
                "other-storefront",
                "case-variant",
                "space-variant",
              ].includes(testCase.evidence);
              const unrelated = testCase.evidence === "other-product";
              const samePeriod = testCase.evidence === "same-period";
              await tx.insert(priceObservations).values({
                ...base,
                planId: unrelated
                  ? otherAnnual.id
                  : samePeriod
                    ? monthly.id
                    : annual.id,
                sourceId: unrelated
                  ? unrelatedAppStore.id
                  : otherRegion
                    ? otherStorefront.id
                    : testCase.evidence === "other-channel"
                      ? officialWeb.id
                      : appStore.id,
                storefront: otherRegion ? "JP" : "US",
                currency: otherRegion ? "JPY" : "USD",
                rawPlanName:
                  testCase.evidence === "other-name"
                    ? `${label} different`
                    : testCase.evidence === "case-variant"
                      ? label.toUpperCase()
                      : testCase.evidence === "space-variant"
                        ? `  ${label}  `
                        : label,
                billingPeriod:
                  testCase.evidence === "unknown-period"
                    ? null
                    : samePeriod
                      ? "month"
                      : "year",
                amountMinor: 12000,
              });
            }
            const [event] = await tx
              .insert(priceChangeEvents)
              .values({
                planId: base.planId,
                storefront: "US",
                previousObservationId: previous.id,
                currentObservationId: current.id,
              })
              .returning();
            ids.push(event.id);
            if (testCase.keep) expected.push(event.id);
          }
          const history = await loadSubscriptionHistory(product.slug);
          expect(
            new Set(
              history.events
                .filter((event) => ids.includes(event.id))
                .map((event) => event.id),
            ),
          ).toEqual(new Set(expected));
          // Filtering never mutates or removes the original confirmed events.
          const stored = await tx
            .select({ id: priceChangeEvents.id })
            .from(priceChangeEvents)
            .where(eq(priceChangeEvents.planId, monthly.id));
          expect(stored.length).toBe(
            cases.filter((testCase) => testCase.billingPeriod !== "year")
              .length,
          );
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
