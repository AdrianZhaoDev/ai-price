import type { PriceMode } from "@/lib/pricing/types";

export type TrafficEvent =
  | "pricing_provider_selected"
  | "pricing_sort_changed"
  | "subscription_comparison_changed"
  | "subscription_comparison_shared"
  | "pricing_official_source_opened"
  | "pricing_history_opened"
  | "pricing_data_downloaded"
  | "subscription_sheet_opened"
  | "subscription_submit_succeeded"
  | "subscription_submit_failed";

export type TrafficEventProperties = {
  data_format?: "rss" | "csv" | "json";
  mode?: PriceMode;
  provider_id?: string;
  plan_id?: string;
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
      showConsentModal?: () => void;
      consent?: {
        APIReady: boolean;
        modal: boolean;
        getAll: () => Record<string, boolean>;
      };
    };
  }
}

export function trackTrafficEvent(
  event: TrafficEvent,
  properties?: TrafficEventProperties,
): void {
  if (typeof window === "undefined" || !window.zaraz?.track) return;

  try {
    // The Zone has one optional analytics purpose. Fail closed if the CMP is
    // missing, unresolved, or a configured purpose has been declined.
    if (!window.zaraz.consent?.APIReady) return;
    const choices = Object.values(window.zaraz.consent.getAll());
    if (choices.length === 0 || !choices.every((choice) => choice === true))
      return;
    const result = window.zaraz.track(event, properties);
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Analytics must never interrupt pricing or subscription interactions.
  }
}
