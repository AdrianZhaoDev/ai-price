import { describe, expect, it } from "vitest";
import { resolveCollectionTrigger } from "@/lib/collectors/trigger";

describe("collection trigger", () => {
  it("marks only the explicit timer argument as scheduled", () => {
    expect(resolveCollectionTrigger(["--trigger=scheduled"], false)).toBe(
      "scheduled",
    );
    expect(resolveCollectionTrigger([], false)).toBe("manual");
    expect(resolveCollectionTrigger([], true)).toBe("github_actions");
  });

  it("rejects unsupported trigger labels", () => {
    expect(() => resolveCollectionTrigger(["--trigger=manual"], false)).toThrow(
      "Unsupported collection trigger",
    );
  });
});
