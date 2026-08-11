import { describe, expect, it } from "vitest";
import { groupEmailRecipients } from "@/lib/alerts/notifier";

describe("alert recipient grouping", () => {
  it("preserves all subscription ids when one email matches several scopes", () => {
    expect(
      groupEmailRecipients([
        {
          email: "Reader@Example.com",
          subscriptionId: "broad",
          locale: "zh-CN",
        },
        {
          email: "reader@example.com",
          subscriptionId: "exact",
          locale: "zh-CN",
        },
        {
          email: "other@example.com",
          subscriptionId: "other",
          locale: "zh-CN",
        },
      ]),
    ).toEqual([
      {
        email: "Reader@Example.com",
        subscriptionId: "broad",
        locale: "zh-CN",
        subscriptionIds: ["broad", "exact"],
      },
      {
        email: "other@example.com",
        subscriptionId: "other",
        locale: "zh-CN",
        subscriptionIds: ["other"],
      },
    ]);
  });

  it("keeps different locale preferences in separate deliveries", () => {
    expect(
      groupEmailRecipients([
        {
          email: "reader@example.com",
          subscriptionId: "zh",
          locale: "zh-CN",
        },
        {
          email: "reader@example.com",
          subscriptionId: "en",
          locale: "en",
        },
      ]),
    ).toHaveLength(2);
  });
});
