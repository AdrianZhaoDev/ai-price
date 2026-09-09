// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  database: {} as Record<string, ReturnType<typeof vi.fn>>,
  writeConfigured: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDatabase: () => databaseMocks.database,
  isDatabaseConfigured: databaseMocks.writeConfigured,
}));

import {
  createTransitDirectoryEntry,
  defaultTransitDirectoryEntries,
  listAdminTransitDirectoryEntries,
  listAdminTransitSubmissions,
  listPublicTransitDirectoryEntries,
  reviewTransitSubmission,
  updateTransitDirectoryEntry,
} from "@/lib/transit/directory";

const input = {
  name: "Example API",
  websiteUrl: "https://www.example.org/docs",
  descriptionZh: "示例服务。",
  descriptionEn: "Example service.",
  rank: 40,
  published: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  databaseMocks.database = {};
});

describe("transit directory repository", () => {
  it("uses the built-in directory when no write database is configured", async () => {
    databaseMocks.writeConfigured.mockReturnValue(false);
    expect(await listPublicTransitDirectoryEntries()).toEqual(
      defaultTransitDirectoryEntries,
    );
  });

  it("renders the read-only admin fixture when no write database is configured", async () => {
    databaseMocks.writeConfigured.mockReturnValue(false);
    expect(await listAdminTransitDirectoryEntries()).toEqual(
      defaultTransitDirectoryEntries,
    );
    expect(await listAdminTransitSubmissions()).toEqual([]);
  });

  it("reads only published entries in rank order", async () => {
    databaseMocks.writeConfigured.mockReturnValue(true);
    const orderBy = vi.fn().mockResolvedValue([input]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    databaseMocks.database.select = vi.fn(() => ({ from }));
    expect(await listPublicTransitDirectoryEntries()).toEqual([input]);
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("creates and updates editable directory rows", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    databaseMocks.database.insert = vi.fn(() => ({ values }));
    await createTransitDirectoryEntry(input);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ websiteKey: "example.org", rank: 40 }),
    );

    const returning = vi.fn().mockResolvedValue([{ id: "entry" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    databaseMocks.database.update = vi.fn(() => ({ set }));
    expect(await updateTransitDirectoryEntry("entry", input)).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ websiteKey: "example.org" }),
    );
  });

  it("approves a submission by creating its directory row", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: vi
                .fn()
                .mockResolvedValue([
                  { id: "8590b2da-8047-4b95-8ef3-00cf745a172b" },
                ]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select,
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
    };
    databaseMocks.database.transaction = vi.fn(
      async (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    expect(
      await reviewTransitSubmission(
        "8590b2da-8047-4b95-8ef3-00cf745a172b",
        "approved",
        input,
      ),
    ).toBe(true);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSubmissionId: "8590b2da-8047-4b95-8ef3-00cf745a172b",
        websiteKey: "example.org",
      }),
    );
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("unpublishes the linked directory row when rejecting an approval", async () => {
    const updateSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: vi
                .fn()
                .mockResolvedValue([
                  { id: "8590b2da-8047-4b95-8ef3-00cf745a172b" },
                ]),
            }),
          }),
        }),
      })),
      update: vi.fn(() => ({ set: updateSet })),
    };
    databaseMocks.database.transaction = vi.fn(
      async (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    expect(
      await reviewTransitSubmission(
        "8590b2da-8047-4b95-8ef3-00cf745a172b",
        "rejected",
      ),
    ).toBe(true);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ published: false }),
    );
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});
