import { describe, expect, it } from "vitest";
import {
  apiPricingRules,
  parseBaiduApi,
  parseBaichuanApi,
  parseDeepSeekApi,
  parseDoubaoApi,
  parseGlmApi,
  parseGrokApi,
  parseClaudeApi,
  parseGeminiApi,
  parseHuaweiMaaSApi,
  parseHunyuanApi,
  parseKimiApi,
  parseLongCatApi,
  parseMimoApi,
  parseMiniMaxApi,
  parseQwenApi,
  parseOpenAiApi,
  parseSiliconFlowApi,
  parseSparkApi,
  parseStepFunApi,
  parseTeleAiApi,
} from "@/lib/collectors/adapters/api-pricing/rules";
import {
  claudeFixture,
  geminiFixture,
  grokFixture,
  openAiFixture,
  type GlobalApiFixture,
} from "@/tests/fixtures/global-api-pricing";
import { hashContent } from "@/lib/collectors/http-client";
import type { RawCollectionResult } from "@/lib/collectors/types";

function raw(body: string): RawCollectionResult {
  return {
    body,
    status: 200,
    sourceUrl: "https://official.example/pricing",
    headers: {},
    contentHash: hashContent(body),
    observedAt: "2026-07-27T10:00:00.000Z",
  };
}

