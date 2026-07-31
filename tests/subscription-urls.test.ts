import {
  createSubscriptionUrl,
  getApplicationBaseUrl,
} from "@/lib/subscriptions/urls";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("subscription URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses APP_URL instead of an internal localhost request origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://lowpriceradar.com");

    expect(
      createSubscriptionUrl(
        "/subscription/result?status=unsubscribed",
        "https://localhost:3100/api/subscriptions/unsubscribe?token=test",
      ).toString(),
    ).toBe("https://lowpriceradar.com/subscription/result?status=unsubscribed");
  });

  it("rejects a localhost production APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://localhost:3100");

    expect(() => getApplicationBaseUrl()).toThrow(
      "APP_URL must use a public hostname in production.",
    );
  });
});
