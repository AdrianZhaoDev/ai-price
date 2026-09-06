// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
  agent: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("undici", () => ({
  fetch: mocks.fetch,
  Agent: class {
    constructor(options: unknown) {
      mocks.agent(options);
    }
    destroy() {
      return mocks.destroy();
    }
  },
}));
import {
  fetchPublicSnapshot,
  MAX_SNAPSHOT_BYTES,
} from "@/lib/public-data/fetch";

describe("public feed network boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.destroy.mockResolvedValue(undefined);
  });
  it("pins the verified address and disallows redirects", async () => {
    mocks.fetch.mockResolvedValue(new Response('{"ok":true}'));
    expect(
      await fetchPublicSnapshot(new URL("https://example.com/feed")),
    ).toEqual({ ok: true });
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    const connect = mocks.agent.mock.calls[0][0].connect;
    const callback = vi.fn();
    connect.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("rejects mixed public/private DNS without making a request", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      fetchPublicSnapshot(new URL("https://example.com/feed")),
    ).rejects.toThrow("public addresses");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("closes connections after status, size, parse, and network errors", async () => {
    for (const response of [
      new Response("no", { status: 403 }),
      new Response("{}", {
        headers: { "content-length": String(MAX_SNAPSHOT_BYTES + 1) },
      }),
      new Response("not-json"),
    ]) {
      mocks.fetch.mockResolvedValue(response);
      await expect(
        fetchPublicSnapshot(new URL("https://example.com/feed")),
      ).rejects.toThrow();
    }
    mocks.fetch.mockRejectedValue(new Error("network error"));
    await expect(
      fetchPublicSnapshot(new URL("https://example.com/feed")),
    ).rejects.toThrow();
    expect(mocks.destroy).toHaveBeenCalledTimes(4);
  });
});
