import { beforeEach, expect, it } from "vitest";
import {
  allowTransitSubmissionAttempt,
  clearTransitSubmissionAttemptsForTests,
} from "@/lib/security/transit-submission-rate-limit";
beforeEach(clearTransitSubmissionAttemptsForTests);
it("expires each client's attempt window", () => {
  for (let i = 0; i < 10; i++)
    expect(allowTransitSubmissionAttempt("a", 0)).toBe(true);
  expect(allowTransitSubmissionAttempt("a", 1)).toBe(false);
  expect(allowTransitSubmissionAttempt("b", 1)).toBe(true);
  expect(allowTransitSubmissionAttempt("a", 600000)).toBe(true);
});
it("bounds address storage and reclaims expired entries", () => {
  for (let i = 0; i < 1000; i++)
    expect(allowTransitSubmissionAttempt(String(i), 0)).toBe(true);
  expect(allowTransitSubmissionAttempt("overflow", 1)).toBe(false);
  expect(allowTransitSubmissionAttempt("overflow", 600000)).toBe(true);
});
