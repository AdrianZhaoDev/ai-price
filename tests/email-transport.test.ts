// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTransport = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import {
  getEmailTransport,
  isSmtpConfigured,
  resetEmailTransportForTests,
  verifyEmailTransport,
} from "@/lib/email/transport";

function configureSmtp() {
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "user@example.com");
  vi.stubEnv("SMTP_PASSWORD", "secret");
  vi.stubEnv("SMTP_FROM", "Low Price Radar <user@example.com>");
}

beforeEach(() => {
  vi.resetAllMocks();
  resetEmailTransportForTests();
});

afterEach(() => vi.unstubAllEnvs());

describe("email transport", () => {
  it("requires every SMTP setting", () => {
    expect(isSmtpConfigured()).toBe(false);
    configureSmtp();
    expect(isSmtpConfigured()).toBe(true);
    vi.stubEnv("SMTP_PASSWORD", "");
    expect(isSmtpConfigured()).toBe(false);
  });

  it.each([
    ["465", undefined, true],
    ["587", undefined, false],
    ["465", "false", false],
    ["587", "true", true],
  ] as const)(
    "creates a cached SMTP transport for port %s and secure=%s",
    (port, secureSetting, secure) => {
      configureSmtp();
      vi.stubEnv("SMTP_PORT", port);
      vi.stubEnv("SMTP_SECURE", secureSetting);
      const transport = { verify: vi.fn() };
      createTransport.mockReturnValue(transport);
      expect(getEmailTransport()).toBe(transport);
      expect(getEmailTransport()).toBe(transport);
      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.example.com",
          port: Number(port),
          secure,
          auth: { user: "user@example.com", pass: "secret" },
        }),
      );
    },
  );

  it("uses a JSON transport outside production when SMTP is absent", () => {
    vi.stubEnv("NODE_ENV", "test");
    const transport = { verify: vi.fn() };
    createTransport.mockReturnValue(transport);
    expect(getEmailTransport()).toBe(transport);
    expect(createTransport).toHaveBeenCalledWith({ jsonTransport: true });
  });

  it("rejects an unconfigured production transport", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getEmailTransport()).toThrow("SMTP is not configured");
  });

  it("verifies only a configured transport", async () => {
    await expect(verifyEmailTransport()).resolves.toBe(false);
    configureSmtp();
    const verify = vi.fn().mockResolvedValue(true);
    createTransport.mockReturnValue({ verify });
    await expect(verifyEmailTransport()).resolves.toBe(true);
    expect(verify).toHaveBeenCalledOnce();
  });
});
