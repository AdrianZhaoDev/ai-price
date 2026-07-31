import { describe, expect, it } from "vitest";
import {
  adminAlertEmail,
  apiRankingChangeEmail,
  escapeHtml,
  priceChangeEmail,
  subscriptionCreatedEmail,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("escapes HTML and blocks unsafe link protocols", () => {
    expect(escapeHtml(`<tag a="1">&'</tag>`)).toBe(
      "&lt;tag a=&quot;1&quot;&gt;&amp;&#39;&lt;/tag&gt;",
    );
    const message = subscriptionCreatedEmail({
      scopeLabel: "<script>alert(1)</script>",
      viewUrl: "https://example.com/pricing",
      ctaLabel: "查看价格",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("取消订阅");
    expect(message.html).not.toContain("确认订阅");
    expect(message.subject).toContain("<script>");
    const unsafeLinkMessage = subscriptionCreatedEmail({
      scopeLabel: "Plan",
      viewUrl: "https://example.com/pricing",
      ctaLabel: "查看价格",
      unsubscribeUrl: "ftp://example.com/file",
    });
    expect(unsafeLinkMessage.html.match(/href="#"/g)).toHaveLength(1);
    expect(unsafeLinkMessage.text).not.toContain("ftp://");
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
          changePercent: 10,
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
      viewUrl: "https://example.com/pricing",
      ctaLabel: "看看还有更便宜的吗？",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(change.text).toContain("$19.99 (¥140.00) → $21.99");
    expect(change.html).toContain("当前最低三档");
    expect(change.subject).toBe("ChatGPT Plus 涨价了！");

    const ranking = apiRankingChangeEmail({
      subject: "Model A 更便宜了！",
      tables: [
        {
          metric: "input",
          label: "非缓存输入",
          rows: [
            {
              rank: 1,
              providerName: "Provider",
              modelName: "Model A",
              displayPrice: "¥1 / 百万 tokens",
              priceCny: 1,
              previousRank: 6,
              previousDisplayPrice: "¥2 / 百万 tokens",
              rankDelta: 5,
              priceDirection: "decrease",
              isNew: false,
            },
          ],
        },
      ],
      viewUrl: "https://example.com/api-pricing#api-ranking",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(ranking.subject).toBe("Model A 更便宜了！");
    expect(ranking.html).toContain("↑5 · 降价");
    expect(ranking.text).toContain("查看完整榜单");

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
