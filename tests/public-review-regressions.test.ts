import { describe, expect, it, vi } from "vitest";
import { getDefaultChannelRepository } from "@/lib/channels/repository";
import { handleChannelDetailGet } from "@/app/api/_public-data/handlers";
import { GET as channelsGet } from "@/app/api/channels/route";
import { GET as offerDetailGet } from "@/app/api/channels/offers/[id]/route";
import { createSyntheticChannelSnapshot } from "@/lib/channels/fixture";
import { channelOfferFiltersSchema } from "@/lib/channels/types";
import {
  channelOfferSnapshotSchema,
  transitStationSnapshotSchema,
} from "@/lib/public-data/snapshot";
import { isPrivateOrReservedHostname } from "@/lib/public-data/urls";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
import { filterTransitStations } from "@/lib/transit/ranking";
import { isTransitStationPublic } from "@/lib/transit/types";

describe("public review regressions", () => {
  it("does not expose pending merchant details", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    snapshot.merchants![0].status = "pending_review";
    const id = snapshot.merchants![0].id;
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      const response = await handleChannelDetailGet(
        new Request(`http://localhost/api/channels/${id}`),
        { params: Promise.resolve({ id }) },
      );
      expect(response.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
  it("lists reviewed prices with unknown uptime without exposing unreviewed stations", () => {
    expect(
      isTransitStationPublic({ status: "unknown", dataStatus: "verified" }),
    ).toBe(true);
    expect(
      isTransitStationPublic({
        status: "unknown",
        dataStatus: "pending_review",
      }),
    ).toBe(false);
  });
  it.each(["products", "merchants"])(
    "paginates %s independently",
    async (view) => {
      const first = await (
        await channelsGet(
          new Request(`http://localhost/api/channels?view=${view}&limit=1`),
        )
      ).json();
      const next = await (
        await channelsGet(
          new Request(
            `http://localhost/api/channels?view=${view}&limit=1&offset=1`,
          ),
        )
      ).json();
      expect(first.items).toHaveLength(1);
      expect(next.items).toHaveLength(1);
      expect(first.items[0]).not.toEqual(next.items[0]);
    },
  );
  it("rejects unknown query keys and retains documented aliases", async () => {
    const response = await channelsGet(
      new Request("http://localhost/api/channels?currency=USD"),
    );
    expect(response.status).toBe(400);
    expect(
      channelOfferFiltersSchema.parse({ q: "hello", sort: "updated" }),
    ).toMatchObject({ query: "hello", direction: "desc" });
    expect(
      channelOfferFiltersSchema.parse({ sort: "relevance" }).direction,
    ).toBe("desc");
    expect(
      channelOfferFiltersSchema.parse({ sort: "updated", direction: "asc" })
        .direction,
    ).toBe("asc");
  });
  it("never resolves products through the offer-only endpoint", async () => {
    const id = createSyntheticChannelSnapshot().products![0].id;
    const response = await offerDetailGet(
      new Request(`http://localhost/api/channels/offers/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(404);
  });
  it("aligns minor-unit and slug contracts and rejects TEST-NET-1", () => {
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(1.25).success,
    ).toBe(false);
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(125).success,
    ).toBe(true);
    for (const slug of ["station_1", "station.1", "-station"])
      expect(
        transitStationSnapshotSchema.shape.slug.safeParse(slug).success,
      ).toBe(false);
    expect(isPrivateOrReservedHostname("192.0.2.1")).toBe(true);
  });
  it("does not match unpublished offer metadata in public searches", () => {
    const station = getSyntheticTransitStations()[0];
    station.offers = [
      {
        ...station.offers[0],
        standardModelLabel: "private-needle",
        groupName: "private-needle",
        status: "pending_review",
      },
    ];
    expect(filterTransitStations([station], { q: "private-needle" })).toEqual(
      [],
    );
  });
});
