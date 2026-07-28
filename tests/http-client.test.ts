import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPage, hashContent } from "@/lib/collectors/http-client";
import { CollectionError } from "@/lib/collectors/types";

describe("collector HTTP client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns a hashed successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><title>Pricing</title></html>", {
          status: 200,
          headers: { etag: "abc" },
        }),
      ),
    );
    const result = await fetchPage("https://example.com/pricing", {
      attempts: 1,
      observedAt: new Date("2026-07-23T10:00:00Z"),
    });
    expect(result.status).toBe(200);
    expect(result.headers.etag).toBe("abc");
    expect(result.contentHash).toBe(hashContent(result.body));
    expect(result.observedAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("allows an explicitly expected 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
    );
    await expect(
      fetchPage("https://example.com/app", {
        attempts: 1,
        allowedStatuses: [404],
      }),
    ).resolves.toMatchObject({ status: 404, body: "missing" });
  });

  it("classifies HTTP errors and access challenges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
    );
    await expect(
      fetchPage("https://example.com", { attempts: 1 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<title>Verify you are human</title>", {
          status: 200,
        }),
      ),
    );
    await expect(
      fetchPage("https://example.com", { attempts: 1 }),
    ).rejects.toMatchObject({ code: "ACCESS_BLOCKED" });
  });

  it("wraps network failures and retries", async () => {
    const mockedFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", mockedFetch);
    await expect(
      fetchPage("https://example.com", {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toMatchObject({ body: "ok" });
    expect(mockedFetch).toHaveBeenCalledTimes(2);

    const networkCause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "example.com",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError("fetch failed", { cause: networkCause }),
        ),
    );
    await expect(
      fetchPage("https://example.com?token=secret-value", { attempts: 1 }),
    ).rejects.toMatchObject(
      expect.objectContaining<Partial<CollectionError>>({
        code: "FETCH_FAILED",
        details: expect.objectContaining({
          url: "https://example.com/?token=[redacted]",
          attempts: [
            expect.objectContaining({
              attempt: 1,
              error: expect.objectContaining({
                cause: expect.objectContaining({ code: "ENOTFOUND" }),
              }),
            }),
          ],
          finalError: expect.objectContaining({
            cause: expect.objectContaining({
              code: "ENOTFOUND",
              hostname: "example.com",
            }),
          }),
        }),
      }),
    );
  });

  it("uses the configured collector proxy and falls back to direct", async () => {
    vi.stubEnv("COLLECTOR_PROXY_URL", "http://127.0.0.1:40000");
    const mockedFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("proxy unavailable"))
      .mockResolvedValueOnce(new Response("direct response"));
    vi.stubGlobal("fetch", mockedFetch);

    await expect(
      fetchPage("https://example.com", {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toMatchObject({ body: "direct response" });

    expect(mockedFetch.mock.calls[0][1]).toHaveProperty("dispatcher");
    expect(mockedFetch.mock.calls[1][1]).not.toHaveProperty("dispatcher");
  });

  it("retries the proxy after a direct connection also fails", async () => {
    vi.stubEnv("COLLECTOR_PROXY_URL", "http://127.0.0.1:40000");
    const mockedFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("proxy temporarily unavailable"))
      .mockRejectedValueOnce(new Error("direct connection unavailable"))
      .mockResolvedValueOnce(new Response("proxy recovered"));
    vi.stubGlobal("fetch", mockedFetch);

    await expect(
      fetchPage("https://example.com", {
        attempts: 3,
        retryDelayMs: 0,
      }),
    ).resolves.toMatchObject({ body: "proxy recovered" });

    expect(mockedFetch.mock.calls[0][1]).toHaveProperty("dispatcher");
    expect(mockedFetch.mock.calls[1][1]).not.toHaveProperty("dispatcher");
    expect(mockedFetch.mock.calls[2][1]).toHaveProperty("dispatcher");
  });
});
