import { describe, expect, it } from "vitest";
import {
  officialPageHealthCheck,
  parseBaichuanPricing,
  parseBaiduPricing,
  parseBaiduTokenPackage,
  parseCodeBuddyPricing,
  parseComatePricing,
  parseDeepSeekPricing,
  parseDoubaoPricing,
  parseGlmCodingPlan,
  parseGlmPricing,
  parseGlmResourcePackages,
  glmCodingPlanPriceChunkPaths,
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
      { id: "pro", title: "速通 Pro", price: "¥59", priceSuffix: "/月" },
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
    const trae = parseTraePricing(raw(JSON.stringify(traePayload)));

    expect(stepfun.map((offer) => offer.amountMinor)).toEqual([
      990, 3900, 9900, 19900, 49900,
    ]);
    expect(comate).toHaveLength(7);
    expect(comate.map((offer) => offer.amountMinor)).toEqual([
      0, 10000, 27000, 100000, 29900, 88900, 349900,
    ]);
    expect(qoder.map((offer) => offer.amountMinor)).toEqual([0, 5900, 16900]);
    expect(trae.map((offer) => offer.amountMinor)).toEqual([
      0, 5900, 23900, 69900, 199900,
    ]);
    expect(trae.map((offer) => offer.canonicalPlanSlug)).toEqual([
      "trae-免费-monthly",
      "trae-速通-pro-monthly",
      "trae-速通-pro-monthly-plus",
      "trae-速通-ultra-monthly",
      "trae-优速通-express-monthly",
    ]);
    expect(new Set(trae.map((offer) => offer.canonicalPlanSlug)).size).toBe(
      trae.length,
    );
    expect(
      parseTraePricing(raw(JSON.stringify(traePayload.slice(0, 4)))),
    ).toHaveLength(4);
    expect(
      parseTraePricing(
        raw(
          JSON.stringify(
            traePayload.map((plan) =>
              plan.id === "ultra" ? { ...plan, price: "联系销售" } : plan,
            ),
          ),
        ),
      ),
    ).toHaveLength(4);
    expect(parseTraePricing(raw("<html>not json</html>"))).toEqual([]);
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
  });

  it("selects the latest compact GLM plan version and uses billed totals", () => {
    const glm = parseGlmCodingPlan(
      raw(
        [
          '{type:"lite",unitKey:"month",productId:"lite-v2",salePrice:49,renewAmount:49}',
          '{type:"pro",unitKey:"month",productId:"pro-v2",salePrice:149,renewAmount:149}',
          '{type:"max",unitKey:"month",productId:"max-v2",salePrice:469,renewAmount:469}',
          '{type:"lite",unitKey:"quarter",productId:"lite-quarter-v2",salePrice:132.3,renewAmount:132.3}',
          '{type:"pro",unitKey:"quarter",productId:"pro-quarter-v2",salePrice:402.3,renewAmount:402.3}',
          '{type:"max",unitKey:"quarter",productId:"max-quarter-v2",salePrice:1266.3,renewAmount:1266.3}',
          '{type:"lite",unitKey:"month",productId:"lite-v3",salePrice:118,renewAmount:118}',
          '{type:"pro",unitKey:"month",productId:"pro-v3",salePrice:538,renewAmount:538}',
          '{type:"max",unitKey:"month",productId:"max-v3",salePrice:1078,renewAmount:1078}',
          '{type:"lite",unitKey:"quarter",productId:"lite-quarter-v3",salePrice:94.4,renewAmount:283.2}',
          '{type:"pro",unitKey:"quarter",productId:"pro-quarter-v3",salePrice:430.4,renewAmount:1291.2}',
          '{type:"max",unitKey:"quarter",productId:"max-quarter-v3",salePrice:862.4,renewAmount:2587.2}',
          '{type:"lite",unitKey:"year",productId:"lite-year-v3",salePrice:82.6,renewAmount:991.2}',
          '{type:"pro",unitKey:"year",productId:"pro-year-v3",salePrice:376.6,renewAmount:4519.2}',
          '{type:"max",unitKey:"year",productId:"max-year-v3",salePrice:754.6,renewAmount:9055.2}',
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
      glm.every((offer) => offer.parserVersion === "glm-coding-plan-v7"),
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
      glm.every((offer) => offer.parserVersion === "glm-coding-plan-v7"),
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
