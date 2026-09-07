import { describe, expect, it } from "vitest";
import { createSyntheticChannelSnapshot } from "@/lib/channels/fixture";
import { createChannelRepository } from "@/lib/channels/repository";
import {
  serializeChannelList,
  serializeChannelSnapshot,
  serializeTransitStation,
} from "@/lib/public-data/serializers";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
import { createTransitRepository } from "@/lib/transit/repository";

describe("public-data serializers", () => {
  it("keeps channel responses to an explicit public allow-list", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    const serialized = serializeChannelSnapshot(snapshot);
    expect(serialized.domain).toBe("channels");
    expect(serialized.offers[0]).not.toHaveProperty("metadata");
    expect(serialized.offers[0].source).toHaveProperty("type");
    expect(serialized.offers[0].offerUrl).toMatch(/^https:\/\//);
    expect(serialized).not.toHaveProperty("sourcePolicyVersion");
  });

  it("maps the three channel views without exposing internal offer metadata", async () => {
    const repository = createChannelRepository({ databaseConfigured: false });
    const result = await repository.list({ limit: 10 });
    const products = serializeChannelList(result, { view: "products" });
    const offers = serializeChannelList(result, { view: "offers" });
    const merchants = serializeChannelList(result, { view: "merchants" });
    expect(products.products.length).toBeGreaterThan(0);
    expect(offers.offers.length).toBeGreaterThan(0);
    expect(merchants.merchants.length).toBeGreaterThan(0);
    expect(offers.offers[0]).not.toHaveProperty("metadata");
  });

  it("never serializes transit payloads and preserves availability evidence", () => {
    const station = getSyntheticTransitStations()[0];
    const serialized = serializeTransitStation(station);
    expect(serialized).not.toHaveProperty("payload");
    expect(serialized.offers[0].availability).toHaveProperty("sevenDaySamples");
    expect(serialized.offers[0]).not.toHaveProperty("payload");
  });

  it("serializes a degraded transit read model with explicit status", async () => {
    const repository = createTransitRepository({
      allowSyntheticFixture: false,
      databaseLoader: async () => ({ stations: [] }),
    });
    const model = await repository.load();
    expect(model.degraded).toBe(true);
    const station = getSyntheticTransitStations()[0];
    const body = serializeTransitStation(station);
    expect(body.synthetic).toBe(true);
  });
});
