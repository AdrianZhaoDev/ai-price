# 技术架构

## 决策摘要

采用可部署、低运维且无供应商强绑定的全栈 TypeScript 架构：

- Next.js 16 App Router
- React 19
- TypeScript strict
- PostgreSQL
- Drizzle ORM
- Zod 运行时校验
- Nodemailer 通用 SMTP
- Vitest + Testing Library + Playwright
- GitHub Actions CI 与每 4 小时定时采集

网页服务不在用户请求期间抓取第三方价格。采集通过独立 CLI 运行，可由 GitHub Actions、服务器 cron 或任意云调度器触发。

## 服务边界

### Web

- Server Components 默认。
- 读取数据库中的最后有效价格。
- 对公开页面使用缓存和增量再验证。
- 提供订阅、退订及历史确认链接兼容 API。
- 订阅事务提交即响应；成功通知使用订阅行上的持久化待发送状态在响应后投递。
- 不持有第三方登录态，不执行长时间抓取。

### Collector

- 每 4 小时运行一次。
- 按数据源适配器采集。
- 原始响应先存证，再解析和标准化。
- 解析失败不覆盖最后有效记录。
- 指数退避重试三次后发送管理员邮件。
- 每轮生成 `collection_run` 与来源级状态。
- 每轮开始前重试到期的订阅成功通知，兜底处理 Web 进程中断或 SMTP 瞬时失败。

### Database

运行时数据库角色可独立配置：

- `DATABASE_READ_TARGET=local|remote`：公开价格页面的读取目标。
- `DATABASE_WRITE_TARGET=local|remote`：采集、订阅和邮件状态的运行数据库。
- `DATABASE_URL` / `LOCAL_DATABASE_URL`：本地 PostgreSQL。
- `REMOTE_DATABASE_URL`：可选远程运行数据库；未设置时复用同步目标地址。

当前 VPS 使用本地读取和本地写入。本地采集批次结束后，可通过独立同步通道把
公开价格与采集数据作为一个事务一致的完整镜像同步到远程 PostgreSQL。目标事务
会先清空镜像表再写入源库快照，因此也能接管已有不同 UUID 的目标数据。Neon 与
`postgresql` 渠道当前都使用标准 PostgreSQL 协议同步器；渠道名称用于标识服务
类型。远程同步失败不会回滚已经写入本地的数据。

默认同步 `providers`、`products`、`plans`、`sources`、`collection_runs`、
`fx_rates`、`price_observations`、`price_change_events`、
`price_change_candidates`、`api_ranking_state`、`api_ranking_events` 和
`collection_errors`，以及 `model_catalog_imports`、`model_labs`、
`model_catalog_providers`、`model_catalog_models`、`model_provider_offerings`、
`model_catalog_events`。包含邮箱或 token 的订阅与邮件
表不参与同步。

主要实体：

- `providers`
- `products`
- `plans`
- `sources`
- `price_observations`
- `fx_rates`
- `collection_runs`
- `collection_errors`
- `subscribers`
- `subscriptions`
- `subscription_attempts`
- `confirmation_tokens`
- `price_change_events`
- `price_change_candidates`
- `api_ranking_state`
- `api_ranking_events`
- `model_catalog_imports`
- `model_labs`
- `model_catalog_providers`
- `model_catalog_models`
- `model_provider_offerings`
- `model_catalog_events`
- `email_deliveries`

`latest_prices` 不单独存表。当前价由
`price_observations` 按 plan、source、storefront 做 `DISTINCT ON` 读取，
避免双写造成当前价与历史价不一致。

每轮先从 Frankfurter v2 获取人民币基准汇率并写入 `fx_rates`。报价观察同时保存
`converted_cny`、`fx_rate` 与汇率观察时间；原币价未变时只刷新人民币换算，不生成
价格变化事件。

旧 `api_ranking_state` / `api_ranking_events` 作为历史审计保留，但新采集不再写入
API 三榜事件。models.dev 导入以 canonical model 内容哈希识别变化；首次导入只建
基线，后续新增 model 写入 `model_catalog_events`，详情元数据或 provider 价格变化只
触发相应 ISR 失效，不发送邮件。

