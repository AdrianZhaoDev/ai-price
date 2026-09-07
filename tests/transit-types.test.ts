import { describe, expect, it } from "vitest";
import {
  transitAvailabilitySchema,
  transitOfferSchema,
  transitReadModelSchema,
  transitStationSchema,
  isTransitStationPublic,
} from "@/lib/transit/types";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";

describe("transit public schemas", () => {
  it("accepts the synthetic fixture and keeps prices as an explicit alias", () => {
    const stations = getSyntheticTransitStations();
    expect(stations).toHaveLength(3);
    expect(stations.every((station) => station.synthetic)).toBe(true);
    expect(stations[0].offers).toEqual(stations[0].prices);
    expect(transitStationSchema.parse(stations[0]).slug).toBe(
      "synthetic-token",
    );
    expect(
      transitReadModelSchema.parse({
        generationId: "generation-test",
        generatedAt: "2026-01-15T00:00:00.000Z",
        sourcePolicyVersion: "test-v1",
        origin: "synthetic_fixture",
        isSynthetic: true,
        degraded: false,
        dataStatus: "sample",
        fallbackReason: "no_database_loader",
        stations,
      }).isSynthetic,
    ).toBe(true);
  });

  it("rejects invalid availability ranges and malformed offers", () => {
    const availability = getSyntheticTransitStations()[0].availability;
    expect(
      transitAvailabilitySchema.safeParse({
        ...availability,
        sevenDayRate: 1.5,
      }).success,
    ).toBe(false);
    const offer = getSyntheticTransitStations()[0].offers[0];
    expect(
      transitOfferSchema.safeParse({
        ...offer,
        currency: "yuan",
      }).success,
    ).toBe(false);
  });

  it("requires reviewed data and excludes unavailable stations", () => {
    const station = getSyntheticTransitStations()[0];
    expect(
      isTransitStationPublic({ status: station.status, dataStatus: "sample" }),
    ).toBe(false);
    expect(
      isTransitStationPublic(
        { status: station.status, dataStatus: "sample" },
        { includeSample: true },
      ),
    ).toBe(true);
    expect(
      isTransitStationPublic({ status: "unavailable", dataStatus: "verified" }),
    ).toBe(false);
    expect(
      isTransitStationPublic(
        { status: "unknown", dataStatus: "pending_review" },
        { includeUnpublished: true },
      ),
    ).toBe(true);
  });
});
