import { trackTrafficEvent } from "@/lib/analytics/traffic";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("traffic analytics", () => {
  const consent = {
    APIReady: true,
    modal: false,
    getAll: () => ({ analytics: true }),
  };
  afterEach(() => {
    delete window.zaraz;
    vi.restoreAllMocks();
  });

  it("tracks only the supplied anonymous event properties", () => {
    const track = vi.fn();
    window.zaraz = { track, consent };

    trackTrafficEvent("subscription_sheet_opened", {
      mode: "global",
      provider_id: "chatgpt",
      subscription_type: "price",
      plan_scope: "plan",
    });

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("subscription_sheet_opened", {
      mode: "global",
      provider_id: "chatgpt",
      subscription_type: "price",
      plan_scope: "plan",
    });
  });

  it("is a no-op when Zaraz is unavailable", () => {
    expect(() =>
      trackTrafficEvent("pricing_sort_changed", {
        mode: "api",
        sort_direction: "desc",
      }),
    ).not.toThrow();
  });

  it("does not send events without explicit consent or after withdrawal", () => {
    const track = vi.fn();
    window.zaraz = { track };
    trackTrafficEvent("subscription_comparison_shared");
    window.zaraz.consent = { ...consent, getAll: () => ({ analytics: false }) };
    trackTrafficEvent("subscription_comparison_shared");
    window.zaraz.consent = { ...consent, getAll: () => ({}) };
    trackTrafficEvent("subscription_comparison_shared");
    expect(track).not.toHaveBeenCalled();
  });

  it("does not expose synchronous or asynchronous analytics failures", async () => {
    window.zaraz = {
      consent,
      track: vi.fn(() => {
        throw new Error("analytics unavailable");
      }),
    };
    expect(() => trackTrafficEvent("pricing_provider_selected")).not.toThrow();

    window.zaraz = {
      consent,
      track: vi.fn(() => Promise.reject(new Error("analytics unavailable"))),
    };
    trackTrafficEvent("pricing_provider_selected");
    await Promise.resolve();
  });
});
