# 数据源与采集

## 可信度顺序

1. 官方公开定价页或官方公开 JSON。
2. Apple App Store storefront 页面。
3. 官方帮助中心或官方文档。
4. 登录后的官方会员页面。
5. 管理员人工录入并附官方证据。

第三方媒体和聚合站只用于发现线索，不作为订阅与品牌价格来源。API 模型目录是
唯一明确例外，见下节。

## models.dev API 模型目录

- 榜单与模型详情的唯一读取源为 `anomalyco/models.dev`，每 4 小时先解析 `dev`
  当前 commit SHA，再下载该固定提交的 TOML 快照。
- canonical model、lab、provider 和 provider offering 独立入库；完整执行
  `base_model`、相同 ID、provider-scoped ID、继承、覆盖和 `base_model_omit` 规则。
- 输入/输出价格单位固定为 USD / 百万 tokens。`alpha`、`deprecated` 不参与最低价；
  详情仍保留状态与全部价格层级。`0` 是有效报价，缺失值不是零。
- `lib/data/model-catalog-overlay.json` 可增加本站 provider/model/offering。冲突必须显式
  `override: true` 并填写原因，offering 还必须提供 canonical ID、来源 URL 与更新时间。
- 导入按内容哈希做差异比较，单事务发布。数量坍缩或 schema 失败时保留上一有效快照；
  仅变化模型失效并主动预热 ISR 页面。
- models.dev 使用 MIT License，见
  `https://github.com/anomalyco/models.dev/blob/dev/LICENSE`。数据按原样提供，页面保留
  固定 commit 证据与 `models.dev` / `local overlay` 来源标识。

## 采集适配器类型

| 类型              | 适用来源               | 策略                                |
| ----------------- | ---------------------- | ----------------------------------- |
| `static_html`     | 官方文档、公开定价页   | HTTP + ETag + HTML fixture          |
| `json_endpoint`   | 页面公开加载的 JSON    | Schema 校验 + 版本记录              |
| `dynamic_page`    | 公开但由 JS 渲染的页面 | 发现版本化公开 JS，禁止绕过登录保护 |
| `app_store`       | Apple storefront       | 按 App ID 和 storefront 采集        |
| `manual_official` | 询价或无法稳定采集     | 管理员录入 + 官方链接 + 证据        |

## 海外四个平台

| 产品    | 主数据源             | 备注                |
| ------- | -------------------- | ------------------- |
| ChatGPT | App Store storefront | App ID `6448311069` |
| Gemini  | App Store storefront | App ID `6477489729` |
| Claude  | App Store storefront | App ID `6473753684` |
| Grok    | App Store storefront | App ID `6670324846` |

当前固定采集 46 个 storefront，覆盖北美、欧洲、东亚、东南亚、南亚、中东、
拉美、非洲和大洋洲，并包含菲律宾、巴基斯坦、越南、印度尼西亚、埃及等常见低价区。
每个应用与 storefront 是独立来源，单区失败不会阻断其他地区。官方页面返回 404
时记为“此区未上架”，不计作解析故障；后续按可验证性继续扩展。

Apple 公开页面通常只显示本地化项目名称和价格，不保证暴露 StoreKit `productId`。内部套餐映射以人工维护的 canonical plan 为准，无法确认时保持独立。

App Store 的公开 IAP 清单可能在月付、年付或不同容量套餐集合之间切换。采集器按
canonical plan 保存多次响应的并集，不把单次清单变短视为整个来源失效；同一套餐的新
价格仍按正常变更处理。

## 国内订阅来源（15）

| 排名 | 产品                       | 已采集价格                    | 官方入口                                                               |
| ---: | -------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
|    1 | 智谱 GLM 资源包            | 限量 Token 资源包             | `https://bigmodel.cn/activity`                                         |
|    2 | 智谱 GLM Coding Plan       | Lite / Pro / Max 月、季、年付 | `https://www.bigmodel.cn/claude-code`                                  |
|    3 | Kimi                       | Andante 等会员套餐            | `https://www.kimi.com/zh-cn/help/membership/membership-pricing`        |
|    4 | 阶跃星辰                   | 周卡与四档月卡                | `https://chat.stepfun.com/subscription`                                |
|    5 | MiniMax                    | Token Plan                    | `https://platform.minimaxi.com/docs/guides/pricing-token-plan`         |
|    6 | 通义千问                   | 个人 Token Plan               | `https://help.aliyun.com/zh/model-studio/token-plan-personal-overview` |
|    7 | 百度千帆                   | Token 福利包                  | `https://cloud.baidu.com/doc/qianfan/s/Smoghsq3g`                      |
|    8 | 讯飞星火                   | Token Plan                    | `https://www.xfyun.cn/doc/spark/TokenPlan.html`                        |
|    9 | 百度文心快码 Comate        | 免费、专业、旗舰版            | `https://cloud.baidu.com/doc/COMATE/s/rlnvnio4a`                       |
|   10 | 阿里 Qoder CN              | Free / Pro / Pro+             | `https://help.aliyun.com/zh/lingma/billing-description`                |
|   11 | TRAE                       | 免费及四档速通套餐            | `https://www.trae.cn/pricing`                                          |
|   12 | 腾讯 CodeBuddy / WorkBuddy | 体验、青春及三档连续包月      | `https://www.codebuddy.cn/pricing/`                                    |
|   13 | Xiaomi MiMo Token Plan     | 四档月付与年付                | `https://mimo.mi.com/docs/zh-CN/price/token-plan`                      |
|   14 | 华为云 MaaS Token Plan     | 四档月付                      | `https://support.huaweicloud.com/price-maas/price-maas-0035.html`      |
|   15 | 商汤 SenseNova Token Plan  | Free 公测；付费档未发布       | `https://www.sensenova.cn/token-plan`                                  |

