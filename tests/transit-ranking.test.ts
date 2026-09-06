import { describe, expect, it } from "vitest";
import {
  availabilityRate,
  calculateCombinedRate,
  calculateRechargeCoefficient,
  decodeTransitCursor,
  encodeTransitCursor,
  filterTransitStations,
  paginateTransitStations,
  parseRechargeRatio,
  parseTransitListQuery,
  safeParseTransitListQuery,
  sortTransitStations,
  TransitQueryError,
} from "@/lib/transit/ranking";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";

describe("transit ratio and comparable-rate rules", () => {
  it("parses paid:credited ratios with an explicit reciprocal coefficient", () => {
    expect(parseRechargeRatio(" 1 ： 1.2 ")).toEqual({
      paid: 1,
      credited: 1.2,
    });
    expect(calculateRechargeCoefficient("1:1.2")).toBeCloseTo(1 / 1.2);
    expect(calculateRechargeCoefficient("0:1")).toBeNull();
    expect(calculateRechargeCoefficient("not-a-ratio")).toBeNull();
  });

  it("does not compare fixed/per-request offers with token rates", () => {
    expect(
      calculateCombinedRate({
        billingMode: "token",
        rechargeRatioRaw: "1:2",
        modelMultiplier: 0.5,
      }),
    ).toBeCloseTo(0.25);
    expect(
      calculateCombinedRate({
        billingMode: "token",
        rechargeCoefficient: 0.5,
        stationGroupMultiplier: 0.4,
        modelMultiplier: 0.1,
      }),
    ).toBeCloseTo(0.2);
    expect(
      calculateCombinedRate({
        billingMode: "fixed",
        rechargeRatioRaw: "1:2",
        modelMultiplier: 0.1,
      }),
    ).toBeNull();
    expect(
      calculateCombinedRate({
        billingMode: "per_request",
        rechargeRatioRaw: "1:2",
        modelMultiplier: 0.1,
      }),
    ).toBeNull();
  });
});

describe("transit filters, ordering, and cursors", () => {
  it("ranks station-scoped availability by rate before sample count", () => {
    const template = getSyntheticTransitStations()[0];
    const stations = [0, 1].map((rate) => ({
      ...template,
      id: `station-${rate}`,
      slug: `station-${rate}`,
      offers: [],
      availability: {
        ...template.availability,
        sevenDayRate: rate,
        sevenDaySamples: rate ? 2 : 100,
      },
    }));
    expect(
      sortTransitStations(stations, "stability").map((station) => station.id),
    ).toEqual(["station-1", "station-0"]);
  });
  it("filters synthetic stations by text, family, channel, and risk", () => {
    const stations = getSyntheticTransitStations();
    expect(
      filterTransitStations(stations, { q: "synthetic-token" }),
    ).toHaveLength(1);
    expect(filterTransitStations(stations, { family: "image" })[0].slug).toBe(
      "synthetic-fixed",
    );
    expect(filterTransitStations(stations, { channel: "cloud" })[0].slug).toBe(
      "synthetic-fixed",
    );
    expect(
      filterTransitStations(stations, { risk: "pending_feedback" }),
    ).toHaveLength(0);
    expect(
      filterTransitStations(stations, { includeUnpublished: true }),
    ).toHaveLength(3);
  });

  it("sorts rates first while leaving fixed-only offers incomparable", () => {
    const stations = getSyntheticTransitStations();
    const byRate = sortTransitStations(stations, "rate");
    expect(byRate.map((station) => station.slug)).toEqual([
      "synthetic-token",
      "synthetic-fixed",
      "synthetic-pending",
    ]);
    const byName = sortTransitStations(stations, "name");
    expect(byName.map((station) => station.slug)).toEqual([
      "synthetic-fixed",
      "synthetic-token",
      "synthetic-pending",
    ]);
    expect(sortTransitStations(stations, "updated")).toHaveLength(3);
    expect(sortTransitStations(stations, "stability")).toHaveLength(3);
  });

  it("parses bounded, allow-listed query parameters", () => {
    const query = parseTransitListQuery(
      new URLSearchParams("q=demo&family=gpt&limit=2&includeUnpublished=false"),
    );
    expect(query).toMatchObject({
      q: "demo",
      family: "gpt",
      limit: 2,
      includeUnpublished: false,
      sort: "overall",
    });
    expect(safeParseTransitListQuery({ unknown: "x" }).success).toBe(false);
    expect(() => parseTransitListQuery({ limit: "0" })).toThrow(
      TransitQueryError,
    );
    expect(
      safeParseTransitListQuery(new URLSearchParams("q=a&q=b")).success,
    ).toBe(false);
  });

  it("paginates with deterministic opaque cursors", () => {
    const stations = getSyntheticTransitStations();
    expect(encodeTransitCursor(36)).toBe("o10");
    expect(decodeTransitCursor("o10")).toBe(36);
    expect(() => decodeTransitCursor("bad-cursor")).toThrow(TransitQueryError);
    const first = paginateTransitStations(stations, {
      limit: 1,
      cursor: undefined,
    });
    expect(first.items[0].slug).toBe("synthetic-token");
    expect(first.nextCursor).toBe("o1");
    const second = paginateTransitStations(stations, {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items[0].slug).toBe("synthetic-fixed");
    expect(second.nextCursor).toBe("o2");
    expect(availabilityRate(stations[0].availability)).toBeNull();
    expect(availabilityRate(stations[0].offers[0].availability)).toBeCloseTo(
      0.96,
    );
  });
});