describe("maintainable API pricing rules", () => {
  it("rejects malformed or empty pages for every pricing rule", () => {
    for (const parse of Object.values(apiPricingRules)) {
      expect(parse(raw("<html><body>no pricing data</body></html>"))).toEqual(
        [],
      );
    }
  });

  it("adds model order and the three ranking price types", () => {
    const offers = parseDeepSeekApi(
      raw(`<table>
        <tr><th>模型</th><th>deepseek-v4-flash</th><th>deepseek-v4-pro</th></tr>
        <tr><td>模型版本</td><td>DeepSeek-V4-Flash</td><td>DeepSeek-V4-Pro</td></tr>
        <tr><td>百万tokens输入（缓存命中）</td><td>0.02元</td><td>0.025元</td></tr>
        <tr><td>百万tokens输入（缓存未命中）</td><td>1元</td><td>3元</td></tr>
        <tr><td>百万tokens输出</td><td>2元</td><td>6元</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(6);
    expect(new Set(offers.map((offer) => offer.priceType))).toEqual(
      new Set(["cached_input", "input", "output"]),
    );
    expect(offers.filter((offer) => offer.modelOrder === 0)).toHaveLength(3);
  });

  it("reads every row from Qwen-style model tables", () => {
    const offers = parseQwenApi(
      raw(`<h2>中国内地</h2><table>
        <tr><th>模型 ID（Model ID）</th><th>模式</th><th>输入单价（每百万Token）</th><th>输出单价（每百万Token）</th></tr>
        <tr><td>qwen3.7-max</td><td>标准</td><td>2元</td><td>8元</td></tr>
        <tr><td>qwen3.7-plus</td><td>标准</td><td>0.8元</td><td>3.2元</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(4);
    expect(offers.map((offer) => offer.modelName)).toContain("qwen3.7-plus");
    expect(offers.every((offer) => offer.unit === "/百万 tokens")).toBe(true);
  });

  it("handles duplicate Qwen columns, discounts and invalid rows", () => {
    const offers = parseQwenApi(
      raw(`<table>
        <tr><th>模型 ID</th><th>输入单价</th><th>输入单价</th></tr>
        <tr><td>qwen-discount</td><td>原价 10 元，当前 5 折</td><td>2元</td></tr>
        <tr><td>模型 ID</td><td>1元</td><td>2元</td></tr>
        <tr><td>qwen-no-price</td><td>免费</td><td>不可用</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(2);
    expect(offers.map((offer) => offer.displayPrice)).toEqual(["¥5", "¥2"]);
    expect(offers.map((offer) => offer.rawPlanName)).toEqual([
      expect.stringContaining("输入单价 1"),
      expect.stringContaining("输入单价 2"),
    ]);
  });

  it("expands rowspans and normalizes per-thousand token prices", () => {
    const offers = parseBaiduApi(
      raw(`<table>
        <tr><th>模型名称</th><th>版本</th><th>子项</th><th>在线推理</th></tr>
        <tr><td rowspan="2">ERNIE 5.1</td><td rowspan="2">ERNIE-5.1</td><td>输入</td><td>0.004</td></tr>
        <tr><td>输出</td><td>0.018</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(2);
    expect(offers.map((offer) => offer.amountMinor)).toEqual([400, 1800]);
    expect(offers[1].modelName).toBe("ERNIE 5.1");
  });

  it("keeps all Hunyuan and MiniMax model rows", () => {
    const hunyuan = parseHunyuanApi(
      raw(`<table>
        <tr><th>模型名称</th><th>条件</th><th>输入</th><th>输出</th><th>缓存</th></tr>
        <tr><td>Hy3</td><td>标准</td><td>1</td><td>4</td><td>0.25</td></tr>
        <tr><td>Hy3-preview</td><td>标准</td><td>2</td><td>8</td><td>0.5</td></tr>
      </table>`),
    );
    const minimax = parseMiniMaxApi(
      raw(`<table>
        <tr><th>模型</th><th>输入</th><th>输出</th><th>缓存读取</th><th>缓存写入</th></tr>
        <tr><td>MiniMax-M3</td><td>2</td><td>8</td><td>0.4</td><td>2.5</td></tr>
        <tr><td>MiniMax-M2.7</td><td>2.1</td><td>8.4</td><td>0.42</td><td>2.625</td></tr>
      </table>`),
    );
    expect(hunyuan).toHaveLength(6);
    expect(minimax).toHaveLength(8);
  });

  it("handles aligned Hunyuan prices and qualified MiniMax names", () => {
    const hunyuan = parseHunyuanApi(
      raw(`<table>
        <tr><th>模型</th><th>输入</th><th>输出</th></tr>
        <tr><td>Hy-Aligned</td><td>标准档</td><td>1</td><td>4</td></tr>
        <tr><td></td><td>1</td><td>4</td></tr>
      </table>`),
    );
    const minimax = parseMiniMaxApi(
      raw(`<table>
        <tr><th>模型</th><th>输入</th></tr>
        <tr><td>MiniMax-M4 高速档</td><td>2</td></tr>
        <tr><td></td><td>不可用</td></tr>
      </table>`),
    );
    expect(hunyuan).toHaveLength(2);
    expect(hunyuan[0].priceTier).toContain("标准档");
    expect(minimax).toHaveLength(1);
    expect(minimax[0].priceTier).toContain("高速档");
  });

  it("reads every Kimi model row in the official data block", () => {
    const offers = parseKimiApi(
      raw(`rows={[
        ["kimi-k3", "1M tokens", "¥2", "¥20", "¥100"],
        ["kimi-k2.5", "1M tokens", "¥1", "¥10", "¥50"]
      ]}`),
    );
    expect(offers).toHaveLength(6);
    expect(offers.filter((offer) => offer.modelOrder === 1)).toHaveLength(3);
  });

  it("classifies cache misses as uncached input", () => {
    const offers = parseLongCatApi(
      raw(`<table><tr><th>类型</th><th>原价</th><th>折扣</th></tr>
        <tr><td>缓存未命中输入</td><td>¥5</td><td>¥2</td></tr>
        <tr><td>缓存命中输入</td><td>¥0.1</td><td>¥0.04</td></tr>
        <tr><td>输出</td><td>¥20</td><td>¥8</td></tr></table>`),
    );
    expect(offers.map((offer) => offer.priceType)).toEqual([
      "input",
      "cached_input",
      "output",
    ]);
  });

  it("converts Spark points to prices", () => {
    const offers = parseSparkApi(
      raw(`<table>
        <tr><th>标准成员</th><th>100元</th><th>1000积分</th></tr>
      </table>
      <table>
        <tr><th>模型</th><th>输入积分/百万Token</th><th>输出积分/百万Token</th></tr>
        <tr><td>Spark-X</td><td>10</td><td>20</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(2);
    expect(offers.map((offer) => offer.amountMinor)).toEqual([100, 200]);
  });

  it("parses GLM and Doubao embedded price blocks", () => {
    const glm = parseGlmApi(
      raw('name:"glm-5" inPrice:["1元"] outPrice:["4元"] hit:["0.2元"]'),
    );
    const doubao = parseDoubaoApi(
      raw(`<section class="rank-item"><h4>Doubao-2</h4>
        <div class="rank-item__price-row">
          <span class="rank-item__price-label">输入</span>
          <span class="rank-item__price-value">1.2</span>
        </div>
        <div class="rank-item__price-row">
          <span class="rank-item__price-label">输出</span>
          <span class="rank-item__price-value">4.8</span>
        </div>
      </section>`),
    );
    expect(glm.map((offer) => offer.priceType)).toEqual([
      "input",
      "cached_input",
      "output",
    ]);
    expect(doubao).toHaveLength(2);
  });

  it("parses StepFun and MiMo tables", () => {
    const stepfun = parseStepFunApi(
      raw(`<table>
        <tr><th>模型</th><th>输入</th><th>输出</th></tr>
        <tr><td>step-4</td><td>¥1/百万 tokens</td><td>¥4/百万 tokens</td></tr>
      </table>`),
    );
    const mimo = parseMimoApi(
      raw(`<table>
        <tr><th>模型</th><th>输入单价</th><th>输出单价</th></tr>
        <tr><td>mimo-v3</td><td>1</td><td>5</td></tr>
        <tr><td>mimo-usd</td><td>$1</td><td>$5</td></tr>
      </table>`),
    );
    expect(stepfun).toHaveLength(2);
    expect(mimo).toHaveLength(2);
    expect(mimo.map((offer) => offer.priceType)).toEqual(["input", "output"]);
  });

  it("parses Baichuan explicit units and fallback price columns", () => {
    const offers = parseBaichuanApi(
      raw(`<table>
        <tr><th>模型</th><th>价格</th></tr>
        <tr><td>Baichuan-X</td><td>输入 0.01 元/千 tokens；输出 0.02 元/千 tokens</td></tr>
        <tr><td>Baichuan-Y</td><td>¥3/百万 tokens</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.modelName)).toContain("Baichuan-Y");
  });

  it("parses SiliconFlow rows for text and media prices", () => {
    const offers = parseSiliconFlowApi(
      raw(`<div id="pricing-row-text-1">
        <a title="Qwen/Qwen-X">Qwen-X</a>
        <span>¥1</span><span>¥4</span><span>¥0.2</span>
      </div>
      <div id="pricing-row-image-2">
        <a title="Image-X">Image-X</a><span>¥0.1</span>
      </div>`),
    );
    expect(offers).toHaveLength(4);
    expect(offers.at(-1)).toMatchObject({
      modelName: "Image-X",
      unit: "按官方单位",
    });
  });

  it("handles two-column SiliconFlow and headerless Huawei prices", () => {
    const siliconflow = parseSiliconFlowApi(
      raw(`<div id="pricing-row-embedding-1">
        <a title="Embedding-X"></a><span>¥0.2</span><span>¥0.4</span>
      </div>
      <div id="pricing-row-text-2"><a title=""></a><span>not-a-price</span></div>`),
    );
    const huawei = parseHuaweiMaaSApi(
      raw(`<table>
        <tr><th>模型</th><th>计费项</th></tr>
        <tr><td>Pangu-Y</td><td>输出</td><td>0.02</td></tr>
      </table>`),
    );
    expect(siliconflow).toHaveLength(2);
    expect(huawei).toHaveLength(1);
    expect(huawei[0].unit).toBe("/百万 tokens");
  });

  it("parses Huawei MaaS and TeleAI prices", () => {
    const huawei = parseHuaweiMaaSApi(
      raw(`<table>
        <tr><th>模型</th><th>计费项</th><th>规格</th><th>单价/千Token</th></tr>
        <tr><td>Pangu-X</td><td>输入</td><td>标准</td><td>0.01</td></tr>
      </table>`),
    );
    const teleai = parseTeleAiApi(
      raw(
        '{"productName":"TeleChat-X","discountedPrice":"2.5","discountedUnit":"元/百万tokens"}',
      ),
    );
    expect(huawei).toHaveLength(1);
    expect(huawei[0]).toMatchObject({
      rawPlanName: expect.stringContaining("输入"),
      unit: "/百万 tokens",
    });
    expect(teleai).toHaveLength(1);
    expect(teleai[0].modelName).toBe("TeleChat-X");
    const unnamedTeleai = parseTeleAiApi(
      raw('{"discountedPrice":"1","discountedUnit":"元/千tokens"}'),
    );
    expect(unnamedTeleai[0].modelName).toBe("TeleAI 价格项 1");
  });

  describe.each([
    ["OpenAI", parseOpenAiApi, openAiFixture],
    ["Claude", parseClaudeApi, claudeFixture],
    ["Gemini", parseGeminiApi, geminiFixture],
    ["Grok", parseGrokApi, grokFixture],
  ] as Array<
    [
      string,
      (input: RawCollectionResult) => ReturnType<typeof parseOpenAiApi>,
      GlobalApiFixture,
    ]
  >)("%s global API pricing", (_name, parse, fixture) => {
    it("keeps official USD token prices and ranking eligibility", () => {
      const offers = parse(raw(fixture.normal));
      expect(offers.length).toBeGreaterThanOrEqual(3);
      expect(
        offers.every(
          (offer) =>
            offer.currency === "USD" &&
            offer.region === "全球" &&
            offer.unit === "/百万 tokens",
        ),
      ).toBe(true);
      const rankingTypes = new Set(
        offers
          .filter((offer) => offer.rankingEligible)
          .map((offer) => offer.priceType),
      );
      expect(rankingTypes.has("cached_input")).toBe(true);
      expect(rankingTypes.has("input")).toBe(true);
      expect(rankingTypes.has("output")).toBe(true);
    });

    it("rejects missing fields and abnormal currency or unit", () => {
      expect(parse(raw(fixture.missingField))).toEqual([]);
      expect(parse(raw(fixture.invalidCurrencyUnit))).toEqual([]);
    });

    it("tracks model additions and removals by source order", () => {
      const offers = parse(raw(fixture.modelChanges));
      expect(new Set(offers.map((offer) => offer.modelName)).size).toBe(2);
      expect(new Set(offers.map((offer) => offer.modelOrder))).toEqual(
        new Set([0, 1]),
      );
    });

    it("keeps discount tiers in details but out of ranking", () => {
      const offers = parse(raw(fixture.mixedTiers));
      expect(offers.some((offer) => offer.rankingEligible === true)).toBe(true);
      expect(offers.some((offer) => offer.rankingEligible === false)).toBe(
        true,
      );
    });
  });

  it("keeps only current mainline models from each global API source", () => {
    const openAi = parseOpenAiApi(
      raw(`Prices per 1M tokens.
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-sol | $5 | $0.50 | $30 |
| gpt-5.6-terra | $2 | $0.20 | $12 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| gpt-5.5 | $5 | $0.50 | $30 |
| gpt-5.5-pro | $30 | $3 | $180 |
| gpt-5.4 | $2.50 | $0.25 | $15 |`),
    );
    expect([...new Set(openAi.map((offer) => offer.modelName))]).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
    ]);

    const claude = parseClaudeApi(
      raw(`| Model | Base Input Tokens | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- |
| Claude Fable 5 | $10 / MTok | $1 / MTok | $50 / MTok |
| Claude Sonnet 5through August 31, 2026 | $2 / MTok | $0.20 / MTok | $10 / MTok |
| Claude Sonnet 5starting September 1, 2026 | $3 / MTok | $0.30 / MTok | $15 / MTok |
| Claude Opus 5.1 | $8 / MTok | $0.80 / MTok | $40 / MTok |
| Claude Haiku 4.5.1 | $2 / MTok | $0.20 / MTok | $10 / MTok |
| Claude Opus 4.5 | $5 / MTok | $0.50 / MTok | $25 / MTok |`),
    );
    expect([...new Set(claude.map((offer) => offer.modelName))]).toEqual([
      "Claude Fable 5",
      "Claude Sonnet 5",
    ]);

    const gemini = parseGeminiApi(
      raw(`${geminiFixture.normal}<h2>Gemini 2.0 Flash</h2><h3>Standard</h3><table>
        <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
        <tr><td>Input price</td><td>$0.10</td></tr>
        <tr><td>Output price</td><td>$0.40</td></tr>
      </table>`),
    );
    expect(new Set(gemini.map((offer) => offer.modelName))).toEqual(
      new Set(["Gemini 3.6 Flash"]),
    );

    const grok = parseGrokApi(
      raw(`| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-4.5 | $2 | $0.30 | $6 |
| grok-4.3 | $1.25 | $0.20 | $2.50 |
| grok-build-0.1 | $1 | $0.20 | $2 |`),
    );
    expect([...new Set(grok.map((offer) => offer.modelName))]).toEqual([
      "grok-4.5",
      "grok-4.3",
    ]);
  });

  it("keeps short-context batch rows out of the standard ranking", () => {
    const offers = parseGrokApi(
      raw(`### Batch API Pricing
| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-4.5 (< 200k prompt tokens) | $1.00 | $0.15 | $3.00 |`),
    );

    expect(offers).toHaveLength(3);
    expect(offers.every((offer) => offer.priceTier === "Batch")).toBe(true);
    expect(offers.every((offer) => offer.rankingEligible === false)).toBe(true);
  });

  it("preserves Gemini long-context details and excludes storage charges", () => {
    const offers = parseGeminiApi(
      raw(`<h2>Gemini 3.6 Flash</h2><h3>Standard</h3><table>
        <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
        <tr><td>Input price</td><td>1.25 美元 for prompts &lt;= 200k tokens; 2.50 USD for prompts &gt; 200k tokens</td></tr>
        <tr><td>Context caching storage price per hour</td><td>$4.50</td></tr>
      </table>`),
    );

    const inputOffers = offers.filter((offer) => offer.priceType === "input");
    expect(inputOffers.map((offer) => offer.displayPrice)).toEqual([
      "$1.25",
      "$2.5",
    ]);
    expect(inputOffers.map((offer) => offer.rankingEligible)).toEqual([
      true,
      false,
    ]);
    expect(inputOffers[1].priceTier).toBe("长上下文");

    const storage = offers.find((offer) => offer.priceTier === "存储费");
    expect(storage).toMatchObject({
      priceType: "cached_input",
      unit: "/百万 tokens /小时",
      rankingEligible: false,
    });
  });

  it("does not reuse token-unit evidence across unrelated tables", () => {
    const offers = parseOpenAiApi(
      raw(`## Token pricing
Prices per 1M tokens.
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-sol | $2.00 | $0.20 | $12.00 |

## Per-request tools
Prices per request.
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-terra | $0.01 | $0.01 | $0.02 |`),
    );

    expect(new Set(offers.map((offer) => offer.modelName))).toEqual(
      new Set(["gpt-5.6-sol"]),
    );
  });
});