智谱 GLM 资源包固定置顶。所有来源均从无需登录的官方页面或页面公开加载的版本化
JavaScript 中解析；登录后才能看到且没有公开价目表的会员不发布价格。

## 保留的国内官方 API 采集（16）

| 排名 | 产品                 | 采集范围                                   | 官方入口                                                          |
| ---: | -------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
|    1 | DeepSeek             | 官网全部模型的输入、缓存与输出             | `https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`        |
|    2 | 豆包 / 火山方舟      | 公开价格卡中的全部模型与计费项             | `https://www.volcengine.com/product/ark`                          |
|    3 | 通义千问 / 百炼      | 中国内地人民币模型表的全部行与阶梯         | `https://help.aliyun.com/zh/model-studio/model-pricing`           |
|    4 | Kimi / Moonshot      | 官方数据块列出的全部模型与三类 Token 价格  | `https://platform.kimi.com/docs/pricing/chat-k3`                  |
|    5 | 腾讯混元             | 语言、多模态、图片、视频、向量及批量任务表 | `https://cloud.tencent.com/document/product/1823/130055`          |
|    6 | 文心 / 百度千帆      | 各模型、服务、子项与在线推理价             | `https://cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a`            |
|    7 | 智谱 / BigModel      | 公开 JavaScript 中全部 GLM 模型价格组      | `https://bigmodel.cn/pricing`                                     |
|    8 | MiniMax              | 语言、语音、视频、音乐等按量价目表         | `https://platform.minimaxi.com/docs/guides/pricing-paygo`         |
|    9 | 阶跃星辰             | Step Plan 主套餐和加购项                   | `https://platform.stepfun.com/docs/zh/step-plan/overview`         |
|   10 | 讯飞星火             | 全部模型积分消耗，按标准成员公开比例折算   | `https://www.xfyun.cn/doc/spark/TokenPlan.html`                   |
|   11 | Xiaomi MiMo          | 人民币区的文本、语音及联网服务表           | `https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go`              |
|   12 | 百川智能             | 主模型、向量、文件存储与助手等公开计费项   | `https://platform.baichuan-ai.com/prices`                         |
|   13 | 美团 LongCat         | LongCat-2.0 全部限时折扣项                 | `https://longcat.chat/platform/docs/zh/pricing/long-cat-2.0`      |
|   14 | 硅基流动 SiliconFlow | 公开价格卡中的全部模型及输入、缓存、输出   | `https://siliconflow.cn/pricing`                                  |
|   15 | 华为云 MaaS          | 官网表内全部模型与计费项                   | `https://support.huaweicloud.com/price-maas/price-maas-0002.html` |
|   16 | 中国电信 TeleAI      | 公开产品数据中的全部金额与 QPS 单位        | `https://www.teleai.com.cn/product/Multimodal`                    |

讯飞未公开统一按量后付费价，因此页面明确展示“标准成员折算”，不描述为按量价。
TeleAI 当前公开的是 QPS 产品价，不伪装成 Token 单价。

## 保留的海外官方 API 采集（4）

| 排名 | 产品       | 采集范围                                          | 官方入口                                                   |
| ---: | ---------- | ------------------------------------------------- | ---------------------------------------------------------- |
|   17 | OpenAI API | 标准实时、短上下文的输入、缓存输入与输出 Token 价 | `https://developers.openai.com/api/docs/pricing`           |
|   18 | Claude API | Base Input、Cache Hits 与 Output Token 价         | `https://platform.claude.com/docs/en/about-claude/pricing` |
|   19 | Gemini API | Paid Tier 的 Standard 输入、缓存与输出 Token 价   | `https://ai.google.dev/gemini-api/docs/pricing`            |
|   20 | xAI Grok   | Text API 的短上下文输入、缓存与输出 Token 价      | `https://docs.x.ai/developers/pricing`                     |

