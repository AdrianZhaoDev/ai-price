// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashEmail, hashToken } from "@/lib/security/tokens";

const database = vi.hoisted(() => ({
  delete: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: () => database,
  isDatabaseConfigured: () => true,
}));

import {
  confirmTransitSubmissionVerification,
  createTransitSubmission,
  createTransitSubmissionVerification,
  deleteTransitSubmissionVerification,
} from "@/lib/transit/submissions";

const now = new Date("2026-09-09T00:00:00Z");
const email = "owner@example.com";
const verificationId = "8590b2da-8047-4b95-8ef3-00cf745a172b";

function resolvedWhere(value: unknown = undefined) {
  return { where: vi.fn().mockResolvedValue(value) };
}

function verificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: verificationId,
    emailHash: hashEmail(email),
    codeHash: hashToken(`${verificationId}:123456`, "s".repeat(32)),
    attempts: 0,
    expiresAt: new Date(now.getTime() + 60_000),
    verifiedAt: null,
    consumedAt: null,
    createdAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EMAIL_TOKEN_SECRET", "s".repeat(32));
});

afterEach(() => vi.unstubAllEnvs());

describe("transit submission PostgreSQL paths", () => {
  it("creates and deletes a hashed verification record", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    database.delete.mockReturnValue({ where: deleteWhere });
    database.insert.mockReturnValue({ values: insertValues });

    const id = await createTransitSubmissionVerification({
      email,
      code: "123456",
      now,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        emailHash: hashEmail(email),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      }),
    );
    expect(JSON.stringify(insertValues.mock.calls)).not.toContain("123456");

    database.delete.mockReturnValue(resolvedWhere());
    await deleteTransitSubmissionVerification(id);
    expect(database.delete).toHaveBeenCalledTimes(2);
  });

  it("verifies a valid code and increments its attempt count", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: vi.fn().mockResolvedValue([verificationRow()]),
            }),
          }),
        }),
      })),
      update: vi.fn(() => ({ set: updateSet })),
    };
    database.transaction.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    expect(
      await confirmTransitSubmissionVerification({
        id: verificationId,
        email,
        code: "123456",
        now,
      }),
    ).toBe(true);
    expect(updateSet).toHaveBeenCalledWith({ attempts: 1, verifiedAt: now });
  });

  it.each([
    ["missing", undefined],
    ["different email", { emailHash: hashEmail("other@example.com") }],
    ["expired", { expiresAt: now }],
    ["consumed", { consumedAt: now }],
    ["attempt limit", { attempts: 5 }],
  ] as const)("rejects a verification row that is %s", async (_, overrides) => {
    const row = overrides ? verificationRow(overrides) : undefined;
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: vi.fn().mockResolvedValue(row ? [row] : []),
            }),
          }),
        }),
      })),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );
    expect(
      await confirmTransitSubmissionVerification({
        id: verificationId,
        email,
        code: "123456",
        now,
      }),
    ).toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate", [{ id: "submission" }], 0, []],
    ["rate_limited", [], 5, []],
    ["verification_required", [], 0, []],
    ["submitted", [], 0, [{ id: verificationId }]],
  ] as const)(
    "returns %s from its concurrency-safe submission transaction",
    async (expected, existing, count, verification) => {
      const select = vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: vi.fn().mockResolvedValue(existing) }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: vi.fn().mockResolvedValue([{ count }]),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: vi.fn().mockResolvedValue(verification),
              }),
            }),
          }),
        });
      const insertValues = vi.fn().mockResolvedValue(undefined);
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select,
        delete: vi.fn(() => resolvedWhere()),
        insert: vi.fn(() => ({ values: insertValues })),
        update: vi.fn(() => ({
          set: () => resolvedWhere(),
        })),
      };
      database.transaction.mockImplementation(
        async (callback: (value: unknown) => unknown) => callback(tx),
      );

      expect(
        await createTransitSubmission({
          verificationId,
          email,
          websiteUrl: "https://www.example.com/docs",
          description: "Example",
          ipAddress: "192.0.2.10",
          now,
        }),
      ).toBe(expected);
      if (expected === "submitted") {
        expect(insertValues).toHaveBeenCalledTimes(2);
        expect(tx.update).toHaveBeenCalled();
      }
    },
  );
});
