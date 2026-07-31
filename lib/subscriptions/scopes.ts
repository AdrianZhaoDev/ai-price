export const API_RANKING_PROVIDER_SLUG = "api-ranking";
export const API_RANKING_PLAN_SLUG = "*";

export function isApiRankingScope(
  providerSlug: string,
  planSlug: string | null | undefined,
): boolean {
  return (
    providerSlug === API_RANKING_PROVIDER_SLUG &&
    (planSlug ?? API_RANKING_PLAN_SLUG) === API_RANKING_PLAN_SLUG
  );
}
