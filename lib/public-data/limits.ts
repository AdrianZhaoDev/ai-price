// Pilot capacity envelope. Increasing these requires a separately reviewed
// SQL-paginated read model and precomputed monitoring aggregates.
export const PUBLIC_DATA_LIMITS = {
  snapshotBytes: 10 * 1024 * 1024,
  merchants: 100,
  products: 1000,
  channelOffers: 5000,
  stations: 100,
  transitOffers: 5000,
  samples: 10000,
} as const;
