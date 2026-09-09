// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ configured: false }));
const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: () => database,
  isDatabaseConfigured: () => state.configured,
}));

import {
  isEmailDeliverySent,
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";

const now = new Date("2026-09-09T00:00:00Z");

function reservationTransaction(input: {
  inserted?: boolean;
  existing?: {
    id: string;
    status: string;
    createdAt: Date;
  };
}) {
  const returning = vi
    .fn()
    .mockResolvedValue(input.inserted ? [{ id: "new-delivery" }] : []);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const tx = {
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning }),
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: vi
              .fn()
              .mockResolvedValue(input.existing ? [input.existing] : []),
          }),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: updateWhere }),
    })),
  };
  database.transaction.mockImplementation(
    async (callback: (value: unknown) => unknown) => callback(tx),
  );
  return { tx, updateWhere };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.configured = false;
  vi.setSystemTime(now);
});

describe("email delivery persistence", () => {
  it("uses a transient reservation when no database is configured", async () => {
    const reservation = await reserveEmailDelivery({
      type: "verification",
      recipient: "owner@example.com",
      dedupeKey: "verification:1",
    });
    expect(reservation?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reservation?.reservedAt).toEqual(now);
    await expect(isEmailDeliverySent("verification:1")).resolves.toBe(false);
    await expect(
      settleEmailDelivery(reservation!, { status: "sent" }),
    ).resolves.toBeUndefined();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("returns a newly inserted durable reservation", async () => {
    state.configured = true;
    reservationTransaction({ inserted: true });
    await expect(
      reserveEmailDelivery({
        type: "verification",
        recipient: "owner@example.com",
        dedupeKey: "verification:2",
      }),
    ).resolves.toEqual({ id: "new-delivery", reservedAt: now });
  });

  it.each([
    ["sent", now, false],
    ["sending", new Date(now.getTime() - 60_000), false],
    ["failed", now, true],
    ["sending", new Date(now.getTime() - 11 * 60_000), true],
  ] as const)(
    "handles an existing %s delivery",
    async (status, createdAt, reclaimable) => {
      state.configured = true;
      const { tx, updateWhere } = reservationTransaction({
        existing: { id: "existing", status, createdAt },
      });
      const result = await reserveEmailDelivery({
        type: "verification",
        recipient: "owner@example.com",
        dedupeKey: "verification:3",
      });
      expect(result).toEqual(
        reclaimable ? { id: "existing", reservedAt: now } : null,
      );
      expect(tx.update).toHaveBeenCalledTimes(reclaimable ? 1 : 0);
      expect(updateWhere).toHaveBeenCalledTimes(reclaimable ? 1 : 0);
    },
  );

  it("does not reclaim a vanished conflicting reservation", async () => {
    state.configured = true;
    reservationTransaction({});
    await expect(
      reserveEmailDelivery({
        type: "verification",
        recipient: "owner@example.com",
        dedupeKey: "verification:4",
      }),
    ).resolves.toBeNull();
  });

  it.each([
    ["sent", true],
    ["failed", false],
    [undefined, false],
  ] as const)("reads a %s delivery status", async (status, expected) => {
    state.configured = true;
    const limit = vi.fn().mockResolvedValue(status ? [{ status }] : []);
    database.select.mockReturnValue({
      from: () => ({ where: () => ({ limit }) }),
    });
    await expect(isEmailDeliverySent("verification:5")).resolves.toBe(expected);
  });

  it.each([
    ["sent", { providerMessageId: "message", sentAt: now }],
    ["failed", { error: "delivery failed", sentAt: null }],
  ] as const)("settles a %s reservation", async (status, expected) => {
    state.configured = true;
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    database.update.mockReturnValue({ set });
    await settleEmailDelivery(
      { id: "delivery", reservedAt: now },
      {
        status,
        ...(status === "sent"
          ? { providerMessageId: "message" }
          : { error: "delivery failed" }),
      },
    );
    expect(set).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(where).toHaveBeenCalled();
  });
});
