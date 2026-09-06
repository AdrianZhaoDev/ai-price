import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as channelsGet } from "@/app/api/channels/route";
import { GET as channelOffersGet } from "@/app/api/v1/channels/offers/route";
import { GET as transitGet } from "@/app/api/transit/route";
import { GET as transitDetailGet } from "@/app/api/transit/[slug]/route";
import { resetDefaultChannelRepository } from "@/lib/channels/repository";
import { resetDefaultTransitRepository } from "@/lib/transit/repository";
import { publicUrl } from "@/app/api/_public-data/response";

describe("public channels and transit API routes", () => {
  beforeEach(() => {
    resetDefaultChannelRepository();
    resetDefaultTransitRepository();
  });

  it("serves a marked synthetic channels read model without fetching upstream URLs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await channelsGet(
      new Request("http://localhost/api/channels?view=offers&limit=2"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.ok).toBe(true);
    expect(body.dataStatus).toBe("synthetic");
    expect(body.offers).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain("metadata");
    expect(JSON.stringify(body)).not.toContain("payload");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps versioned offer aliases read-only and rejects private filters", async () => {
    const privateResponse = await channelOffersGet(
      new Request(
        "http://localhost/api/v1/channels/offers?publishedOnly=false",
      ),
    );
    expect(privateResponse.status).toBe(400);
    expect(privateResponse.headers.get("cache-control")).toContain("no-store");

    const response = await channelOffersGet(
      new Request("http://localhost/api/v1/channels/offers?limit=1"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.view).toBe("offers");
    expect(body.offers).toHaveLength(1);
    expect(body.products).toBeUndefined();
  });

  it("returns a transit list with an explicit synthetic marker and safe query", async () => {
    const response = await transitGet(
      new Request("http://localhost/api/transit?q=token&limit=1"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.isSynthetic).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.query).toMatchObject({ q: "token", limit: 1 });
    expect(body.query.includeUnpublished).toBe(false);
    expect(JSON.stringify(body)).not.toContain("payload");
  });

  it("does not permit unpublished transit records through a public query", async () => {
    const response = await transitGet(
      new Request("http://localhost/api/transit?includeUnpublished=true"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("PRIVATE_FILTER");
  });

  it("resolves dynamic detail params as a Promise and returns 404 safely", async () => {
    const found = await transitDetailGet(
      new Request("http://localhost/api/transit/synthetic-token"),
      { params: Promise.resolve({ slug: "synthetic-token" }) },
    );
    const foundBody = await found.json();
    expect(found.status).toBe(200);
    expect(foundBody.station.slug).toBe("synthetic-token");
    expect(foundBody.station.offers[0].availability).not.toHaveProperty(
      "payload",
    );

    const missing = await transitDetailGet(
      new Request("http://localhost/api/transit/missing"),
      { params: Promise.resolve({ slug: "missing" }) },
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toContain("no-store");
  });

  it("strips credentials, sensitive query parameters, and private hosts without networking", () => {
    expect(publicUrl("https://example.test/path?utm_source=public")).toBe(
      "https://example.test/path?utm_source=public",
    );
    expect(publicUrl("https://example.test/path?api_key=secret")).toBe(
      "https://example.test/path",
    );
    expect(publicUrl("https://user:pass@example.test/path")).toBeNull();
    expect(publicUrl("http://127.0.0.1:8080/private")).toBeNull();
  });
});
