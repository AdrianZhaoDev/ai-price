import { cache } from "react";
import {
  loadTransitReadModel,
  publicStationView,
} from "@/lib/transit/repository";
import { isTransitStationPublic } from "@/lib/transit/types";

/** Request-scoped sharing between page metadata and its route render. */
export const loadTransitDetail = cache(async (slug: string) => {
  const model = await loadTransitReadModel();
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
