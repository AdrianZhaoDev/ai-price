export const API_MODEL_NEW_PROVIDER_SLUG = "api-model-new";
export const API_MODEL_NEW_PLAN_SLUG = "*";

/** @deprecated Use the new-model scope names. Kept for internal compatibility. */
export const API_RANKING_PROVIDER_SLUG = "api-ranking";
/** @deprecated Use the new-model scope names. Kept for internal compatibility. */
export const API_RANKING_PLAN_SLUG = API_MODEL_NEW_PLAN_SLUG;

export function isApiModelNewScope(
  providerSlug: string,
  planSlug: string | null | undefined,
): boolean {
  return (
    providerSlug === API_MODEL_NEW_PROVIDER_SLUG &&
    (planSlug ?? API_MODEL_NEW_PLAN_SLUG) === API_MODEL_NEW_PLAN_SLUG
  );
}
