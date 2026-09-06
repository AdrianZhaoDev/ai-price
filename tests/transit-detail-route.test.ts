import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
const { loader } = vi.hoisted(() => ({ loader: vi.fn() }));
vi.mock("@/lib/transit/detail", () => ({ loadTransitDetail: loader }));
vi.mock("@/components/site-header", () => ({
  SiteHeader: () => null,
  SiteFooter: () => null,
}));
import ChineseRoute from "@/app/api-transit/[slug]/page";
import EnglishRoute from "@/app/en/api-transit/[slug]/page";

describe("transit detail route data ownership", () => {
  beforeEach(() => loader.mockReset());
  it.each([ChineseRoute, EnglishRoute])(
    "passes the already loaded station and degradation state to the renderer",
    async (route) => {
      const station = getSyntheticTransitStations()[0];
      loader.mockResolvedValue({ station, degraded: true });
      const element = await route({
        params: Promise.resolve({ slug: station.slug }),
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(element.props).toMatchObject({ station, degraded: true });
      expect(element.props).not.toHaveProperty("slug");
    },
  );
});
