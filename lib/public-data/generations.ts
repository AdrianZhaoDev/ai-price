import { contentHash, type TransitSnapshot } from "./snapshot";

export type SourceVersion = {
  stationId: string;
  generatedAt: string;
  contentHash: string;
};

export function transitGenerationIdentity(snapshot: TransitSnapshot) {
  if (!snapshot.sourceGenerations)
    return { hash: contentHash(snapshot), versions: null };
  const versions = snapshot.sourceGenerations
    .map((source) => {
      const station = snapshot.stations.find(
        (item) => item.id === source.stationId,
      )!;
      // A poll time is transport metadata, not a new upstream price generation.
      const { lastCollectedAt: _collected, ...stableStation } = station;
      void _collected;
      return {
        ...source,
        contentHash: contentHash({
          station: stableStation,
          offers: snapshot.offers
            .filter((offer) => offer.stationId === source.stationId)
            .toSorted((a, b) => a.id.localeCompare(b.id)),
          samples: snapshot.availabilitySamples
            .filter((sample) => sample.stationId === source.stationId)
            .toSorted((a, b) => a.id.localeCompare(b.id)),
        }),
      };
    })
    .toSorted((a, b) => a.stationId.localeCompare(b.stationId));
  return {
    hash: contentHash({
      domain: snapshot.domain,
      schemaVersion: snapshot.schemaVersion,
      sourceCount: snapshot.sourceCount,
      versions,
    }),
    versions,
  };
}

export function assertSourceVersions(
  previous: SourceVersion[] | null,
  incoming: SourceVersion[] | null,
) {
  if (!previous || !incoming)
    throw new Error("Source generation mode changed; review required.");
  const next = new Map(incoming.map((source) => [source.stationId, source]));
  for (const old of previous) {
    const source = next.get(old.stationId);
    if (!source || Date.parse(source.generatedAt) < Date.parse(old.generatedAt))
      throw new Error(
        "Source generation coverage regressed; current data retained.",
      );
    if (
      Date.parse(source.generatedAt) === Date.parse(old.generatedAt) &&
      source.contentHash !== old.contentHash
    )
      throw new Error(
        "Source generation conflicts at the same time; current data retained.",
      );
  }
}
