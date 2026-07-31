export type DataSyncTableCounts = {
  providers: number;
  products: number;
  plans: number;
  sources: number;
  collectionRuns: number;
  fxRates: number;
  priceObservations: number;
  priceChangeCandidates: number;
  priceChangeEvents: number;
  apiRankingState: number;
  apiRankingEvents: number;
  collectionErrors: number;
};

export type DataSyncResult = {
  channel: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  counts: DataSyncTableCounts;
};
