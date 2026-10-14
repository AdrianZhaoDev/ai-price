import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  officialPageHealthCheck,
  parseBaichuanPricing,
  parseBaiduPricing,
  parseBaiduTokenPackage,
  parseCodeBuddyPricing,
  isCodeBuddyPlanAsset,
  parseComatePricing,
  parseDeepSeekPricing,
  parseDoubaoPricing,
  parseGlmCodingPlan,
  parseGlmPricing,
  parseGlmResourcePackages,
  findCompleteGlmCodingPlanChunk,
  glmCodingPlanPriceChunkPaths,
  officialPageAdapters,
  parseHuaweiMaaSPricing,
  parseHuaweiTokenPlan,
  parseHunyuanPricing,
  parseKimiK3Pricing,
  parseKimiMembership,
  parseLongCatPricing,
  parseMimoApiPricing,
  parseMimoTokenPlan,
  parseMiniMaxPaygo,
  parseMiniMaxTokenPlan,
  parseQoderPricing,
  parseQwenPricing,
  parseQwenTokenPlan,
  parseSenseNovaTokenPlan,
  parseSiliconFlowPricing,
  parseSparkEffectivePricing,
  parseSparkTokenPlan,
  parseStepPlan,
  parseStepFunMembership,
  parseTeleAiPricing,
  parseTraePricing,
} from "@/lib/collectors/adapters/official-pages";
import { hashContent } from "@/lib/collectors/http-client";
import { parseHuaweiMaaSApi } from "@/lib/collectors/adapters/api-pricing/rules";
import type { RawCollectionResult } from "@/lib/collectors/types";

function raw(body: string): RawCollectionResult {
  return {
    body,
    status: 200,
    sourceUrl: "https://official.example/pricing",
    headers: {},
    contentHash: hashContent(body),
    observedAt: "2026-07-23T10:00:00.000Z",
  };
}

