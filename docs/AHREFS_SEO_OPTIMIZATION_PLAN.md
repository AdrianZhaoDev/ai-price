# Ahrefs SEO 审计优化开发计划

## 1. 背景与目标

2026-08-14 的 Ahrefs Site Audit 完成了 2,311 个内部页面和 28 个资源的抓取。
站点 Health Score 为 100%，没有 4xx、断链、robots.txt 阻断、重定向链或社交标签
错误，但报告仍暴露出影响抓取效率、索引信号和尾部响应时间的问题：

- 27 个慢页面；95 个页面的 TTFB 超过 500ms，部分索引页在审计时达到 23–29 秒。
- 1,580 个 `noindex, follow` 参数页，主要来自 API 目录筛选、模型和分页查询。
- 4 个可索引落地页只有 1 条 dofollow 内链：Gemini Pro 与 DeepSeek 的中英文页。
- 17 个可索引页面的描述过短、5 个过长，另有 1 个标题过短、1 个过长。

本次目标是在不改变价格数据一致性、CI 产物安全边界和中英文路由行为的前提下，
降低公开页面尾部延迟，减少搜索引擎发现无索引参数页的机会，补强重点落地页内链，
并把可索引页面的标题和描述统一到稳定范围。

## 2. 约束与设计决策

### 2.1 保留运行时渲染

公开价格页继续由生产运行时读取数据库。CI 构建没有生产数据库访问权限，不能把 seed
目录预渲染为正式价格页面。因此本次不移除根布局的动态语言解析，也不把固定公开路由
改成构建期静态页面。

### 2.2 在源站代理建立受控微缓存

Nginx 仅缓存满足全部条件的公开请求：

- 方法为 `GET` 或 `HEAD`；
- 没有查询参数；
- 没有 Cookie；
- 没有 Authorization；
- 路径不属于后台、API 或订阅结果，也不匹配独立的 `pricing-data` 与静态资源 location。

缓存键包含完整 `Accept-Language`，避免自动语言跳转被错误复用。上游 `Set-Cookie`
响应禁止写入缓存。缓存有效期为 15 分钟，启用缓存锁、后台更新和错误时 stale 回退；
浏览器与 Cloudflare 仍收到 `no-store`，所以 HTML 共享缓存只存在于受控 VPS Nginx。
版本化 `pricing-data` 和静态资源继续保留应用原有的共享或 immutable 缓存头。

部署时清空精确的站点微缓存目录，避免新 release 短暂返回旧 HTML。Nginx access log
增加缓存状态字段，发布验收连续请求同一 canonical 页面并要求出现 `HIT`。

### 2.3 参数页继续 noindex

`/api-pricing` 的筛选参数对用户有用，但不构成独立搜索落地页。继续保留现有 canonical
和 `noindex, follow`，不加入 sitemap，也不使用 robots.txt 阻断。站内指向这些筛选
状态的链接增加 `nofollow` 并关闭 Next.js 预取，降低抓取和无效预热压力，同时保留正常
点击、复制链接和新窗口打开能力。

### 2.4 只修真实的可索引内容问题

Ahrefs 对中文 H1 的字符阈值会产生大量低价值提示，本次不批量扩写 2,088 个短 H1。
只修复可索引页面的标题与描述，并通过测试约束标题不超过 60 字符、描述保持在
100–155 字符。

## 3. 实施范围

### 3.1 性能与可观测性

- 在 `deploy/vps-install.sh` 添加公开页面 Nginx 微缓存配置、精确缓存清理和
  `upstream_cache_status` JSON 日志字段。
- 在 `deploy/vps-update.ps1` 增加 canonical 页面预热后再次请求并要求 `HIT` 的
  验收，确保发布后缓存真实可用。
- 扩展 `scripts/warm-model-pages.ts`，除模型详情和 API 目录外，预热中英文首页、
  国内订阅页、发布追踪页以及全部中英文 SEO 落地页。
