import type { PriceMode } from "@/lib/pricing/types";

export type TrafficEvent =
  | "pricing_provider_selected"
  | "pricing_sort_changed"
  | "subscription_sheet_opened"
  | "subscription_submit_succeeded"
  | "subscription_submit_failed";

export type TrafficEventProperties = {
  mode?: PriceMode;
  provider_id?: string;
  subscription_type?: "price" | "api_model_new";
  plan_scope?: "provider" | "plan" | "api_model_new";
  sort_direction?: "asc" | "desc";
  result?: "subscribed" | "already_subscribed" | "fallback_subscribed";
  failure_kind?: "http" | "network" | "invalid_response" | "fallback_available";
};

declare global {
  interface Window {
    zaraz?: {
      track: (
        event: TrafficEvent,
        properties?: TrafficEventProperties,
      ) => unknown;
    };
  }
}

export function trackTrafficEvent(
  event: TrafficEvent,
  properties?: TrafficEventProperties,
): void {
  if (typeof window === "undefined" || !window.zaraz?.track) return;

  try {
    const result = window.zaraz.track(event, properties);
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Analytics must never interrupt pricing or subscription interactions.
  }
}
