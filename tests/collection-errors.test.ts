import { describe, expect, it } from "vitest";
import { summarizeCollectionError } from "@/lib/public-data/collection-errors";

describe("public collection error summaries", () => {
  it("exposes safe database fields from a wrapped driver error", () => {
    expect(
      summarizeCollectionError({
        name: "Error",
        cause: {
          name: "PostgresError",
          code: "42501",
          table_name: "transit_offers",
          constraint_name: "transit_offers_generation_id_fkey",
          message: "permission denied for table transit_offers",
        },
      }),
    ).toEqual({
      kind: "database",
      name: "Error",
      code: "42501",
      table: "transit_offers",
      constraint: "transit_offers_generation_id_fkey",
    });
  });

  it("classifies safe application gates without exposing dynamic text", () => {
    expect(
      summarizeCollectionError({
        name: "Error",
        message:
          "Price anomaly exceeds the 50% change limit for model secret-value.",
      }),
    ).toEqual({
      kind: "application",
      name: "Error",
      reason: "price-stability-gate",
    });
  });

  it("does not copy raw messages or arbitrary identifiers", () => {
    expect(
      summarizeCollectionError({
        name: "Error",
        cause: {
          name: "PostgresError",
          code: "42601",
          detail: "postgres://user:password@example.invalid",
          table: "transit-offers;drop",
        },
      }),
    ).toEqual({ kind: "database", name: "Error", code: "42601" });
  });

  it("keeps upstream network errors out of the database category", () => {
    expect(
      summarizeCollectionError({
        name: "TypeError",
        cause: { code: "ENOTFOUND" },
      }),
    ).toEqual({ kind: "network", name: "TypeError", code: "ENOTFOUND" });
  });

  it("classifies reviewed direct-source integrity guards", () => {
    expect(
      summarizeCollectionError({
        name: "Error",
        message: "Source endpoint changed; review required.",
      }),
    ).toEqual({
      kind: "application",
      name: "Error",
      reason: "source-endpoint-guard",
    });
  });

  it("classifies fixed source-request and offer-overlap guards", () => {
    expect(
      summarizeCollectionError({
        name: "Error",
        message: "Snapshot request failed.",
      }),
    ).toEqual({
      kind: "network",
      name: "Error",
      reason: "source-request",
    });
    expect(
      summarizeCollectionError({
        name: "Error",
        message:
          "Offer identity overlap collapsed; previous snapshot retained for review.",
      }),
    ).toEqual({
      kind: "application",
      name: "Error",
      reason: "offer-integrity-gate",
    });
  });

  it("classifies timeouts, oversized snapshots, and malformed JSON", () => {
    expect(summarizeCollectionError({ name: "TimeoutError" })).toEqual({
      kind: "network",
      name: "TimeoutError",
      reason: "source-timeout",
    });
    for (const message of [
      "Snapshot exceeds the response size limit.",
      "Snapshot file is too large.",
    ]) {
      expect(summarizeCollectionError({ name: "Error", message })).toEqual({
        kind: "application",
        name: "Error",
        reason: "snapshot-size-gate",
      });
    }
    expect(
      summarizeCollectionError({
        name: "SyntaxError",
        message: "Unexpected end of JSON input",
      }),
    ).toEqual({
      kind: "schema",
      name: "SyntaxError",
      reason: "malformed-json",
    });
  });

  it("classifies remaining source, bulk, and startup guards", () => {
    for (const message of [
      "Incomplete original merchant catalogue.",
      "Original currency precision changed.",
      "Original currency declaration changed.",
      "Reviewed merchant SKU changed; review required.",
    ]) {
      expect(summarizeCollectionError({ name: "Error", message })).toEqual({
        kind: "application",
        name: "Error",
        reason: "source-integrity-guard",
      });
    }
    for (const message of [
      "Bulk price currency changed; previous snapshot retained for review.",
      "Bulk tier identity overlap collapsed; previous snapshot retained for review.",
    ]) {
      expect(summarizeCollectionError({ name: "Error", message })).toEqual({
        kind: "application",
        name: "Error",
        reason: "channel-integrity-gate",
      });
    }
    for (const message of [
      "PUBLIC_DATA_DATABASE_URL is required for public-data collection.",
      "--domain must be channels, transit, or all.",
      "At least one public snapshot URL/file must be configured for the requested domain.",
    ]) {
      expect(summarizeCollectionError({ name: "Error", message })).toEqual({
        kind: "configuration",
        name: "Error",
        reason: "configuration",
      });
    }
  });

  it("classifies resolver, source-selection, and local-file failures", () => {
    expect(
      summarizeCollectionError({ name: "Error", code: "EAI_AGAIN" }),
    ).toEqual({ kind: "network", name: "Error", code: "EAI_AGAIN" });
    for (const code of ["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
      expect(summarizeCollectionError({ name: "TypeError", code })).toEqual({
        kind: "network",
        name: "TypeError",
        code,
      });
    }
    for (const message of [
      "Select unique reviewed direct source IDs.",
      "Unknown direct source ID.",
    ]) {
      expect(summarizeCollectionError({ name: "Error", message })).toEqual({
        kind: "configuration",
        name: "Error",
        reason: "configuration",
      });
    }
    expect(summarizeCollectionError({ name: "Error", code: "ENOENT" })).toEqual(
      {
        kind: "configuration",
        name: "Error",
        code: "ENOENT",
        reason: "snapshot-file",
      },
    );
    expect(
      summarizeCollectionError({
        name: "TypeError",
        cause: { name: "Error", message: "unexpected redirect" },
      }),
    ).toEqual({
      kind: "network",
      name: "TypeError",
      reason: "source-request",
    });
    expect(summarizeCollectionError({ name: "Error", code: "EMFILE" })).toEqual(
      {
        kind: "runtime",
        name: "Error",
        code: "EMFILE",
        reason: "resource-exhaustion",
      },
    );
  });
});
