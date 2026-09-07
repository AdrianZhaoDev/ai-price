import { cache } from "react";
import {
  loadTransitReadModel,
  publicStationView,
} from "@/lib/transit/repository";
import { isTransitStationPublic } from "@/lib/transit/types";

/** Request-scoped sharing between page metadata and its route render. */
export const loadTransitDetail = cache(async (slug: string) => {
  const model = await loadTransitReadModel();
  if (model.degraded && model.stations.length === 0) {
    // A cold reader outage is not proof that a station does not exist. Let
    // Next's error boundary handle it; never cache a false not-found result.
    throw new Error("Public transit data is temporarily unavailable.");
  }
  const station = model.stations.find(
    (item) => item.slug === slug.toLowerCase(),
  );
  if (
    !station ||
    !isTransitStationPublic(station, { includeSample: model.isSynthetic })
  )
    return null;
  return {
    station: publicStationView(station, false),
    degraded: model.degraded,
  };
});
