// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearRateLimitsForTests } from "@/lib/security/rate-limit";

const mocks = vi.hoisted(() => ({
  createCode: vi.fn(() => "123456"),
  createVerification: vi.fn(),
  deleteVerification: vi.fn(),
  confirmVerification: vi.fn(),
  sendMail: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  configured: vi.fn(),
}));

vi.mock("@/lib/transit/submissions", () => ({
  createTransitSubmissionCode: mocks.createCode,
  createTransitSubmissionVerification: mocks.createVerification,
  deleteTransitSubmissionVerification: mocks.deleteVerification,
  confirmTransitSubmissionVerification: mocks.confirmVerification,
}));
vi.mock("@/lib/email/transport", () => ({
  isSmtpConfigured: mocks.configured,
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
}));
vi.mock("@/lib/email/delivery", () => ({
  reserveEmailDelivery: mocks.reserve,
  settleEmailDelivery: mocks.settle,
}));

import { POST, PUT } from "@/app/api/transit/submissions/verification/route";

function request(method: "POST" | "PUT", body: Record<string, unknown>) {
  return new NextRequest(
    "https://lowpriceradar.com/api/transit/submissions/verification",
    {
      method,
      headers: {
        "Content-Type": "application/json",
        origin: "https://lowpriceradar.com",
        "x-real-ip": "192.0.2.10",
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  clearRateLimitsForTests();
  vi.stubEnv("APP_URL", "https://lowpriceradar.com");
  mocks.configured.mockReturnValue(true);
  mocks.createVerification.mockResolvedValue(
    "8590b2da-8047-4b95-8ef3-00cf745a172b",
  );
  mocks.deleteVerification.mockResolvedValue(undefined);
  mocks.confirmVerification.mockResolvedValue(true);
  mocks.reserve.mockResolvedValue({
    id: "reservation",
    reservedAt: new Date(),
  });
  mocks.settle.mockResolvedValue(undefined);
  mocks.sendMail.mockResolvedValue({
    accepted: ["owner@example.com"],
    messageId: "message",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("transit submission email verification", () => {
  it("sends a six-digit code without storing it in the response", async () => {
    const response = await POST(
      request("POST", { email: " Owner@Example.com ", locale: "zh-CN" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: "code_sent",
      verificationId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
    });
    expect(mocks.createVerification).toHaveBeenCalledWith({
      email: "owner@example.com",
      code: "123456",
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        text: expect.stringContaining("123456"),
      }),
    );
  });

  it("confirms the code against its email and challenge", async () => {
    const response = await PUT(
      request("PUT", {
        email: "owner@example.com",
        verificationId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
        code: "123456",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.confirmVerification).toHaveBeenCalledWith({
      id: "8590b2da-8047-4b95-8ef3-00cf745a172b",
      email: "owner@example.com",
      code: "123456",
    });
    mocks.confirmVerification.mockResolvedValue(false);
    expect(
      (
        await PUT(
          request("PUT", {
            email: "owner@example.com",
            verificationId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
            code: "654321",
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("limits code delivery per IP and email", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect(
        (
          await POST(
            request("POST", { email: "owner@example.com", locale: "en" }),
          )
        ).status,
      ).toBe(200);
    }
    const response = await POST(
      request("POST", { email: "owner@example.com", locale: "en" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects invalid requests and removes a challenge after delivery failure", async () => {
    expect(
      (await POST(request("POST", { email: "bad", locale: "en" }))).status,
    ).toBe(400);
    mocks.sendMail.mockRejectedValueOnce(new Error("SMTP failure"));
    expect(
      (
        await POST(
          request("POST", { email: "owner@example.com", locale: "en" }),
        )
      ).status,
    ).toBe(503);
    expect(mocks.deleteVerification).toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
  });
});
