// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createSubmission: vi.fn(),
  sendMail: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  configured: vi.fn(),
}));

vi.mock("@/lib/transit/submissions", () => ({
  createTransitSubmission: mocks.createSubmission,
  transitWebsiteKey: (url: string) => new URL(url).hostname,
}));
vi.mock("@/lib/email/transport", () => ({
  isSmtpConfigured: mocks.configured,
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
}));
vi.mock("@/lib/email/delivery", () => ({
  reserveEmailDelivery: mocks.reserve,
  settleEmailDelivery: mocks.settle,
}));

import { POST } from "@/app/api/transit/submissions/route";

function request(
  body: Record<string, unknown>,
  origin = "https://lowpriceradar.com",
) {
  return new NextRequest("https://lowpriceradar.com/api/transit/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "x-real-ip": "192.0.2.1",
    },
    body: JSON.stringify({
      email: "owner@example.com",
      verificationId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
      description: "An AI API gateway.",
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://lowpriceradar.com");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  mocks.createSubmission.mockResolvedValue("submitted");
  mocks.configured.mockReturnValue(true);
  mocks.reserve.mockResolvedValue({
    id: "reservation",
    reservedAt: new Date(),
  });
  mocks.settle.mockResolvedValue(undefined);
  mocks.sendMail.mockResolvedValue({
    accepted: ["admin@example.com"],
    messageId: "message",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("transit submissions", () => {
  it("requires a verified email and passes the normalized request to storage", async () => {
    const response = await POST(
      request({ url: " https://ai.lowpriceradar.com/#pricing " }),
    );
    expect(response.status).toBe(200);
    expect(mocks.createSubmission).toHaveBeenCalledWith({
      verificationId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
      email: "owner@example.com",
      websiteUrl: "https://ai.lowpriceradar.com/",
      description: "An AI API gateway.",
      ipAddress: "192.0.2.1",
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        text: expect.stringContaining("申请邮箱：owner@example.com"),
      }),
    );
  });

  it("returns the configured contact for an existing website", async () => {
    mocks.createSubmission.mockResolvedValue("duplicate");
    const response = await POST(
      request({ url: "https://ai.lowpriceradar.com/docs" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: "duplicate",
      contact: "admin@example.com",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limited", 429, "rate_limited"],
    ["verification_required", 400, "verification_required"],
  ] as const)("maps %s storage results", async (result, status, code) => {
    mocks.createSubmission.mockResolvedValue(result);
    const response = await POST(
      request({ url: "https://ai.lowpriceradar.com" }),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each(["", "x".repeat(161), "two\nlines"])(
    "rejects invalid descriptions",
    async (description) => {
      expect(
        (
          await POST(
            request({ url: "https://ai.lowpriceradar.com", description }),
          )
        ).status,
      ).toBe(400);
      expect(mocks.createSubmission).not.toHaveBeenCalled();
    },
  );

  it.each([
    "javascript:alert(1)",
    "https://user:pass@host.com",
    "http://127.0.0.1",
    "http://[::1]",
    "https://localhost",
    "invalid",
    "https://host.internal",
  ])("rejects invalid/private input %s", async (url) => {
    expect((await POST(request({ url }))).status).toBe(400);
    expect(mocks.createSubmission).not.toHaveBeenCalled();
  });

  it("rejects missing verification data, oversized bodies and cross-origin posts", async () => {
    expect(
      (
        await POST(
          new NextRequest("https://lowpriceradar.com/api/transit/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://valid.example.org" }),
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ url: "x".repeat(9000) }))).status).toBe(400);
    expect(
      (
        await POST(
          request(
            { url: "https://ai.lowpriceradar.com" },
            "https://elsewhere.com",
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("keeps a persisted submission successful when admin notification is unavailable", async () => {
    mocks.configured.mockReturnValue(false);
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com" }))).status,
    ).toBe(200);
    mocks.configured.mockReturnValue(true);
    mocks.sendMail.mockRejectedValueOnce(new Error("SMTP failure"));
    const response = await POST(
      request({ url: "https://other.lowpriceradar.com" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "submitted" });
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
  });
});
