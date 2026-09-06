// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readBoundedJson } from "@/lib/public-data/fetch";
import { aggregateAvailability } from "@/lib/transit/repository";

describe("bounded public snapshots", () => {
  it("parses chunks and stops as soon as the size limit is exceeded", async () => {
    async function* chunks() {
      yield Buffer.from('{"ok":');
      yield Buffer.from("true}");
    }
    expect(await readBoundedJson(chunks(), 20)).toEqual({ ok: true });
    let reads = 0;
    async function* tooLarge() {
      reads++;
      yield Buffer.alloc(10);
      reads++;
      yield Buffer.alloc(10);
      reads++;
      yield Buffer.alloc(10);
    }
    await expect(readBoundedJson(tooLarge(), 15)).rejects.toThrow("size limit");
    expect(reads).toBe(2);
    await expect(readBoundedJson(chunks(), 0)).rejects.toThrow();
  });
});

describe("availability evidence windows", () => {
  const now = new Date("2026-09-07T00:00:00Z");
  const sample = {
    stationId: "s",
    offerId: "o",
    scope: "offer",
    matchLevel: "exact",
    success: true,
    sampleCount: 1,
    sourceType: "public_status",
    sourceUrl: "https://example.com/status",
    checkedAt: "2026-09-06T00:00:00Z",
  };
  it("carries the earliest contributing expiry and newest summary expiry", () => {
    const earliest = "2026-09-07T01:00:00.000Z";
    const later = "2026-09-07T02:00:00.000Z";
    const evidence = aggregateAvailability(
      [
        { ...sample, id: "first", expiresAt: earliest },
        {
          ...sample,
          id: "second",
          checkedAt: "2026-09-06T01:00:00Z",
          expiresAt: later,
        },
      ],
      "s",
      "o",
      now,
    );
    expect(evidence.expiresAt).toBe(earliest);
    const summary = aggregateAvailability(
      [{ ...sample, sampleCount: 100, sevenDayRate: 0.9, expiresAt: later }],
      "s",
      "o",
      now,
    );
    expect(summary.expiresAt).toBe(later);
  });
  it("excludes stale/future/wrong-scope evidence and deduplicates samples", () => {
    const evidence = aggregateAvailability(
      [
        { ...sample, id: "a" },
        { ...sample, id: "a" },
        { ...sample, checkedAt: "2026-08-30T00:00:00Z" },
        { ...sample, checkedAt: "2026-09-08T00:00:00Z" },
        { ...sample, scope: "group" },
        { ...sample, matchLevel: "model" },
      ],
      "s",
      "o",
      now,
    );
    expect(evidence.sevenDaySamples).toBe(1);
    expect(evidence.sevenDayRate).toBe(1);
    expect(
      aggregateAvailability(
        [{ ...sample, offerId: undefined, scope: "group" }],
        "s",
        undefined,
        now,
      ).sevenDaySamples,
    ).toBe(0);
  });
  it("uses only the latest rolling summary and never inflates its sample count", () => {
    const evidence = aggregateAvailability(
      [
        { ...sample, id: "a", sampleCount: 100, sevenDayRate: 0.9 },
        {
          ...sample,
          id: "b",
          checkedAt: now.toISOString(),
          sampleCount: 110,
          sevenDayRate: 0.8,
        },
      ],
      "s",
      "o",
      now,
    );
    expect(evidence.sevenDaySamples).toBe(110);
    expect(evidence.sevenDayRate).toBe(0.8);
    expect(
      aggregateAvailability(
        [{ ...sample, sourceType: "public_model_catalog" }],
        "s",
        "o",
        now,
      ).sevenDaySamples,
    ).toBe(0);
  });
});
