import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPage, hashContent } from "@/lib/collectors/http-client";
import { CollectionError } from "@/lib/collectors/types";

describe("collector HTTP client", () => {
  afterEach(() => vi.unstubAllGlobals());

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
        details: {
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
        },
      }),
    );
  });
});
