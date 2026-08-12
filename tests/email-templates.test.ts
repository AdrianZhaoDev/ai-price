import { describe, expect, it } from "vitest";
import {
  adminAlertEmail,
  apiRankingChangeEmail,
  escapeHtml,
  modelCatalogDigestEmail,
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
      removed: [
        {
          metricLabel: "输出",
          providerName: "Old Provider",
          modelName: "Old Model",
          previousRank: 4,
          previousDisplayPrice: "¥3 / 百万 tokens",
        },
      ],
      viewUrl: "https://example.com/api-pricing#api-ranking",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(ranking.subject).toBe("Model A 更便宜了！");
    expect(ranking.html).toContain("↑5 · 降价");
    expect(ranking.html).toContain("移出榜单");
    expect(ranking.html).toContain("Old Model");
    expect(ranking.text).toContain("输出 · Old Provider · Old Model");
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

  it("renders one deduplicated-style new-model digest without price-change copy", () => {
    const digest = modelCatalogDigestEmail({
      models: [
        {
          name: "Model <Next>",
          labName: "Example Lab",
          releaseDate: "2026-08-10",
          url: "https://example.com/models/lab/model-next",
        },
      ],
      catalogVersion: "a".repeat(40),
      viewUrl: "https://example.com/api-pricing",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(digest.subject).toContain("新增 1 个模型");
    expect(digest.html).toContain("Model &lt;Next&gt;");
    expect(digest.text).toContain("lab/model-next");
    expect(digest.text).not.toContain("涨价");
  });

  it("turns DeepSeek V4 Pro and Grok 4.6 additions into a hot-release digest", () => {
    const digest = modelCatalogDigestEmail({
      models: [
        {
          id: "deepseek/deepseek-v4-pro",
          name: "DeepSeek V4 Pro",
          labName: "DeepSeek",
          releaseDate: "2026-08-13",
          url: "https://example.com/models/deepseek-v4-pro",
        },
        {
          id: "xai/grok-4.6",
          name: "Grok 4.6",
          labName: "xAI",
          releaseDate: "2026-08-12",
          url: "https://example.com/models/grok-4.6",
        },
      ],
      catalogVersion: "b".repeat(40),
      viewUrl: "https://example.com/api-pricing",
      releaseWatchUrl: "https://example.com/ai-model-release-watch",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });

    expect(digest.subject).toContain("热点模型更新");
    expect(digest.subject).toContain("Grok 4.6");
    expect(digest.html).toContain("热点模型发布追踪");
    expect(digest.html).toContain("查看发布追踪");
    expect(digest.text).toContain("DeepSeek-V4-Pro-0813");
    expect(digest.text).toContain("https://x.ai/news/grok-4-6");
  });

  it("renders English subscription and alert emails with localized links", () => {
    const subscription = subscriptionCreatedEmail({
      locale: "en",
      scopeLabel: "ChatGPT Plus",
      viewUrl: "https://example.com/en",
      ctaLabel: "View prices",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(subscription.html).toContain('<html lang="en">');
    expect(subscription.html).toContain("Unsubscribe");
    expect(subscription.subject).toContain("Subscribed");

    const priceChange = priceChangeEmail({
      locale: "en",
      scopeLabel: "ChatGPT Plus",
      changes: [
        {
          region: "US",
          previousPrice: "$20",
          currentPrice: "$18",
          previousCny: 140,
          currentCny: 126,
          changePercent: -10,
        },
      ],
      topThree: [
        {
          rank: 1,
          region: "US",
          displayPrice: "$18",
          convertedCny: 126,
          sourceUrl: "https://example.com/source",
        },
      ],
      viewUrl: "https://example.com/en",
      ctaLabel: "Compare regions",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(priceChange.subject).toContain("now cheaper");
    expect(priceChange.html).toContain("View official source");
    expect(priceChange.text).toContain("Current three lowest prices");

    const ranking = apiRankingChangeEmail({
      locale: "en",
      subject: "Model A is now cheaper!",
      tables: [
        {
          metric: "input",
          label: "Input",
          rows: [
            {
              rank: 1,
              providerName: "Provider",
              modelName: "Model A",
              displayPrice: "$1",
              priceCny: 7,
              previousRank: null,
              previousDisplayPrice: null,
              rankDelta: null,
              priceDirection: "increase",
              isNew: true,
            },
          ],
        },
      ],
      removed: [
        {
          metricLabel: "Output",
          providerName: "Provider",
          modelName: "Model B",
          previousRank: 4,
          previousDisplayPrice: "$2",
        },
      ],
      viewUrl: "https://example.com/en/api-pricing",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(ranking.html).toContain("API price ranking update");
    expect(ranking.html).toContain("Removed from ranking");
    expect(ranking.text).toContain("View full ranking");

    const digest = modelCatalogDigestEmail({
      locale: "en",
      models: [],
      catalogVersion: "version",
      viewUrl: "https://example.com/en/api-pricing",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(digest.subject).toContain("new models");
    expect(digest.html).toContain('<html lang="en">');
  });
});
