import { describe, expect, it } from "vitest";
import {
  COLLECTION_ALERT_OPEN_ERROR_HOURS,
  shouldEscalateCollectionFailure,
} from "@/lib/collectors/alert-policy";

const now = new Date("2026-08-03T12:00:00.000Z");

describe("collection alert policy", () => {
  it("escalates after two consecutive scheduled failures", () => {
    expect(
      shouldEscalateCollectionFailure({
        alreadyAlerted: false,
        consecutiveScheduledFailures: 2,
        oldestOpenErrorAt: new Date("2026-08-03T11:00:00.000Z"),
        now,
      }),
    ).toBe(true);
  });

  it("escalates an open error at the eight-hour boundary", () => {
    expect(
      shouldEscalateCollectionFailure({
        alreadyAlerted: false,
        consecutiveScheduledFailures: 1,
        oldestOpenErrorAt: new Date(
          now.getTime() - COLLECTION_ALERT_OPEN_ERROR_HOURS * 60 * 60 * 1_000,
        ),
        now,
      }),
    ).toBe(true);
  });

  it("does not escalate a single fresh failure", () => {
    expect(
      shouldEscalateCollectionFailure({
        alreadyAlerted: false,
        consecutiveScheduledFailures: 1,
        oldestOpenErrorAt: new Date("2026-08-03T11:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });

  it("does not repeat an alert for an open incident", () => {
    expect(
      shouldEscalateCollectionFailure({
        alreadyAlerted: true,
        consecutiveScheduledFailures: 4,
        oldestOpenErrorAt: new Date("2026-08-02T00:00:00.000Z"),
        now,
      }),
    ).toBe(false);
  });
});