describe("official table adapters", () => {
  it("parses Kimi membership rows", () => {
    const offers = parseKimiMembership(
      raw(`<table><tr><th>套餐</th><th>定位</th><th>连续包月</th></tr>
        <tr><td>Andante</td><td>日常使用</td><td>¥49/月</td></tr>
        <tr><td>Allegro</td><td>全能</td><td>¥699/月</td></tr></table>`),
    );
    expect(offers.map((offer) => offer.amountMinor)).toEqual([4900, 69900]);
  });

  it("finds Kimi's monthly column across localized public tables", () => {
    const offers = parseKimiMembership(
      raw(`<table><tr><th>功能</th><th>Moderato ($19/月)</th></tr>
        <tr><td>Agent 额度</td><td>60</td></tr></table>
        <table><tr><th>方案</th><th>月付</th><th>年付（折合每月）</th></tr>
          <tr><td>Moderato</td><td>$19/月</td><td>$15/月</td></tr>
          <tr><td>Allegretto</td><td>$39/月</td><td>$31/月</td></tr>
          <tr><td>Allegro</td><td>$99/月</td><td>$79/月</td></tr>
          <tr><td>Vivace</td><td>$199/月</td><td>$159/月</td></tr></table>`),
    );

    expect(offers).toHaveLength(4);
    expect(offers.map((offer) => offer.amountMinor)).toEqual([
      1900, 3900, 9900, 19900,
    ]);
    expect(offers.every((offer) => offer.currency === "USD")).toBe(true);
    expect(offers.every((offer) => offer.region === "全球")).toBe(true);
    expect(
      offers.every((offer) => offer.parserVersion === "kimi-membership-v3"),
    ).toBe(true);
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "kimi-membership-official",
    );
    expect(adapter?.healthCheck(offers.slice(0, 3))).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
    expect(
      parseKimiMembership(raw("<table><tr><th>方案</th></tr></table>")),
    ).toEqual([]);
  });

  it("reads Kimi's current USD monthly plans without treating annual equivalents as monthly prices", () => {
    const body = `<table><tr><th>套餐</th><th>月付</th><th>年付总价</th><th>年付折合每月</th></tr>
      <tr><td>Plus</td><td>USD 19/月</td><td>USD 180/年</td><td>USD 15/月</td></tr>
      <tr><td>Pro</td><td>USD 39/月</td><td>USD 372/年</td><td>USD 31/月</td></tr>
      <tr><td>Max</td><td>USD 99/月</td><td>USD 948/年</td><td>USD 79/月</td></tr>
      <tr><td>Ultra</td><td>USD 199/月</td><td>USD 1908/年</td><td>USD 159/月</td></tr></table>`;
    const offers = parseKimiMembership(raw(body));
    expect(
      offers.map((offer) => [
        offer.canonicalPlanSlug,
        offer.amountMinor,
        offer.currency,
        offer.billingPeriod,
      ]),
    ).toEqual([
      ["kimi-plus-monthly", 1900, "USD", "month"],
      ["kimi-pro-monthly", 3900, "USD", "month"],
      ["kimi-max-monthly", 9900, "USD", "month"],
      ["kimi-ultra-monthly", 19900, "USD", "month"],
    ]);
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "kimi-membership-official",
    )!;
    expect(adapter.healthCheck(offers).ok).toBe(true);
    for (const invalid of [
      "USD -19/月",
      "USD 0/月",
      "USD 1e9/月",
      "USD 1000000000/月",
      "USD 10000.01/月",
      "CNY 1000000000/月",
      "CNY 100000.01/月",
      "USD 19/年",
      "USD 19 USD 15/月",
      "JPY 1900/月",
      "USD /月",
    ]) {
      expect(
        adapter.healthCheck(
          parseKimiMembership(raw(body.replace("USD 19/月", invalid))),
        ).ok,
      ).toBe(false);
    }
    expect(
      adapter.healthCheck(
        parseKimiMembership(raw(body.replace("USD 19/月", "USD 10000/月"))),
      ).ok,
    ).toBe(true);
    expect(
      adapter.healthCheck(
        parseKimiMembership(
          raw(
            body.replaceAll("USD", "CNY").replace("CNY 19/月", "CNY 100000/月"),
          ),
        ),
      ).ok,
    ).toBe(true);
    expect(
      adapter.healthCheck(
        parseKimiMembership(
          raw(body.replace(/<tr><td>Ultra[\s\S]*?<\/tr>/, "")),
        ),
      ).ok,
    ).toBe(false);
  });

  it("does not select an annual monthly-equivalent column placed before Kimi's monthly column", () => {
    const body = `<table><tr><th>Plan</th><th>Annual (monthly equivalent)</th><th>Monthly</th></tr>
      <tr><td>Plus</td><td>USD 15/month</td><td>USD 19/month</td></tr>
      <tr><td>Pro</td><td>USD 31/month</td><td>USD 39/month</td></tr>
      <tr><td>Max</td><td>USD 79/month</td><td>USD 99/month</td></tr>
      <tr><td>Ultra</td><td>USD 159/month</td><td>USD 199/month</td></tr></table>`;
    expect(
      parseKimiMembership(raw(body)).map((offer) => offer.amountMinor),
    ).toEqual([1900, 3900, 9900, 19900]);
    expect(
      parseKimiMembership(
        raw(body.replace("<th>Monthly</th>", "<th>Yearly</th>")),
      ),
    ).toEqual([]);
  });

  it.each(["Enterprise", "Allegro", "Plus"])(
    "rejects Kimi's four-row table when Ultra is replaced by %s",
    (replacement) => {
      const body = `<table><tr><th>套餐</th><th>月付</th></tr>
        <tr><td>Plus</td><td>USD 19/月</td></tr>
        <tr><td>Pro</td><td>USD 39/月</td></tr>
        <tr><td>Max</td><td>USD 99/月</td></tr>
        <tr><td>${replacement}</td><td>USD 199/月</td></tr></table>`;
      const offers = parseKimiMembership(raw(body));
      expect(offers).toHaveLength(4);
      const adapter = officialPageAdapters.find(
        (candidate) => candidate.id === "kimi-membership-official",
      )!;
      expect(adapter.healthCheck(offers)).toMatchObject({
        ok: false,
        code: "STRUCTURE_CHANGED",
        details: { missingPlans: ["kimi-ultra-monthly"] },
      });
    },
  );

  it("requires a single supported currency across Kimi's four plans", () => {
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "kimi-membership-official",
    )!;
    const body = `<table><tr><th>套餐</th><th>月付</th></tr>
      <tr><td>Plus</td><td>USD 19/月</td></tr>
      <tr><td>Pro</td><td>USD 39/月</td></tr>
      <tr><td>Max</td><td>USD 99/月</td></tr>
      <tr><td>Ultra</td><td>USD 199/月</td></tr></table>`;
    const current = parseKimiMembership(raw(body));
    expect(adapter.healthCheck(current).ok).toBe(true);
    expect(
      adapter.healthCheck(
        parseKimiMembership(raw(body.replaceAll("USD", "CNY"))),
      ).ok,
    ).toBe(true);
    for (const mixed of [
      body.replace("USD 19/月", "CNY 19/月"),
      body.replaceAll("USD", "CNY").replace("CNY 19/月", "USD 19/月"),
    ]) {
      const offers = parseKimiMembership(raw(mixed));
      expect(offers).toHaveLength(4);
      expect(adapter.healthCheck(offers)).toMatchObject({
        ok: false,
        code: "STRUCTURE_CHANGED",
        details: { currencies: ["CNY", "USD"] },
      });
    }
    expect(
      adapter.healthCheck(
        current.map((offer) => ({ ...offer, currency: "EUR" })),
      ).ok,
    ).toBe(false);
    for (const excessive of ["CNY 100000.01/月", "CNY 1000000000/月"]) {
      const offers = parseKimiMembership(
        raw(body.replaceAll("USD", "CNY").replace("CNY 19/月", excessive)),
      );
      expect(offers).toHaveLength(3);
      expect(adapter.healthCheck(offers).ok).toBe(false);
    }
  });

  it("accepts reordered current Kimi plans but rejects an extra or legacy plan set", () => {
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "kimi-membership-official",
    )!;
    const table = (names: string[]) =>
      raw(
        `<table><tr><th>套餐</th><th>月付</th></tr>${names
          .map((name) => `<tr><td>${name}</td><td>USD 19/月</td></tr>`)
          .join("")}</table>`,
      );
    expect(
      adapter.healthCheck(
        parseKimiMembership(table(["Ultra", "Max", "Pro", "Plus"])),
      ).ok,
    ).toBe(true);
    for (const names of [
      ["Plus", "Pro", "Max", "Ultra", "Enterprise"],
      ["Moderato", "Allegretto", "Allegro", "Vivace"],
    ]) {
      expect(
        adapter.healthCheck(parseKimiMembership(table(names))),
      ).toMatchObject({
        ok: false,
        code: "STRUCTURE_CHANGED",
      });
    }
  });

  it("parses MiniMax horizontal plans", () => {
    const offers = parseMiniMaxTokenPlan(
      raw(`<table><tr><th></th><th>Plus</th><th>Max</th></tr>
        <tr><td>价格</td><td>¥49 /月</td><td>¥119 /月</td></tr></table>`),
    );
    expect(offers).toHaveLength(2);
    expect(offers[1].canonicalPlanSlug).toBe("minimax-token-max");
  });

  it("parses all Step Plan billing periods", () => {
    const offers = parseStepPlan(
      raw(`<table><tr><th>档位</th><th>人群</th><th>Credit</th><th>月付</th><th>季付</th><th>年付</th></tr>
        <tr><td>Flash Mini</td><td>入门</td><td>400M</td><td>¥49</td><td>¥129</td><td>¥456</td></tr></table>`),
    );
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.billingPeriod)).toEqual([
      "month",
      "quarter",
      "year",
    ]);
  });

  it("finds MiniMax plans after unrelated tables and rejects ambiguous billing", () => {
    const offers = parseMiniMaxTokenPlan(
      raw(`<table><tr><th>购买价格</th><th>积分</th></tr><tr><td>¥30</td><td>4489</td></tr></table>
      <table><tr><th></th><th>Plus</th><th>Max</th><th>Ultra</th><th>Unknown</th></tr>
      <tr><td>价格</td><td>¥49 /月</td><td>￥119 /月</td><td>¥469 /月</td><td>¥99 /年</td></tr></table>`),
    );
    expect(offers.map((offer) => offer.amountMinor)).toEqual([
      4900, 11900, 46900,
    ]);
    expect(
      offers.every((offer) => offer.parserVersion === "minimax-token-plan-v4"),
    ).toBe(true);
    for (const price of ["", "¥-49 /月", "$49 /月", "¥49 起", "¥49 /年"]) {
      expect(
        parseMiniMaxTokenPlan(
          raw(
            `<table><tr><th></th><th>Plus</th></tr><tr><td>价格</td><td>${price}</td></tr></table>`,
          ),
        ),
      ).toEqual([]);
    }
    const adapter = officialPageAdapters.find(
      (item) => item.id === "minimax-token-plan-official",
    )!;
    expect(adapter.sourceUrl).toBe(
      "https://platform.minimax.io/docs/guides/pricing-token-plan.md",
    );
    expect(adapter.healthCheck(offers)).toMatchObject({ ok: true });
  });

  it("parses MiniMax official global sources without weakening completeness", async () => {
    const tokenPlan = `
|  | **Plus** | **Max** | **Ultra** |
| --- | --- | --- | --- |
| **Price** | **\\$22 /month** | **\\$55 /month** | **\\$132 /month** |
`;
    const paygo = `
## Text

| **Model** | **Input** | **Output** | **Prompt caching Read** | **Prompt caching Write** |
| --- | --- | --- | --- | --- |
| **MiniMax-M2.7** | \\$0.3 / M tokens | \\$1.2 / M tokens | \\$0.06 / M tokens | \\$0.375 / M tokens |
`;

    const paygoAdapter = officialPageAdapters.find(
      (item) => item.id === "minimax-paygo-official",
    )!;
    expect(paygoAdapter.sourceUrl).toBe(
      "https://platform.minimax.io/docs/guides/pricing-paygo.md",
    );
    const directPaygo = await paygoAdapter.parse(
      raw(`<h2>语言模型</h2><table><tr><th>模型</th><th>输入价格元/百万 tokens</th><th>输出价格元/百万 tokens</th><th>缓存读取元/百万 tokens</th><th>缓存写入元/百万 tokens</th></tr>
      <tr><td>MiniMax-M2.7</td><td>2.1</td><td>8.4</td><td>0.42</td><td>2.625</td></tr></table>`),
    );
    const fallbackPaygo = await paygoAdapter.parse({
      ...raw(paygo),
      sourceUrl: "https://platform.minimax.io/docs/guides/pricing-paygo.md",
    });
    const fallbackTokenPlan = parseMiniMaxTokenPlan({
      ...raw(tokenPlan),
      sourceUrl:
        "https://platform.minimax.io/docs/guides/pricing-token-plan.md",
    });

    expect(fallbackTokenPlan).toHaveLength(3);
    expect(fallbackTokenPlan.every((offer) => offer.currency === "USD")).toBe(
      true,
    );
    expect(fallbackPaygo.map((offer) => offer.amountMinor)).toEqual([
      30, 120, 6, 37.5,
    ]);
    expect(fallbackPaygo.map((offer) => offer.priceType)).toEqual([
      "input",
      "output",
      "cached_input",
      "cache_write",
    ]);
    expect(fallbackPaygo.every((offer) => offer.currency === "USD")).toBe(true);
    expect(
      fallbackPaygo.every(
        (offer) =>
          offer.category === "MiniMax Global" &&
          !offer.canonicalPlanSlug?.includes("recharge-now"),
      ),
    ).toBe(true);
    expect(directPaygo[0].canonicalPlanSlug).toContain("语言模型");
    expect(paygoAdapter.healthCheck(fallbackPaygo)).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
    const tokenPlanAdapter = officialPageAdapters.find(
      (item) => item.id === "minimax-token-plan-official",
    )!;
    expect(tokenPlanAdapter.sourceUrl).toBe(
      "https://platform.minimax.io/docs/guides/pricing-token-plan.md",
    );
    expect(tokenPlanAdapter.healthCheck(fallbackTokenPlan)).toMatchObject({
      ok: true,
    });

    const completeRows = Array.from(
      { length: 17 },
      (_, index) =>
        `| MiniMax-Test-${index + 1} | \\$0.3 / M tokens | \\$1.2 / M tokens | \\$0.06 / M tokens | \\$0.375 / M tokens |`,
    ).join("\n");
    const completePaygo = await paygoAdapter.parse({
      ...raw(`
## Text

| Model | Input | Output | Prompt caching Read | Prompt caching Write |
| --- | --- | --- | --- | --- |
${completeRows}

## Audio

| Model | Price |
| --- | --- |
| Speech-Pro | \\$100 / 1M characters |
| Image-Pro | \\$0.003 / image |
| ASR-Pro | \\$0.30 / hour |
| Video-Pro | \\$0.03 / second |
`),
      sourceUrl: "https://platform.minimax.io/docs/guides/pricing-paygo.md",
    });
    const speech = completePaygo.find((offer) =>
      offer.rawPlanName.startsWith("Speech-Pro"),
    );
    expect(speech).toMatchObject({
      amountMinor: 10_000,
      displayPrice: "$100",
      unit: "/百万字符",
    });
    expect(
      completePaygo
        .filter((offer) => /^(?:Image|ASR|Video)-Pro/.test(offer.rawPlanName))
        .map((offer) => offer.unit),
    ).toEqual(["/张", "/小时", "/秒"]);
    expect(paygoAdapter.healthCheck(completePaygo)).toMatchObject({ ok: true });
  });

  it("preserves DeepSeek sub-cent API prices", () => {
    const offers = parseDeepSeekPricing(
      raw(`<table>
        <tr><th>模型</th><th>deepseek-v4-flash</th><th>deepseek-v4-pro</th></tr>
        <tr><td>x</td></tr><tr><td>x</td></tr>
        <tr><td>模型版本</td><td>DeepSeek-V4-Flash</td><td>DeepSeek-V4-Pro</td></tr>
        <tr><td>价格</td><td>百万tokens输入（缓存命中）</td><td>0.02元</td><td>0.025元</td></tr>
        <tr><td>百万tokens输入（缓存未命中）</td><td>1元</td><td>3元</td></tr>
        <tr><td>百万tokens输出</td><td>2元</td><td>6元</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(6);
    expect(offers[1].amountMinor).toBe(2.5);
    expect(officialPageHealthCheck(offers).ok).toBe(true);
    expect(officialPageHealthCheck([]).code).toBe("EMPTY_RESULT");
  });

  it("parses Qwen API prices and personal Token Plans", () => {
    const api = parseQwenPricing(
      raw(`<table>
        <tr><th>模型 ID（Model ID）</th><th>区域</th><th>模式</th><th>阶梯</th><th>输入单价</th><th>输出单价</th></tr>
        <tr><td>qwen-max</td><td>中国内地</td><td>非思考</td><td>无阶梯</td><td>2.4元</td><td>9.6元</td></tr>
      </table>`),
    );
    const plans = parseQwenTokenPlan(
      raw(`<table>
        <tr><th></th><th>Lite 套餐</th><th>Standard 套餐</th><th>Pro 套餐</th></tr>
        <tr><td>定价</td><td>原价 60 元/月 限时 39 元/月</td><td>139 元/月</td><td>499 元/月</td></tr>
      </table>`),
    );
    expect(api.map((item) => item.amountMinor)).toEqual([240, 960]);
    expect(api).toMatchObject([
      {
        modelName: "Qwen Max",
        modelSlug: "qwen-max",
        priceType: "input",
      },
      {
        modelName: "Qwen Max",
        modelSlug: "qwen-max",
        priceType: "output",
      },
    ]);
    expect(plans.map((item) => item.amountMinor)).toEqual([3900, 13900, 49900]);
  });

  it("parses Baidu API and monthly point packages", () => {
    const api = parseBaiduPricing(
      raw(`<table>
        <tr><th>模型名称</th><th>版本</th><th>服务</th><th>子项</th><th>在线推理</th></tr>
        <tr><td>ERNIE 5.1</td><td>ERNIE-5.1</td><td>推理</td><td>输入（输入&lt;=32k）</td><td>0.004</td></tr>
        <tr><td>输出（输入&lt;=32k）</td><td>0.018</td></tr>
      </table>`),
    );
    const plans = parseBaiduTokenPackage(
      raw(`<table>
        <tr><th>积分额度</th><th>有效期</th><th>原价</th><th>首购优惠价</th></tr>
        <tr><td>50,000</td><td>1个月</td><td>¥50</td><td>¥45</td></tr>
      </table>`),
    );
    expect(api.map((item) => item.amountMinor)).toEqual([400, 1800]);
    expect(plans[0]).toMatchObject({
      amountMinor: 5000,
      unit: "50,000 积分",
    });
  });

  it("parses Spark membership and its explicitly labelled effective rate", () => {
    const fixture = raw(`<table>
      <tr><th>成员类型</th><th>月价格(元/成员)</th><th>月积分额度</th></tr>
      <tr><td>标准成员</td><td>200</td><td>20000</td></tr>
    </table><table>
      <tr><th>模型</th><th>上下文</th><th>描述</th><th>输入(积分/百万Token)</th><th>缓存命中(积分/百万Token)</th><th>输出(积分/百万Token)</th></tr>
      <tr><td>Spark X2</td><td>192K</td><td>星火自研</td><td>300</td><td>60</td><td>300</td></tr>
    </table>`);
    expect(parseSparkTokenPlan(fixture)[0].amountMinor).toBe(20000);
    expect(
      parseSparkEffectivePricing(fixture).map((item) => item.amountMinor),
    ).toEqual([300, 60, 300]);
  });

  it("parses Hunyuan, MiniMax, Kimi, GLM and Doubao official formats", () => {
    const hunyuan = parseHunyuanPricing(
      raw(`<table><tr><th>模型名称</th><th>条件</th><th>输入</th><th>输出</th><th>缓存</th></tr>
        <tr><td>Hy3</td><td>-</td><td>1</td><td>4</td><td>0.25</td></tr></table>`),
    );
    const minimax = parseMiniMaxPaygo(
      raw(`<table><tr><th>模型</th><th>输入</th><th>输出</th><th>缓存读取</th><th>缓存写入</th></tr>
        <tr><td>MiniMax-M2.7</td><td>2.1</td><td>8.4</td><td>0.42</td><td>2.625</td></tr></table>`),
    );
    const kimi = parseKimiK3Pricing(
      raw(
        `rows={[\n["kimi-k3", "1M tokens", "¥2.00", "¥20.00", "¥100.00", "1M"]\n]}`,
      ),
    );
    const glmBody =
      'modelList:[{name:"GLM-5.2",rowspan:1,inPrice:["8元"],outPrice:["28元"],storage:"免费",hit:["2元"],decode:""}]';
    const glm = parseGlmPricing(raw(glmBody));
    const packages = parseGlmResourcePackages(
      raw(
        'productName:"GLM-5.2",productDes:"旗舰",productSize:"2000万tokens",productDateRange:"3个月",productAdvantage:"智能",salePrice:"39.9",oldSalePrice:"80"',
      ),
    );
    const doubao = parseDoubaoPricing(
      raw(`<div class="rank-item"><h4>豆包大模型 Evolving</h4>
        <div class="rank-item__price-row"><span class="rank-item__price-label">推理输入</span><span class="rank-item__price-value">6.00</span></div>
        <div class="rank-item__price-row"><span class="rank-item__price-label">推理输出</span><span class="rank-item__price-value">30.00</span></div>
      </div>`),
    );
    expect(hunyuan).toHaveLength(3);
    expect(minimax).toHaveLength(4);
    expect(kimi.map((item) => item.amountMinor)).toEqual([200, 2000, 10000]);
    expect(glm.map((item) => item.amountMinor)).toEqual([800, 200, 2800]);
    expect(glm.map((item) => item.priceType)).toEqual([
      "input",
      "cached_input",
      "output",
    ]);
    expect(glm.every((item) => item.modelSlug === "glm-5-2")).toBe(true);
    expect(packages[0].amountMinor).toBe(3990);
    expect(doubao.map((item) => item.amountMinor)).toEqual([600, 3000]);
  });

  it("parses newly integrated domestic coding subscriptions", () => {
    const stepfun = parseStepFunMembership(
      raw(`<div>尝鲜 ¥9.9 一周</div><div>入门 ¥39 每月</div>
        <div>高级 ¥99 每月</div><div>进阶 ¥199 每月</div>
        <div>专业 ¥499 每月</div>`),
    );
    const comate = parseComatePricing(
      raw(`<table>
        <tr><th>版本</th><th>个人免费版</th><th>个人专业版</th><th>企业旗舰版</th></tr>
        <tr><td>单价</td><td>免费</td><td>￥100/月 ￥270/季 ￥1000/年</td><td>￥299/月 ￥889/季 ￥3499/年</td></tr>
      </table>`),
    );
    const qoder = parseQoderPricing(
      raw(`<table>
        <tr><th>版本</th><th>个人免费版</th><th>个人专业版（Pro）</th><th>个人高级版（Pro+）</th></tr>
        <tr><td>单价</td><td>免费</td><td>59 元/月</td><td>169 元/月</td></tr>
      </table>`),
    );
    const traePayload = [
      { id: "free", title: "免费", price: "¥0" },
      { id: "pro", title: "速通 Pro", price: "¥59/月" },
      {
        id: "pro-plus",
        title: "速通 Pro+",
        price: "¥239",
        priceSuffix: "/月",
      },
      {
        id: "ultra",
        title: "速通 Ultra",
        price: "¥699",
        priceSuffix: "/月",
      },
      {
        id: "express",
        title: "优速通",
        titleSuffix: "Express",
        price: "¥1999",
        priceSuffix: "/月",
      },
      { id: "future-plan", title: "未来套餐", price: "¥9999" },
    ];
    const trae = parseTraePricing(
      raw(
        `<script id="__MODERN_ROUTER_DATA__" type="application/json">${JSON.stringify(
          {
            loaderData: {
              "__header-footer-layout/pricing/page": {
                liteProducts: {
                  products: [
                    { id: 1, period_type: 0, display_price: "$0" },
                    { id: 37, period_type: 0, display_price: "$3" },
                    { id: 2, period_type: 0, display_price: "$0" },
                    { id: 30, period_type: 0, display_price: "$30" },
                    { id: 32, period_type: 0, display_price: "$100" },
                    { id: 31, period_type: 1, display_price: "$22.5" },
                  ],
                },
              },
            },
          },
        )}</script>`,
      ),
    );

    expect(stepfun.map((offer) => offer.amountMinor)).toEqual([
      990, 3900, 9900, 19900, 49900,
    ]);
    expect(comate).toHaveLength(7);
    expect(comate.map((offer) => offer.amountMinor)).toEqual([
      0, 10000, 27000, 100000, 29900, 88900, 349900,
    ]);
    expect(qoder.map((offer) => offer.amountMinor)).toEqual([0, 5900, 16900]);
    expect(trae.map((offer) => offer.amountMinor)).toEqual([
      0, 300, 0, 3000, 10000,
    ]);
    expect(trae.every((offer) => offer.currency === "USD")).toBe(true);
    expect(trae.map((offer) => offer.canonicalPlanSlug)).toEqual([
      "trae-免费-monthly",
      "trae-lite-monthly",
      "trae-速通-pro-monthly",
      "trae-速通-pro-monthly-plus",
      "trae-速通-ultra-monthly",
    ]);
    expect(new Set(trae.map((offer) => offer.canonicalPlanSlug)).size).toBe(
      trae.length,
    );
    expect(
      parseTraePricing(raw(JSON.stringify({ plans: traePayload.slice(0, 4) }))),
    ).toHaveLength(4);
    expect(
      parseTraePricing(
        raw(
          JSON.stringify({
            data: traePayload.map((plan) =>
              plan.id === "ultra" ? { ...plan, price: "联系销售" } : plan,
            ),
          }),
        ),
      ),
    ).toHaveLength(3);
    expect(parseTraePricing(raw("<html>not json</html>"))).toEqual([]);
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "trae-pricing-official",
    );
    expect(adapter?.sourceUrl).toBe("https://www.trae.ai/pricing");
    expect(adapter?.healthCheck([])).toMatchObject({
      ok: false,
      code: "ACCESS_BLOCKED",
    });
    const current = parseTraePricing(
      raw(
        `<script id="__MODERN_ROUTER_DATA__">${JSON.stringify({
          loaderData: {
            "__header-footer-layout/pricing/page": {
              productList: {
                products: [
                  {
                    id: "1",
                    display_price: "$0",
                    product_extra: { subscription_extra: { period_type: 0 } },
                  },
                  {
                    id: "2",
                    display_price: "$20",
                    product_extra: { subscription_extra: { period_type: 0 } },
                  },
                  {
                    id: "30",
                    display_price: "$60",
                    product_extra: { subscription_extra: { period_type: 0 } },
                  },
                  {
                    id: "32",
                    display_price: "$200",
                    product_extra: { subscription_extra: { period_type: 0 } },
                  },
                  {
                    id: "33",
                    display_price: "$166.67",
                    product_extra: { subscription_extra: { period_type: 1 } },
                  },
                ],
              },
            },
          },
        })}</script>`,
      ),
    );
    expect(current.map((offer) => offer.amountMinor)).toEqual([
      0, 2000, 6000, 20000,
    ]);
    expect(adapter?.healthCheck(current)).toMatchObject({ ok: true });
    const fallback = raw(
      `<script id="__MODERN_ROUTER_DATA__">${JSON.stringify({
        loaderData: {
          "__header-footer-layout/pricing/page": {
            isProductListFallback: true,
            productList: {
              products: [
                { id: "1", display_price: "$0", period_type: 0 },
                { id: "2", display_price: "$0", period_type: 0 },
                { id: "30", display_price: "$30", period_type: 0 },
                { id: "32", display_price: "$100", period_type: 0 },
              ],
            },
          },
        },
      })}</script>`,
    );
    expect(parseTraePricing(fallback)).toEqual([]);
    expect(adapter?.healthCheck(parseTraePricing(fallback))).toMatchObject({
      ok: false,
      code: "ACCESS_BLOCKED",
    });
    expect(adapter?.healthCheck(current.slice(0, 3))).toMatchObject({
      ok: false,
      code: "STRUCTURE_CHANGED",
    });
  });

  it("collects TRAE's anonymous official product list and rejects incomplete API data", async () => {
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "trae-pricing-official",
    );
    expect(adapter).toBeDefined();
    const products = [
      {
        id: "1",
        display_price: "$0",
        product_extra: { subscription_extra: { period_type: 0 } },
      },
      {
        id: "2",
        display_price: "$20",
        product_extra: { subscription_extra: { period_type: 0 } },
      },
      {
        id: "30",
        display_price: "$60",
        product_extra: { subscription_extra: { period_type: 0 } },
      },
      {
        id: "32",
        display_price: "$200",
        product_extra: { subscription_extra: { period_type: 0 } },
      },
      {
        id: "33",
        display_price: "$166.67",
        product_extra: { subscription_extra: { period_type: 1 } },
      },
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ billing_version: 3, products }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    try {
      const collected = await adapter!.collect({
        observedAt: new Date("2026-09-17T05:33:29Z"),
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://ug-normal.trae.ai/trae/api/v1/pay/sellable_product_list",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: 0, product_types: [0, 1, 4, 6] }),
        }),
      );
      expect(collected.sourceUrl).toBe("https://www.trae.ai/pricing");
      const offers = await adapter!.parse(collected);
      expect(offers.map((offer) => offer.amountMinor)).toEqual([
        0, 2000, 6000, 20000,
      ]);
      expect(
        offers.every((offer) => offer.parserVersion === "trae-pricing-v8"),
      ).toBe(true);
      expect(adapter!.healthCheck(offers)).toMatchObject({ ok: true });
      expect(
        adapter!.healthCheck(
          parseTraePricing(
            raw(
              JSON.stringify({
                billing_version: 3,
                products: products.filter((product) => product.id !== "32"),
              }),
            ),
          ),
        ),
      ).toMatchObject({ ok: false, code: "STRUCTURE_CHANGED" });
      expect(
        adapter!.healthCheck(
          parseTraePricing(
            raw(
              JSON.stringify({
                billing_version: 3,
                products: products.map((product) =>
                  product.id === "30"
                    ? { ...product, display_price: "$NaN" }
                    : product,
                ),
              }),
            ),
          ),
        ),
      ).toMatchObject({ ok: false, code: "STRUCTURE_CHANGED" });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("parses coding plans from dynamic official JavaScript payloads", () => {
    const glm = parseGlmCodingPlan(
      raw(
        '{productId:"legacy",productName:"Lite",salePrice:20,unit:"month"} {productId:"lite-v2",productName:"Lite",salePrice:49,unit:"month",version:"v2"} {productId:"pro-v2",productName:"Pro",salePrice:399,unit:"quarter",version:"v2"} {productId:"max-v2",productName:"Max",salePrice:469,unit:"month",version:"v2"}',
      ),
    );
    const codebuddy = parseCodeBuddyPricing(
      raw(
        'id:"free",title:"体验版"} id:"youth",title:"青春版","monthly":{price:"¥ 39"} id:"standard",title:"标准版","monthly-auto":{price:"¥ 70"} id:"advanced",title:"高级版","monthly-auto":{price:"¥ 140"} id:"flagship",title:"旗舰版","monthly-auto":{price:"¥ 700"}',
      ),
    );

    expect(glm.map((offer) => offer.amountMinor)).toEqual([4900, 39900, 46900]);
    expect(codebuddy.map((offer) => offer.amountMinor)).toEqual([
      0, 3900, 7000, 14000, 70000,
    ]);
    const currentCodeBuddy =
      'id:"free",prices:{monthly:{price:"限时免费"}} id:"youth",prices:{monthly:{price:"￥ 39"}} id:"standard",prices:{"monthly-auto":{price:"￥ 70"}} id:"advanced",prices:{"monthly-auto":{price:"￥ 140"}} id:"flagship",prices:{"monthly-auto":{price:"￥ 700"}}';
    expect(isCodeBuddyPlanAsset(currentCodeBuddy)).toBe(true);
    expect(
      parseCodeBuddyPricing(raw(currentCodeBuddy)).map(
        (offer) => offer.amountMinor,
      ),
    ).toEqual([0, 3900, 7000, 14000, 70000]);
    expect(isCodeBuddyPlanAsset('id:"flagship",price:"¥198"')).toBe(false);
  });

  it("selects the latest compact GLM plan version and uses billed totals", () => {
    const glm = parseGlmCodingPlan(
      raw(
        [
          'const a="V2",items=[',
          '{type:"lite",unitKey:"month",productId:"lite-v2",salePrice:49,renewAmount:49}',
          '{type:"pro",unitKey:"month",productId:"pro-v2",salePrice:149,renewAmount:149}',
          '{type:"max",unitKey:"month",productId:"max-v2",salePrice:469,renewAmount:469}',
          '{type:"lite",unitKey:"quarter",productId:"lite-quarter-v2",salePrice:132.3,renewAmount:132.3}',
          '{type:"pro",unitKey:"quarter",productId:"pro-quarter-v2",salePrice:402.3,renewAmount:402.3}',
          '{type:"max",unitKey:"quarter",productId:"max-quarter-v2",salePrice:1266.3,renewAmount:1266.3}',
          '],b="V3",items=[',
          '{type:"lite",unitKey:"month",productId:"lite-v3",salePrice:118,renewAmount:118}',
          '{type:"pro",unitKey:"month",productId:"pro-v3",salePrice:538,renewAmount:538}',
          '{type:"max",unitKey:"month",productId:"max-v3",salePrice:1078,renewAmount:1078}',
          '{type:"lite",unitKey:"quarter",productId:"lite-quarter-v3",salePrice:94.4,renewAmount:283.2}',
          '{type:"pro",unitKey:"quarter",productId:"pro-quarter-v3",salePrice:430.4,renewAmount:1291.2}',
          '{type:"max",unitKey:"quarter",productId:"max-quarter-v3",salePrice:862.4,renewAmount:2587.2}',
          '{type:"lite",unitKey:"year",productId:"lite-year-v3",salePrice:82.6,renewAmount:991.2}',
          '{type:"pro",unitKey:"year",productId:"pro-year-v3",salePrice:376.6,renewAmount:4519.2}',
          '{type:"max",unitKey:"year",productId:"max-year-v3",salePrice:754.6,renewAmount:9055.2}',
          "];",
        ].join(","),
      ),
    );

    expect(glm).toHaveLength(9);
    expect(glm.map((offer) => offer.amountMinor)).toEqual([
      11800, 53800, 107800, 28320, 129120, 258720, 99120, 451920, 905520,
    ]);
    expect(glm.map((offer) => offer.billingPeriod)).toEqual([
      "month",
      "month",
      "month",
      "quarter",
      "quarter",
      "quarter",
      "year",
      "year",
      "year",
    ]);
    expect(
      glm.every((offer) => offer.parserVersion === "glm-coding-plan-v8"),
    ).toBe(true);
  });

  it("prioritizes the GLM chunk that contains all billing periods", () => {
    expect(
      glmCodingPlanPriceChunkPaths(
        [
          '"ClaudeCode~SpecialArea~subscribe-overview":"064a6780"',
          'ClaudeCode:"34d633db"',
          '"ClaudeCode~SpecialArea~subscribe-overview":"055aad4d"',
          '"ClaudeCode":"44c4b0c4"',
        ].join(","),
      ),
    ).toEqual([
      "ClaudeCode.34d633db.js",
      "ClaudeCode.44c4b0c4.js",
      "ClaudeCode~SpecialArea~subscribe-overview.064a6780.js",
      "ClaudeCode~SpecialArea~subscribe-overview.055aad4d.js",
    ]);
  });

  it("loads remaining GLM candidates but rejects an unverified route dependency", async () => {
    const complete = raw(
      [
        '{type:"lite",unitKey:"month",productId:"lite-month",salePrice:118,renewAmount:118}',
        '{type:"pro",unitKey:"month",productId:"pro-month",salePrice:538,renewAmount:538}',
        '{type:"max",unitKey:"month",productId:"max-month",salePrice:1078,renewAmount:1078}',
        '{type:"lite",unitKey:"quarter",productId:"lite-quarter",salePrice:283.2,renewAmount:283.2}',
        '{type:"pro",unitKey:"quarter",productId:"pro-quarter",salePrice:1291.2,renewAmount:1291.2}',
        '{type:"max",unitKey:"quarter",productId:"max-quarter",salePrice:2587.2,renewAmount:2587.2}',
        '{type:"lite",unitKey:"year",productId:"lite-year",salePrice:991.2,renewAmount:991.2}',
        '{type:"pro",unitKey:"year",productId:"pro-year",salePrice:4519.2,renewAmount:4519.2}',
        '{type:"max",unitKey:"year",productId:"max-year",salePrice:9055.2,renewAmount:9055.2}',
      ].join(","),
    );
    const loadChunk = vi
      .fn<(chunkPath: string) => Promise<RawCollectionResult>>()
      .mockRejectedValueOnce(new Error("first chunk timed out"))
      .mockResolvedValueOnce(complete);

    await expect(
      findCompleteGlmCodingPlanChunk(["first.js", "second.js"], loadChunk),
    ).resolves.toBeNull();
    expect(loadChunk).toHaveBeenNthCalledWith(1, "first.js");
    expect(loadChunk).toHaveBeenNthCalledWith(2, "second.js");
  });

  it("resolves the Coding Plan numeric dependencies using JS hashes rather than CSS hashes", () => {
    const runtime =
      'n.u=function(e){return"js/"+({2338:"ClaudeCode",999:"unrelated"}[e]||e)+"."+{2338:"e8038688",3323:"da514124",999:"ffffffff"}[e]+".js"},n.miniCssF=function(e){return"css/"+({2338:"ClaudeCode"}[e]||e)+"."+{2338:"64b6deed"}[e]+".css"},';
    const app =
      'path:"/glm-coding",component:()=>Promise.all([n.e(3323),n.e(2338)]).then(n.bind(n,46905)),meta:{}';
    expect(glmCodingPlanPriceChunkPaths(runtime, app)).toEqual([
      "ClaudeCode.e8038688.js",
      "3323.da514124.js",
    ]);
    expect(
      glmCodingPlanPriceChunkPaths(
        runtime.replace('3323:"da514124"', '3323:"../bad"'),
        app,
      ),
    ).toEqual(["ClaudeCode.e8038688.js"]);
  });

  it("does not fill a truncated new GLM version from old version prices", () => {
    const body =
      'const a="V2",items=[{type:"lite",unitKey:"month",productId:"old",salePrice:49,renewAmount:49}],b="V3",items=[{type:"pro",unitKey:"month",productId:"new",salePrice:538,renewAmount:538}]';
    const offers = parseGlmCodingPlan(raw(body));
    expect(offers.map((offer) => offer.canonicalPlanSlug)).toEqual([
      "glm-coding-pro-month",
    ]);
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "glm-coding-plan-official",
    )!;
    expect(adapter.healthCheck(offers).ok).toBe(false);
    for (const fields of [
      "salePrice:82.6",
      "salePrice:82.6,renewAmount:NaN",
      "salePrice:82.6,renewAmount:-991.2",
      "salePrice:82.6,renewAmount:1e9",
    ]) {
      expect(
        parseGlmCodingPlan(
          raw(`{type:"lite",unitKey:"year",productId:"year",${fields}}`),
        ),
      ).toEqual([]);
    }
  });

  it("selects GLM's highest numeric version independently of declaration order", () => {
    const block = (version: number, price: number, count = 9) =>
      `v${version}="V${version}",items=[${["lite", "pro", "max"]
        .flatMap((plan) =>
          ["month", "quarter", "year"].map(
            (period) =>
              `{type:"${plan}",unitKey:"${period}",productId:"v${version}-${plan}-${period}",salePrice:${price},renewAmount:${price}}`,
          ),
        )
        .slice(0, count)
        .join(",")}]`;
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "glm-coding-plan-official",
    )!;
    for (const body of [
      `const ${block(2, 49)},${block(3, 118)};`,
      `const ${block(3, 118)},${block(2, 49)};`,
      `const ${block(10, 118)},${block(3, 49)};`,
    ]) {
      const offers = parseGlmCodingPlan(raw(body));
      expect(offers).toHaveLength(9);
      expect(offers.every((offer) => offer.amountMinor === 11800)).toBe(true);
      expect(adapter.healthCheck(offers).ok).toBe(true);
    }
    const incompleteLatest = parseGlmCodingPlan(
      raw(`const ${block(3, 118, 8)},${block(2, 49)};`),
    );
    expect(incompleteLatest).toHaveLength(8);
    expect(adapter.healthCheck(incompleteLatest).ok).toBe(false);
  });

  it("selects the highest GLM version across all route chunks and rejects ambiguous or incomplete current prices", async () => {
    const block = (version: number, price: number, count = 9) =>
      raw(
        `const v="V${version}",items=[${["lite", "pro", "max"]
          .flatMap((plan) =>
            ["month", "quarter", "year"].map(
              (period) =>
                `{type:"${plan}",unitKey:"${period}",productId:"${plan}-${period}",salePrice:${price},renewAmount:${price}}`,
            ),
          )
          .slice(0, count)
          .join(",")}];`,
      );
    const old = block(2, 49);
    const current = block(3, 118);
    for (const candidates of [
      [old, current],
      [current, old],
    ]) {
      const loader = vi
        .fn<(path: string) => Promise<RawCollectionResult>>()
        .mockResolvedValueOnce(candidates[0])
        .mockResolvedValueOnce(candidates[1]);
      expect(
        await findCompleteGlmCodingPlanChunk(
          ["ClaudeCode.js", "3323.js"],
          loader,
        ),
      ).toBe(current);
      expect(loader).toHaveBeenCalledTimes(2);
    }
    for (const newer of [block(3, 118, 8), block(3, 118, 0)]) {
      const loader = vi
        .fn<(path: string) => Promise<RawCollectionResult>>()
        .mockResolvedValueOnce(old)
        .mockResolvedValueOnce(newer);
      expect(
        await findCompleteGlmCodingPlanChunk(["old.js", "new.js"], loader),
      ).toBeNull();
    }
    const conflicting = vi
      .fn<(path: string) => Promise<RawCollectionResult>>()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(block(3, 99));
    expect(
      await findCompleteGlmCodingPlanChunk(["a.js", "b.js"], conflicting),
    ).toBeNull();
    const identical = vi
      .fn<(path: string) => Promise<RawCollectionResult>>()
      .mockResolvedValue(current);
    expect(
      await findCompleteGlmCodingPlanChunk(["a.js", "b.js"], identical),
    ).toBe(current);
  });

  it("rejects conflicting highest-version GLM declarations and duplicate plan prices within a chunk", () => {
    const products = (price: number) =>
      ["lite", "pro", "max"]
        .flatMap((plan) =>
          ["month", "quarter", "year"].map(
            (period) =>
              `{type:"${plan}",unitKey:"${period}",productId:"${plan}-${period}",salePrice:${price},renewAmount:${price}}`,
          ),
        )
        .join(",");
    const first = `const a="V3",items=[${products(118)}]`;
    const same = `,b="V3",items=[${products(118)}];`;
    const conflicting = `,b="V3",items=[${products(49)}];`;
    expect(parseGlmCodingPlan(raw(first + same))).toHaveLength(9);
    expect(() => parseGlmCodingPlan(raw(first + conflicting))).toThrow(
      /Conflicting/,
    );
    expect(() => parseGlmCodingPlan(raw(`${first},b="V3",items=[];`))).toThrow(
      /incomplete/,
    );
    expect(() =>
      parseGlmCodingPlan(
        raw(
          `const a="V3",items=[${products(118)},{type:"lite",unitKey:"month",productId:"duplicate",salePrice:49,renewAmount:49}];`,
        ),
      ),
    ).toThrow(/Conflicting/);
  });

  it("validates GLM decimal amounts before creating any display string", () => {
    for (const period of ["month", "quarter", "year"]) {
      const payload = (price: string) =>
        raw(
          `{type:"lite",unitKey:"${period}",productId:"plan",salePrice:${price},renewAmount:${price}}`,
        );
      for (const invalid of [
        "0",
        "0.0000006",
        "0.000001",
        "0.001",
        "100000.001",
        "1000000",
        "1e9",
        "NaN",
        "-118",
      ]) {
        expect(parseGlmCodingPlan(payload(invalid))).toEqual([]);
      }
      for (const [valid, amountMinor] of [
        ["0.01", 1],
        ["118.25", 11825],
        ["100000", 10000000],
      ] as const) {
        expect(parseGlmCodingPlan(payload(valid))).toMatchObject([
          { amountMinor },
        ]);
      }
    }
    expect(
      parseGlmCodingPlan(
        raw(
          '{productId:"old",productName:"Lite",salePrice:0.0000006,unit:"month",version:"v2"}',
        ),
      ),
    ).toEqual([]);
    expect(parseGlmCodingPlan(raw("Lite\n￥0.0000006/月"))).toEqual([]);
    const rendered = parseGlmCodingPlan(
      raw("Lite\n￥118/月\n下个季度续费金额：￥0.0000006"),
    );
    expect(rendered).toHaveLength(1);
    expect(rendered[0].amountMinor).toBe(11800);
  });

  it("requires Huawei MaaS's current model and price-type baseline", () => {
    const baseline = parseHuaweiMaaSApi(
      raw(readFileSync("tests/fixtures/huawei-maas-2026-10-14.html", "utf8")),
    );
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "huawei-maas-pricing-official",
    );

    expect(adapter).toBeDefined();
    expect(adapter!.healthCheck(baseline)).toMatchObject({ ok: true });
    expect(adapter!.healthCheck(baseline.slice(0, -1))).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
    expect(
      adapter!.healthCheck(
        baseline.map((offer) => ({ ...offer, priceType: "input" })),
      ),
    ).toMatchObject({ ok: false, code: "STRUCTURE_CHANGED" });
    expect(
      adapter!.healthCheck(
        baseline.map((offer) => ({ ...offer, modelName: "GLM-5.2" })),
      ),
    ).toMatchObject({
      ok: false,
      code: "STRUCTURE_CHANGED",
      details: { missingModels: expect.any(Array) },
    });
  });

  it("rejects same-count Huawei tier replacements and duplicate identities", () => {
    const html = readFileSync(
      "tests/fixtures/huawei-maas-2026-10-14.html",
      "utf8",
    );
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "huawei-maas-pricing-official",
    )!;
    const baseline = parseHuaweiMaaSApi(raw(html));
    for (const changedHtml of [
      html.replace("0≤Token&lt;32K", "0≤Token&lt;64K"),
      html.replace("<td>时段1</td>", "<td>时段3</td>"),
    ]) {
      const replacement = parseHuaweiMaaSApi(raw(changedHtml));
      expect(replacement).toHaveLength(51);
      expect(adapter.healthCheck(replacement)).toMatchObject({
        ok: false,
        code: "STRUCTURE_CHANGED",
        details: {
          missingModels: [],
          missingPriceTypes: [],
          missingPlans: expect.any(Array),
          unexpectedPlans: expect.any(Array),
        },
      });
      expect(
        adapter.healthCheck(replacement).details?.missingPlans,
      ).not.toEqual([]);
      expect(
        adapter.healthCheck(replacement).details?.unexpectedPlans,
      ).not.toEqual([]);
    }
    expect(adapter.healthCheck([baseline[1], ...baseline.slice(1)]).ok).toBe(
      false,
    );
    expect(adapter.healthCheck([...baseline, baseline[0]]).ok).toBe(false);
    expect(adapter.healthCheck([...baseline].reverse()).ok).toBe(true);
    expect(
      adapter.healthCheck(
        baseline.map((offer) => ({
          ...offer,
          amountMinor: offer.amountMinor! + 1,
        })),
      ).ok,
    ).toBe(true);
  });

  it("accepts the current Huawei MaaS public pricing table", () => {
    const current = parseHuaweiMaaSApi(
      raw(readFileSync("tests/fixtures/huawei-maas-2026-10-14.html", "utf8")),
    );
    const adapter = officialPageAdapters.find(
      (candidate) => candidate.id === "huawei-maas-pricing-official",
    );

    expect(current).toHaveLength(51);
    expect(current.some((offer) => offer.modelName === "DeepSeek-V4-Pro")).toBe(
      false,
    );
    expect(current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelName: "Qwen3-30B-A3B",
          priceType: "output",
          amountMinor: 750,
          priceTier: expect.stringContaining("思考模式"),
        }),
        expect.objectContaining({
          modelName: "Qwen3-32B",
          priceType: "output",
          amountMinor: 2000,
          priceTier: expect.stringContaining("思考模式"),
        }),
        expect.objectContaining({
          modelName: "Qwen3-30B-A3B",
          priceType: "output",
          amountMinor: 300,
          priceTier: expect.stringContaining("非思考模式"),
        }),
        expect.objectContaining({
          modelName: "Qwen3-32B",
          priceType: "output",
          amountMinor: 800,
          priceTier: expect.stringContaining("非思考模式"),
        }),
      ]),
    );
    expect(adapter?.healthCheck(current)).toMatchObject({ ok: true });
    expect(adapter?.healthCheck(current.slice(0, -1)).ok).toBe(false);
    const html = readFileSync(
      "tests/fixtures/huawei-maas-2026-10-14.html",
      "utf8",
    );
    for (const broken of [
      html.replace("GLM-5.3", "unknown-model"),
      html.replace("<td>0.75</td>", "<td>-1</td>"),
      html.replace("<td>0.75</td>", "<td></td>"),
      html.replace("<td>0.75</td>", "<td>1000000000</td>"),
      html.replace("<td>0.75</td>", "<td>10000.01</td>"),
      html.replace("<td>0.75</td>", "<td>0</td>"),
      html.replace("<td>0.75</td>", "<td>0.000000001</td>"),
      html.replace("<td>0.75</td>", "<td>0.000000006</td>"),
      html.replace("<td>0.75</td>", "<td>0.0000006</td>"),
      html.replace("<td>0.75</td>", "<td>10000.000000004</td>"),
      html.replace("<td>0.75</td>", "<td>1e9</td>"),
      html.replace("思考模式：7.5", "思考模式：1000000000"),
      html.replace("思考模式：7.5", "思考模式：0"),
      html.replace("思考模式：7.5", "思考模式：0.000000006"),
      html.replace("思考模式：7.5", "思考模式：1e9"),
    ]) {
      expect(adapter?.healthCheck(parseHuaweiMaaSApi(raw(broken))).ok).toBe(
        false,
      );
    }
    expect(
      adapter?.healthCheck(
        parseHuaweiMaaSApi(
          raw(html.replace("<td>0.75</td>", "<td>10000</td>")),
        ),
      ).ok,
    ).toBe(true);
    expect(
      adapter?.healthCheck(
        parseHuaweiMaaSApi(
          raw(html.replace("<td>0.75</td>", "<td>0.000001</td>")),
        ),
      ).ok,
    ).toBe(true);
    for (const changedField of [{ currency: "USD" }, { unit: "/千 tokens" }]) {
      expect(
        adapter?.healthCheck([
          { ...current[0], ...changedField },
          ...current.slice(1),
        ]).ok,
      ).toBe(false);
    }
  });

  it("parses GLM monthly and quarterly prices from the rendered fallback", () => {
    const glm = parseGlmCodingPlan(
      raw(`
Lite
￥44.1/月
￥49/月
下个季度续费金额：￥132.3
Pro
￥134.1/月
￥149/月
下个季度续费金额：￥402.3
Max
￥422.1/月
￥469/月
下个季度续费金额：￥1266.3
`),
    );

    expect(glm.map((offer) => offer.amountMinor)).toEqual([
      4900, 13230, 14900, 40230, 46900, 126630,
    ]);
    expect(glm.map((offer) => offer.billingPeriod)).toEqual([
      "month",
      "quarter",
      "month",
      "quarter",
      "month",
      "quarter",
    ]);
  });

  it("parses the current heading-based GLM rendered fallback", () => {
    const glm = parseGlmCodingPlan(
      raw(`
连续包月
### Lite
¥94.4/月
¥118/月
### Pro
¥430.4/月
¥538/月
### Max
¥862.4/月
¥1078/月
`),
    );

    expect(glm.map((offer) => offer.amountMinor)).toEqual([
      11800, 53800, 107800,
    ]);
    expect(glm.map((offer) => offer.billingPeriod)).toEqual([
      "month",
      "month",
      "month",
    ]);
    expect(
      glm.every((offer) => offer.parserVersion === "glm-coding-plan-v8"),
    ).toBe(true);
    expect(officialPageHealthCheck(glm, 9)).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
  });

  it("parses additional domestic token plans", () => {
    const mimo = parseMimoTokenPlan(
      raw(`<table>
        <tr><th>套餐</th><th>Lite</th><th>Pro</th></tr>
        <tr><td>定价</td><td>¥39/月</td><td>¥99/月</td></tr>
        <tr><td>额度</td><td>4,500 万 Token</td><td>1.2 亿 Token</td></tr>
      </table><table>
        <tr><th>套餐</th><th>Lite</th><th>Pro</th></tr>
        <tr><td>定价</td><td>¥411.84/年</td><td>¥1045.44/年</td></tr>
        <tr><td>额度</td><td>5.4 亿 Token</td><td>14.4 亿 Token</td></tr>
      </table>`),
    );
    const huawei = parseHuaweiTokenPlan(
      raw(`<table><tr><th>序号</th><th>套餐</th><th>周期</th><th>额度</th><th>价格</th></tr>
        <tr><td>1</td><td>Lite</td><td>月</td><td>3,000 万 Token</td><td>¥59/月</td></tr>
        <tr><td>2</td><td>Pro</td><td>月</td><td>1 亿 Token</td><td>¥149/月</td></tr>
      </table>`),
    );
    const sensenova = parseSenseNovaTokenPlan(
      raw(`<section>Free · 公测 ¥0/月</section>`),
    );

    expect(mimo.map((offer) => offer.amountMinor)).toEqual([
      3900, 9900, 41184, 104544,
    ]);
    expect(huawei.map((offer) => offer.amountMinor)).toEqual([5900, 14900]);
    expect(sensenova.map((offer) => offer.amountMinor)).toEqual([0]);
  });

  it("parses additional domestic API price tables", () => {
    const mimo = parseMimoApiPricing(
      raw(`<table><tr><th>模型</th><th>缓存命中</th><th>输入</th><th>输出</th></tr>
        <tr><td>mimo-v2.5-pro</td><td>¥0.025</td><td>¥3</td><td>¥6</td></tr>
        <tr><td>mimo-v2.5</td><td>¥0.02</td><td>¥1</td><td>¥2</td></tr>
      </table>`),
    );
    const baichuan = parseBaichuanPricing(
      raw(`<table><tr><th>模型</th><th>上下文</th><th>并发</th><th>价格</th></tr>
        <tr><td>Baichuan-M3-Plus</td><td>64K</td><td>按量</td><td>输入：0.005元/千tokens 输出：0.009元/千tokens</td></tr>
      </table>`),
    );
    const longcat = parseLongCatPricing(
      raw(`<table><tr><th>类型</th><th>原价</th><th>限时折扣</th></tr>
        <tr><td>缓存未命中输入</td><td>¥5</td><td>¥2</td></tr>
        <tr><td>缓存命中输入</td><td>¥0.1</td><td>¥0.04</td></tr>
        <tr><td>输出</td><td>¥20</td><td>¥8</td></tr>
      </table>`),
    );
    const siliconflow = parseSiliconFlowPricing(
      raw(
        `<main>DeepSeek-V4-Flash deepseek-ai/DeepSeek-V4-Flash ¥1 ¥2 ¥0.02</main>`,
      ),
    );
    const huawei = parseHuaweiMaaSPricing(
      raw(`<table><tr><th>模型</th><th>计费项</th><th>单价/千Token</th></tr>
        <tr><td>DeepSeek-V4-Pro</td><td>输入</td><td>0.012</td></tr>
        <tr><td></td><td>0.024</td><td></td></tr>
      </table>`),
    );
    const teleai = parseTeleAiPricing(
      raw(
        String.raw`{\"discountedPrice\":\"10\",\"discountedUnit\":\"元/15天/QPS\"},{\"discountedPrice\":\"2500\",\"discountedUnit\":\"元/月/QPS\"}`,
      ),
    );

    expect(mimo.map((offer) => offer.amountMinor)).toEqual([
      2.5, 300, 600, 2, 100, 200,
    ]);
    expect(baichuan.map((offer) => offer.amountMinor)).toEqual([500, 900]);
    expect(longcat.map((offer) => offer.amountMinor)).toEqual([200, 4, 800]);
    expect(siliconflow.map((offer) => offer.amountMinor)).toEqual([
      100, 200, 2,
    ]);
    expect(huawei.map((offer) => offer.amountMinor)).toEqual([1200, 2400]);
    expect(teleai.map((offer) => offer.amountMinor)).toEqual([1000, 250000]);
  });

  it("rejects incomplete versions of every newly integrated official page", () => {
    const empty = raw("<main>官方页面暂未提供完整价格表</main>");

    expect(parseStepFunMembership(empty)).toEqual([]);
    expect(parseComatePricing(empty)).toEqual([]);
    expect(parseQoderPricing(empty)).toEqual([]);
    expect(parseTraePricing(empty)).toEqual([]);
    expect(parseSenseNovaTokenPlan(empty)).toEqual([]);
    expect(parseMimoTokenPlan(empty)).toEqual([]);
    expect(parseHuaweiTokenPlan(empty)).toEqual([]);
    expect(parseGlmCodingPlan(empty)).toEqual([]);
    expect(parseCodeBuddyPricing(empty)).toEqual([]);
    expect(parseMimoApiPricing(empty)).toEqual([]);
    expect(parseBaichuanPricing(empty)).toEqual([]);
    expect(parseLongCatPricing(empty)).toEqual([]);
    expect(parseSiliconFlowPricing(empty)).toEqual([]);
    expect(parseHuaweiMaaSPricing(empty)).toEqual([]);
    expect(parseTeleAiPricing(empty)).toEqual([]);

    const oneValidOffer = parseSenseNovaTokenPlan(
      raw("<main>Free · 公测 ¥0/月</main>"),
    );
    expect(officialPageHealthCheck(oneValidOffer, 2)).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
    expect(
      officialPageHealthCheck([
        {
          ...oneValidOffer[0],
          rawPlanName: "",
        },
      ]),
    ).toMatchObject({
      ok: false,
      code: "MISSING_PRICE",
    });
  });
});
