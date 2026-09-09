// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin/auth";
import {
  isAuthorizedAdminMutation,
  parseTransitDirectoryForm,
} from "@/lib/admin/transit-directory";

function validForm() {
  const form = new FormData();
  form.set("name", "Example API");
  form.set("websiteUrl", "https://example.org/docs#pricing");
  form.set("descriptionZh", "提供多模型 API 服务。");
  form.set("descriptionEn", "A multi-model API service.");
  form.set("rank", "20");
  form.set("published", "on");
  return form;
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://lowpriceradar.com");
  vi.stubEnv("EMAIL_TOKEN_SECRET", "s".repeat(32));
});

afterEach(() => vi.unstubAllEnvs());

describe("admin transit directory input", () => {
  it("normalizes valid directory fields", () => {
    expect(parseTransitDirectoryForm(validForm())).toEqual({
      name: "Example API",
      websiteUrl: "https://example.org/docs",
      descriptionZh: "提供多模型 API 服务。",
      descriptionEn: "A multi-model API service.",
      rank: 20,
      published: true,
    });
  });

  it.each([
    ["websiteUrl", "http://127.0.0.1"],
    ["websiteUrl", "https://user:pass@example.org"],
    ["name", ""],
    ["descriptionZh", "two\nlines"],
    ["rank", "-1"],
  ])("rejects invalid %s", (field, value) => {
    const form = validForm();
    form.set(field, value);
    expect(parseTransitDirectoryForm(form)).toBeNull();
  });

  it("requires both the signed admin session and same-origin request", () => {
    const session = createAdminSession();
    const request = new NextRequest(
      "https://lowpriceradar.com/api/admin/transit-directory",
      {
        method: "POST",
        headers: {
          cookie: `ai_price_admin_session=${session}`,
          origin: "https://lowpriceradar.com",
          host: "lowpriceradar.com",
        },
      },
    );
    expect(isAuthorizedAdminMutation(request)).toBe(true);
    expect(
      isAuthorizedAdminMutation(
        new NextRequest(request, {
          headers: {
            cookie: `ai_price_admin_session=${session}`,
            origin: "https://example.com",
            host: "lowpriceradar.com",
          },
        }),
      ),
    ).toBe(false);
  });
});