这些官方 collector 继续服务品牌落地页与历史价格观察，但新的 API 模型目录、榜单和
模型详情不读取这些报价，也不再产生旧 API 排名事件。Batch、Flex、Priority、长上下文、
免费层、退役或限量模型，以及图片、音频、工具调用等非 Token 项目不进入旧历史口径。
为避免历史型号淹没当前价格，采集阶段只保留官网仍在售的最新主力系列：OpenAI
保留 GPT-5.5 与 GPT-5.6 全系，Claude、Gemini 和 Grok 保留各自当前主力型号；
海外平台参与排行榜的模型上限为 10 个，国内平台仍为 2 个。

### API 规则维护

- 平台入口与调度仍在 `lib/collectors/adapters/official-pages.ts`。
- 20 个平台各自的规则集中在
  `lib/collectors/adapters/api-pricing/rules.ts`，每个平台只有一个具名函数；官网
  列名、DOM 选择器或公开 JavaScript 结构变化时，只修改对应函数。
- `lib/collectors/adapters/api-pricing/shared.ts` 只负责跨平台通用能力：展开
  `rowspan`、读取表格、识别输入/缓存/输出、单位换算和去重。平台例外不得塞进
  通用函数。
- 每次规则变更同时升级该来源的 `parserVersion`，并补充成功、缺字段、增删行
  fixture。版本升级会重置条数坍缩基线，但不会删除最后一次有效报价。
- 排行只使用明确规范化为 `/百万 tokens` 的报价；QPS、图片、小时、积分和订阅
  套餐仍在平台完整价目中展示，但不参加 Token 单价排行。

## 已调研但暂不接入

- 商汤 SenseNova API 价格页当前返回 404，不能作为稳定来源。
- 360 官方价目页当前显示“暂无数据”。
- WPS AI、豆包专业会员、腾讯元宝没有无需登录且精确到套餐金额的稳定公开表。
- 01.AI 有产品入口但没有稳定公开价目路由。
- Gitee AI 模型广场对当前服务端采集返回空模型集合，暂不发布。

这些平台只有在官方公开页能稳定、重复地得到明确金额后才接入。媒体报道、搜索摘要和
第三方聚合站只用于发现线索，不作为报价证据。

## 标准输出

```ts
type NormalizedOffer = {
  providerSlug: string;
  productSlug: string;
  canonicalPlanSlug: string | null;
  rawPlanName: string;
  mode: "subscription" | "api";
  channel: "app_store" | "official_web" | "official_api";
  region: string | null;
  storefront: string | null;
  currency: string;
  amountMinor: number | null;
  status: "verified" | "unpublished";
  billingPeriod:
    "week" | "month" | "quarter" | "year" | "one_time" | "usage" | null;
  unit: string | null;
  taxIncluded: boolean | null;
  sourceUrl: string;
  observedAt: string;
  parserVersion: string;
  modelName?: string;
  modelSlug?: string;
  modelOrder?: number; // 官网表格顺序，0 为最靠前
  priceType?: "cached_input" | "input" | "output" | "cache_write" | "other";
  priceTier?: string;
  tierOrder?: number;
  category?: string;
  rankingEligible?: boolean; // 缺省为可排行
};
```

`amountMinor` 在数据库中使用高精度 decimal，可保存
`¥0.025 / 百万 tokens` 这类低于一分钱的 API 单价。只有“未上架”记录允许为
`null`。

外币报价在同轮使用 Frankfurter v2 的人民币基准汇率转换，数据库同时保存原币价、
人民币值、换算率和汇率日期。汇率服务失败时使用最近一次成功快照；没有实时或历史
汇率时整轮停止，不发布缺失人民币参考的新数据。

## 失效检测

任一条件触发 `stale`：

- HTTP 非 2xx。
- 预期价格表或套餐标题消失。
- 币种为空或金额不能解析。
- 国内官方价格表较上一轮下降超过 30%，且至少少 2 条。
- 同一价格跳变超过 50%。
- 页面结构 hash 变化且解析器没有对应 fixture。
- App Store 页面进入验证码或访问限制。

HTTP 404 仅在 App Store storefront 明确代表“该区未上架”时视为正常状态。

连续三次失败升级管理员告警。最后有效价格继续展示，同时标注“数据可能已过期”。
解析器版本升级会重置该来源的条数基线；如确认某个非 App Store 官方页面确实下架了
多档套餐，可用精确来源 ID 单次接受新基线：

```bash
npx tsx scripts/collect-prices.ts --source=<adapter-id> --accept-plan-count-change
```

## 刷新计划

- 全部价格：每 4 小时。
- 汇率：与价格任务同轮更新。
- 失败重试：15 分钟、1 小时、6 小时。
- 每周人工抽查四个海外产品和三个国内来源。

## Fixture 规则

每个自动适配器必须有脱敏 fixture：

- 一份成功响应。
- 一份关键字段缺失响应。
- 一份套餐新增或删除响应。
- 一份币种或周期异常响应。

解析器未达到测试要求不得加入生产调度。
