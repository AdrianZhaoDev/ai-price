import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReadDatabaseTarget,
  getReadDatabaseUrl,
  getWriteDatabaseTarget,
  getWriteDatabaseUrl,
  isDatabaseConfigured,
  isReadDatabaseConfigured,
} from "@/lib/db/client";

describe("database targets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults both read and write to DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/db");

    expect(getReadDatabaseTarget()).toBe("local");
    expect(getWriteDatabaseTarget()).toBe("local");
    expect(getReadDatabaseUrl()).toBe("postgresql://local/db");
    expect(getWriteDatabaseUrl()).toBe("postgresql://local/db");
    expect(isReadDatabaseConfigured()).toBe(true);
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("can read remotely while writing locally", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/db");
    vi.stubEnv("DATA_SYNC_TARGET_URL", "postgresql://remote/db");
    vi.stubEnv("DATABASE_READ_TARGET", "remote");
    vi.stubEnv("DATABASE_WRITE_TARGET", "local");

    expect(getReadDatabaseUrl()).toBe("postgresql://remote/db");
    expect(getWriteDatabaseUrl()).toBe("postgresql://local/db");
  });

  it("rejects unsupported targets", () => {
    vi.stubEnv("DATABASE_READ_TARGET", "replica");
    expect(() => getReadDatabaseUrl()).toThrow(/DATABASE_READ_TARGET/);
  });
});
