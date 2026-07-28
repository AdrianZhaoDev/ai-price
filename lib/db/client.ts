import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTarget = "local" | "remote";

type DatabaseConnection = {
  client: Sql;
  database: Database;
};

const connections = new Map<string, DatabaseConnection>();

function configuredTarget(
  variableName: "DATABASE_READ_TARGET" | "DATABASE_WRITE_TARGET",
): DatabaseTarget {
  const value = process.env[variableName]?.trim().toLowerCase() || "local";
  if (value === "local" || value === "remote") return value;
  throw new Error(`${variableName} must be "local" or "remote".`);
}

export function databaseUrlForTarget(
  target: DatabaseTarget,
): string | undefined {
  if (target === "local") {
    return process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
  }
  return process.env.REMOTE_DATABASE_URL ?? process.env.DATA_SYNC_TARGET_URL;
}

export function getReadDatabaseTarget(): DatabaseTarget {
  return configuredTarget("DATABASE_READ_TARGET");
}

export function getWriteDatabaseTarget(): DatabaseTarget {
  return configuredTarget("DATABASE_WRITE_TARGET");
}

export function getReadDatabaseUrl(): string | undefined {
  return databaseUrlForTarget(getReadDatabaseTarget());
}

export function getWriteDatabaseUrl(): string | undefined {
  return databaseUrlForTarget(getWriteDatabaseTarget());
}

export function isReadDatabaseConfigured(): boolean {
  return Boolean(getReadDatabaseUrl());
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getWriteDatabaseUrl());
}

export function createDatabaseConnection(
  url: string,
  maxConnections = 5,
): DatabaseConnection {
  const client = postgres(url, {
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return {
    client,
    database: drizzle(client, { schema }),
  };
}

function databaseForUrl(url: string): Database {
  let connection = connections.get(url);
  if (!connection) {
    connection = createDatabaseConnection(url);
    connections.set(url, connection);
  }
  return connection.database;
}

export function getReadDatabase(): Database {
  const url = getReadDatabaseUrl();
  if (!url) {
    throw new Error(
      `${getReadDatabaseTarget()} read database is not configured.`,
    );
  }
  return databaseForUrl(url);
}

export function getDatabase(): Database {
  const url = getWriteDatabaseUrl();
  if (!url) {
    throw new Error(
      `${getWriteDatabaseTarget()} write database is not configured.`,
    );
  }
  return databaseForUrl(url);
}

export async function closeDatabase(): Promise<void> {
  const activeConnections = [...connections.values()];
  connections.clear();
  await Promise.all(
    activeConnections.map(({ client }) => client.end({ timeout: 5 })),
  );
}