模型 URL 加入动态 sitemap。总 URL 数不超过 45,000 时 `/sitemap.xml` 直接输出
`urlset`；超过阈值后自动改为 sitemap index，并把 URL 分片到
`/sitemaps/{page}.xml`，避免触碰单 sitemap 的规模上限。

## 目录结构

```text
app/
  (public)/
  api/
components/
  primitives/
  pricing/
  subscription/
  themes/
lib/
  db/
  pricing/
  providers/
  collectors/
  email/
  alerts/
  security/
scripts/
  collect-prices.ts
  seed.ts
tests/
  unit/
  integration/
  e2e/
docs/
design-system/
.github/workflows/
```

## 领域接口

所有采集器实现相同接口：

```ts
interface PriceSourceAdapter {
  id: string;
  collect(context: CollectionContext): Promise<RawCollectionResult>;
  parse(raw: RawCollectionResult): Promise<NormalizedOffer[]>;
  healthCheck(result: NormalizedOffer[]): SourceHealth;
}
```

页面只依赖标准化后的 `NormalizedOffer`，不感知 HTML、JSON、App Store 或人工录入的差异。

## 主题边界

领域数据不得包含视觉类名。主题通过以下三层替换：

1. CSS 语义令牌，例如 `--surface-primary`。
2. 无业务逻辑的 UI primitives。
3. 页面 composition。

更换主题包不修改数据库、采集器、API 响应和价格组件的数据契约。

## 安全

- 退订及历史确认 token 只保存哈希。
- 订阅限流只保存 IP 与邮箱哈希，并通过 PostgreSQL 事务锁保证并发请求一致。
- 新订阅和重复订阅使用相同公开响应，避免通过 API 枚举邮箱关注状态。
- 所有公开写 API 做限流和输入校验。
- 邮件地址标准化后加密或最小化存储。
- SMTP 密钥只存在服务端环境变量。
- 管理员重试入口使用 `CRON_SECRET` 或管理员认证。
- 禁止把登录后结账 URL、会话 cookie 和第三方 token 写入数据库。

## 可移植性

- PostgreSQL 使用标准连接串。
- 读目标、写目标与同步目标相互独立，默认都保持原有单数据库行为。
- 数据同步通道由 `DATA_SYNC_ENABLED`、`DATA_SYNC_CHANNEL`、
  `DATA_SYNC_TARGET` 和 `DATA_SYNC_TARGET_URL` 配置。
- SMTP 使用标准协议。
- 采集 CLI 不依赖 Vercel。
- `/admin` 通过管理员邮箱一次性验证码和签名 HttpOnly Cookie 保护，验证码与
  会话不写入 URL、浏览器本地存储或数据库。
- `/admin/errors` 读取本地运行数据库中的采集错误，支持种类、渠道、状态筛选与
  分页；网络请求会保存脱敏后的重试、底层 cause、HTTP 响应摘要和堆栈。来源恢复
  时关闭未解决错误，同一故障事件只发送一次管理员邮件。
- 生产采集可通过 `COLLECTOR_PROXY_URL` 使用本地 WARP 出站代理；代理不可用时
  自动回退直连，并在诊断详情中记录实际请求路由。
- 部署可从 Vercel + Neon 迁移到 Docker + 任意 PostgreSQL。

## 性能策略

- Server Components 优先，交互组件最小化。
- 首页只加载当前模式需要的数据。
- 价格表客户端按持久化人民币值切换高到低 / 低到高排序。
- 同一轮同一来源、套餐和 storefront 只能有一个报价，冲突时拒绝整条来源写入。
- 新价格先进入 `price_change_candidates`；下一次独立采集仍一致时才写入正式
  observation 和事件，回到原价或变成第三个价格时取消或重置候选。
- 仅在价格变化确认后新增历史事件，相同价格更新 `last_seen_at`。
- 静态图标本地化，避免运行时请求第三方 Logo。
- 动效只使用 `transform` 和 `opacity`。
