import { describe, expect, it } from "vitest";
import {
  adminAlertEmail,
  confirmationEmail,
  escapeHtml,
  priceChangeEmail,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("escapes HTML and blocks unsafe link protocols", () => {
    expect(escapeHtml(`<tag a="1">&'</tag>`)).toBe(
      "&lt;tag a=&quot;1&quot;&gt;&amp;&#39;&lt;/tag&gt;",
    );
    const message = confirmationEmail({
      scopeLabel: "<script>alert(1)</script>",
      confirmUrl: "javascript:alert(1)",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain('href="#"');
    expect(message.subject).toContain("<script>");
    expect(
      confirmationEmail({
        scopeLabel: "Plan",
        confirmUrl: "not a url",
        unsubscribeUrl: "ftp://example.com/file",
      }).html.match(/href="#"/g),
    ).toHaveLength(2);
  });

  it("renders price changes and admin alerts", () => {
    const change = priceChangeEmail({
      scopeLabel: "ChatGPT Plus",
      changes: [
        {
          region: "美国",
          previousPrice: "$19.99",
          currentPrice: "$21.99",
          previousCny: 140,
          currentCny: 154,
        },
      ],
      topThree: [
        {
          rank: 1,
          region: "土耳其",
          displayPrice: "₺499",
          convertedCny: 71.5,
          sourceUrl: "https://apps.apple.com/example",
        },
      ],
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(change.text).toContain("$19.99 (¥140.00) → $21.99");
    expect(change.html).toContain("当前最低三档");

    const alert = adminAlertEmail({
      sourceName: "Source",
      errorCode: "PARSE",
      message: "<broken>",
      occurredAt: "2026-07-23",
    });
    expect(alert.subject).toContain("采集异常");
    expect(alert.html).toContain("&lt;broken&gt;");
  });
});
