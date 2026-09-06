import { describe, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/transit/repository", () => ({
  loadTransitReadModel: load,
  publicStationView: (station: unknown) => station,
}));
import { loadTransitDetail } from "@/lib/transit/detail";

describe("transit detail outage semantics", () => {
  it("throws a safe temporary error on a cold outage instead of returning missing", async () => {
    load.mockResolvedValue({ stations: [], degraded: true });
    await expect(loadTransitDetail("known-station")).rejects.toThrow(
      "temporarily unavailable",
    );
    load.mockResolvedValue({ stations: [], degraded: false });
    expect(await loadTransitDetail("absent-station")).toBeNull();
  });
});
