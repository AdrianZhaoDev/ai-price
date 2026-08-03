import { describe, expect, it } from "vitest";
import { groupEmailRecipients } from "@/lib/alerts/notifier";

describe("alert recipient grouping", () => {
  it("preserves all subscription ids when one email matches several scopes", () => {
    expect(
      groupEmailRecipients([
        { email: "Reader@Example.com", subscriptionId: "broad" },
        { email: "reader@example.com", subscriptionId: "exact" },
        { email: "other@example.com", subscriptionId: "other" },
      ]),
    ).toEqual([
      {
        email: "Reader@Example.com",
        subscriptionId: "broad",
        subscriptionIds: ["broad", "exact"],
      },
      {
        email: "other@example.com",
        subscriptionId: "other",
        subscriptionIds: ["other"],
      },
    ]);
  });
});
