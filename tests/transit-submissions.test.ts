// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/transit/submissions/route";
import { clearRateLimitsForTests } from "@/lib/security/rate-limit";
import { clearTransitSubmissionAttemptsForTests } from "@/lib/security/transit-submission-rate-limit";
let clientNumber = 0;
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  sent: vi.fn(),
  configured: vi.fn(),
}));
vi.mock("@/lib/email/transport", () => ({
  isSmtpConfigured: mocks.configured,
  getEmailTransport: () => ({ sendMail: mocks.sendMail }),
}));
vi.mock("@/lib/email/delivery", () => ({
  reserveEmailDelivery: mocks.reserve,
  settleEmailDelivery: mocks.settle,
  isEmailDeliverySent: mocks.sent,
}));
function request(
  body: Record<string, unknown>,
  origin = "https://lowpriceradar.com",
) {
  return new NextRequest("https://lowpriceradar.com/api/transit/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "x-real-ip": `192.0.2.${++clientNumber}`,
    },
    body: JSON.stringify({ description: "An AI API gateway.", ...body }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  clearRateLimitsForTests();
  clearTransitSubmissionAttemptsForTests();
  clientNumber = 0;
  vi.stubEnv("APP_URL", "https://lowpriceradar.com");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  mocks.configured.mockReturnValue(true);
  mocks.settle.mockResolvedValue(undefined);
  mocks.reserve.mockResolvedValue({
    id: "reservation",
    reservedAt: new Date(),
  });
  mocks.sendMail.mockResolvedValue({
    accepted: ["admin@example.com"],
    messageId: "message",
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("transit submissions", () => {
  it("does not consume the shared budget with malformed posts and limits each client", async () => {
    for (let i = 0; i < 25; i++)
      expect((await POST(request({ url: "invalid" }))).status).toBe(400);
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com/" }))).status,
    ).toBe(200);
    for (let i = 0; i < 10; i++) {
      const invalid = request({ url: "invalid" });
      invalid.headers.set("x-real-ip", "192.0.2.200");
      expect((await POST(invalid)).status).toBe(400);
    }
    const limited = request({ url: "invalid" });
    limited.headers.set("x-real-ip", "192.0.2.200");
    expect((await POST(limited)).status).toBe(429);
  });
  it("accepts equivalent loopback origins only outside production with matching scheme and port", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3100");
    vi.stubEnv("NODE_ENV", "development");
    expect(
      (
        await POST(
          request(
            { url: "https://ai.lowpriceradar.com" },
            "http://127.0.0.1:3100",
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          request(
            { url: "https://ai.lowpriceradar.com" },
            "http://127.0.0.1:3101",
          ),
        )
      ).status,
    ).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    expect(
      (
        await POST(
          request(
            { url: "https://ai.lowpriceradar.com" },
            "http://127.0.0.1:3100",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("accepts a URL and introduction and sends them as text for review", async () => {
    expect(
      (await POST(request({ url: " https://ai.lowpriceradar.com/ " }))).status,
    ).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        text: expect.stringContaining("https://ai.lowpriceradar.com/"),
      }),
    );
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "sent" }),
    );
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
      expect(mocks.sendMail).not.toHaveBeenCalled();
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
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it("rejects extra fields, oversized bodies and cross-origin posts", async () => {
    expect(
      (
        await POST(
          request({ url: "https://ai.lowpriceradar.com", name: "extra" }),
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
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it("does not claim success for failed or unconfigured delivery", async () => {
    mocks.sendMail.mockRejectedValueOnce(new Error("SMTP failure"));
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com" }))).status,
    ).toBe(503);
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
    mocks.configured.mockReturnValue(false);
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com" }))).status,
    ).toBe(503);
  });
  it("deduplicates successful submissions but lets pending deliveries be retried", async () => {
    mocks.reserve.mockResolvedValue(null);
    mocks.sent.mockResolvedValue(true);
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com" }))).status,
    ).toBe(200);
    mocks.sent.mockResolvedValue(false);
    expect(
      (await POST(request({ url: "https://ai.lowpriceradar.com" }))).status,
    ).toBe(503);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it("bounds total submission traffic", async () => {
    for (let i = 0; i < 20; i++)
      await POST(request({ url: "https://ai.lowpriceradar.com" }));
    const response = await POST(
      request({ url: "https://ai.lowpriceradar.com" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.sendMail).toHaveBeenCalledTimes(20);
  });
});