- 同步更新 `docs/VPS_OPERATIONS.md` 的缓存边界、发布过程、验收和回滚说明。

### 3.2 抓取预算

- 模型详情中的 provider 筛选链接增加 `rel="nofollow"` 与 `prefetch={false}`。
- SEO 落地页中的筛选 CTA、模型筛选链接增加相同属性。
- API 目录的参数化分页链接增加相同属性。
- 保持参数页 canonical、`noindex, follow` 和 sitemap 规则不变。

### 3.3 内链

- 把 `gemini-pro-price` 纳入全球价格首页的价格索引，形成首页与 Gemini 父页面两条
  上下文内链；中英文路径同时生效。
- 保留 API 目录与模型发布追踪页到 `deepseek-price` 的链接，增加测试防止回归。

### 3.4 元数据

- 重写三种主模式的中英文标题和描述，使标题不超过 60、描述位于 100–155 字符。
- 文档页 metadata 对过长描述做 155 字符截断，对过短描述补充具体且稳定的来源、
  更新与边界说明。
- SEO 落地页描述最低长度从 70 提升到 100，并保持 155 上限。
- 保留模型详情标题与描述的内容公式，只对最终描述统一执行 100–155 字符规范化，
  防止短模型摘要产生新的长度问题。

## 4. 测试计划

### 4.1 针对性测试

- SEO 单元测试：所有主模式、文档和落地页的标题/描述长度、canonical、robots。
- 内链单元测试：Gemini Pro 出现在全球首页索引；DeepSeek 保留两个 canonical 来源。
- Nginx 配置测试：缓存仅位于公开 location，查询/Cookie/鉴权可绕过，私有路由不缓存，
  access log 包含缓存状态。
- 预热脚本测试：核心 canonical 路径、全部中英文落地页和模型详情均进入预热队列。
- Playwright SEO/E2E：参数链接带 `nofollow` 且仍可导航；重点落地页直接内链可见。

### 4.2 强制质量门禁

```text
git diff --check
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npx next build --webpack
npm run test:e2e -- <相关 spec>
```

## 5. 发布、验收与回滚

发布必须使用当前 `main` 提交对应且完整 CI 成功的 `production-release` artifact，按
`docs/VPS_OPERATIONS.md` 执行 `deploy/vps-update.ps1`。发布后除既有 Web、Nginx、
PostgreSQL、timer、日志和公网检查外，还要验证：

- 相同 canonical URL 连续请求的第二次 `X-Cache-Status` 为 `HIT`；
- 带查询参数、Cookie 或 Authorization 的请求不出现 `HIT`；
- `/admin`、`/api`、`/subscription`、`/en/subscription` 保持 `private, no-store`，
  `pricing-data` 与静态资源保留原有共享缓存头；
- 中英文首页、Gemini Pro、DeepSeek、API 目录和代表性模型详情均返回 200；
- HTML 中标题、描述、canonical、robots 和重点内链符合本计划。

如应用版本需要回滚，按运维手册原子切换旧 release；当前通用 Nginx 微缓存配置可以
继续使用，但切换后必须清空精确的 `/var/cache/nginx/ai-price-public` 目录并验证配置，
避免跨版本缓存。此次不包含数据库 schema 或数据迁移，数据库只做发布前例行备份。

## 6. 完成标准

- 本文档列出的代码、测试、文档和生产验收全部完成。
- 本地强制质量门禁与相关 E2E 全部通过。
- PR CI 全绿，Codex 机器人审核完成且没有未解决的有效意见。
- PR 合并到 `main`，生产部署使用对应成功 artifact。
- 生产服务、数据、timer、日志、缓存和代表性页面全部验收通过。
- 后续 Ahrefs 重爬目标：索引页慢页面归零、4 个单入链问题归零、可索引标题和描述
  长度问题归零；参数页仍保持 noindex，但新增发现量和抓取耗时下降。
