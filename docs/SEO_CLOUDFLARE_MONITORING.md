# SEO 与 Cloudflare 持续观察手册（AI 必读）

本文用于发布后持续观察 `https://lowpriceradar.com` 的搜索可见性、DNS、TLS、
Cloudflare 边缘缓存和安全状态。它只规定观察与诊断；任何生产修改仍必须完整执行
[`VPS_OPERATIONS.md`](VPS_OPERATIONS.md)。

## 1. 固定目标

| 项目           | 目标                                                 |
| -------------- | ---------------------------------------------------- |
| 主站           | `https://lowpriceradar.com`                          |
| 规范化         | HTTP、`www`、`ai` 一跳 301 到主站并保留路径/查询参数 |
| Cloudflare SSL | Full (strict)                                        |
| TLS            | 最低 1.2，支持 1.3，SSL Labs A/A+                    |
| DNS            | Cloudflare 代理开启，DNSSEC 有效                     |
| 公共页面       | 200、可索引、自引用 canonical、在 Sitemap 中         |
| 私有页面       | noindex，并且 `private, no-store`                    |
| HTML 缓存      | 默认动态；只对确认无用户态的页面单独评估             |
| 静态资源       | `/_next/static/` 长缓存、immutable                   |

## 2. 当前生产基线

2026-07-30 已完成：

- Cloudflare Full (strict)、Minimum TLS 1.2、TLS 1.3、HTTP/3、Brotli；
- HSTS 6 个月并包含子域，未启用 preload；
- Early Hints、Crawler Hints 已启用；
- Speed Brain、Rocket Loader、0-RTT 保持关闭，避免 beta 预取、脚本改写和请求重放风险；
- 根域已配置空 MX、`v=spf1 -all` 与严格 DMARC，明确该域不接收或发送邮件；
- 源站使用 Let's Encrypt ECDSA 证书，覆盖主域、`www`、`ai`；
- HTML 保持 `DYNAMIC`，静态资源继续按文件哈希和源站缓存头处理；
- Ahrefs 站点指标接口当前返回 `Insufficient plan`，不能把它解释成指标为零。

DNSSEC 已在 Cloudflare 开启，但在 Dynadot 写入 DS 前仍是“挂起”，此时不能写成
“已生效”。待写入的公开 DS 参数是：

```text
Key tag: 2371
Algorithm: 13 (ECDSAP256SHA256)
Digest type: 2 (SHA-256)
Digest: C250DDD4F1A0C15295631D355D938BDEE1AC8AB63D295F433DC584C5275E833A
```

Dynadot 保存后等待父区传播，再用 `dig +short DS lowpriceradar.com` 和 DNSViz
确认验证链完整。若 DS 参数与 Cloudflare 当前面板不一致，以面板最新值为准。

## 3. 每次发布后的即时检查

```bash
curl -fsS -I https://lowpriceradar.com/
curl -fsS -I https://lowpriceradar.com/china-ai-subscriptions
curl -fsS -I https://lowpriceradar.com/api-pricing
curl -fsS https://lowpriceradar.com/robots.txt
curl -fsS https://lowpriceradar.com/sitemap.xml
curl -fsS -I https://lowpriceradar.com/admin
curl -fsS -I https://lowpriceradar.com/api/admin/session
```

检查点：

- 三个公共页面返回 200；
- `robots.txt` 不得用 `/api` 前缀误伤 `/api-pricing`；
- Sitemap 包含三个价格入口、采集方法和隐私页；
- 每个页面 HTML 都有唯一 title、description 和自引用 canonical；
- 公共响应包含 CSP、`nosniff`、`DENY`、Referrer-Policy；
- `/admin/`、`/api/`、`/subscription/` 包含 `no-store` 和 `X-Robots-Tag`；
- 边缘响应包含 HSTS，且 `server: cloudflare`；
- `www`、`ai`、HTTP 入口只有一次 301。

## 4. 每周 SEO 观察

优先使用 Google Search Console 和 Bing Webmaster Tools：

1. 检查已编入索引页面数，目标至少覆盖 Sitemap 中所有公开页面。
2. 查看“已发现但未编入索引”“已抓取但未编入索引”“重复网页”。
3. 观察最近 7 天和前 7 天的点击、展示、CTR、平均排名。
4. 按页面和查询查看变化，避免只看全站平均值。
5. 检查 Core Web Vitals、HTTPS、移动可用性和结构化数据报告。
6. 新页面发布后提交 Sitemap；不要每天反复请求索引。

重点解释：

- 展示增长、点击暂未增长：通常先优化标题/描述与搜索意图匹配；
- 排名 4–20 且展示稳定：优先补充页面正文、FAQ、内部链接和数据更新时间；
- 已抓取但未收录：检查内容是否过薄、重复或只有交互没有独立文本；
- 突然大量掉页：先检查 robots、canonical、noindex、5xx 和重定向链；
- 品牌词被“雷达硬件”占据：持续强化 `Low Price Radar · AI 价签` 品牌关联。

## 5. Ahrefs 使用

项目 MCP 名称为 `ahrefs`。当前套餐可能对 DR、外链、自然关键词等接口返回
`Insufficient plan`，必须把“无数据”和“指标为零”区分开。

权限可用时，每月记录：

- Domain Rating、引用域、dofollow 引用域；
- 自然关键词总数、Top 3/10/20 数量；
- 估算自然流量和 Top Pages；
- 新增/丢失引用域；
- 与 AI 订阅/API 价格站点的关键词差距。

不要为了增加外链购买垃圾链接。优先来自 GitHub、技术文章、产品目录和真实引用。

## 6. Cloudflare 每周观察

通过 Cloudflare MCP 或控制台检查：

- Zone 状态、DNSSEC、证书有效期、Minimum TLS、Full (strict)；
- 请求量、带宽、缓存命中率、源站流量、4xx/5xx；
- WAF/安全事件中被拦截的规则、来源和误报；
- Bot 流量和异常爬虫；
- Cache Rules、Redirect Rules、Configuration Rules 的最近变更；
- Certbot 与边缘证书距离过期是否少于 14 天。
- Cloudflare 官方 IP 清单与 UFW 80/443 allow 规则是否一致。

缓存判断：

- `CF-Cache-Status: HIT` 适合带内容哈希的静态资源；
- HTML 保持 `DYNAMIC` 不代表故障；
- 如果启用公开 HTML 缓存，必须先证明没有 Cookie、登录态、RSC 变体或后台内容；
- 私有路径出现 `HIT` 是 P0 事故，应立即绕过缓存并清除对应缓存。

建议告警阈值：

- 公网 5xx 连续 5 分钟超过 1%，或任一核心页面连续 3 次非 200：立即处理；
- 源站证书剩余不足 14 天、Cloudflare 边缘证书状态非“有效”：立即处理；
- 静态资源连续两次请求仍非 `HIT`：检查缓存键、响应头和是否刚发布；
- HTML、后台或 API 意外 `HIT`：按 P0 处理；
- 搜索点击或展示较前 7 天下降超过 30%：先排查索引与技术问题，再判断季节波动；
- Core Web Vitals 的 LCP 超过 2.5 秒、INP 超过 200 毫秒、CLS 超过 0.1：建立优化任务。

## 7. 每月 TLS/DNS 检查

```bash
dig +short NS lowpriceradar.com
dig +short DS lowpriceradar.com
curl -fsS -I --http2 https://lowpriceradar.com/
openssl s_client -connect lowpriceradar.com:443 \
  -servername lowpriceradar.com </dev/null
```

同时运行 SSL Labs。目标：

- 评分 A 或 A+；
- 不支持 TLS 1.0/1.1；
- TLS 1.2/1.3 正常；
- HSTS 存在；
- 证书域名覆盖主域、`www`、`ai`；
- DNSSEC 返回有效 DS。

CAA 当前有意不设置：Cloudflare Universal SSL 的托管签发机构可能变化，过度限制
CAA 可能阻断边缘证书自动续期。若未来改用固定 CA，再按 Cloudflare 与源站两个
证书链同时评估。

## 8. 发布后 2/7/28 天观察节奏

- 第 2 天：确认 Sitemap 可抓取、核心页面无 noindex、Cloudflare 无 5xx 激增；
- 第 7 天：记录首次 Search Console 查询/页面数据和缓存命中率，不因样本小下结论；
- 第 28 天：对比前后 28 天的展示、非品牌词、Top 10/20 关键词和 Core Web Vitals；
- 只有趋势连续两个观察窗口一致，才把变化归因于本次优化。

SEO 生效通常比 DNS/TLS 慢。DNS、TLS 和响应头应在分钟级验证；抓取和索引以天为
单位；稳定的排名与点击趋势通常至少观察 2–4 周。

## 9. 基线记录模板

每次重大 SEO/Cloudflare 变更，在任务或工单记录：

```text
日期：
生产提交：
CI Run：
公开页面状态：
索引页面数：
近 7 天点击/展示/CTR/平均排名：
Ahrefs DR/关键词/引用域（或套餐不可用）：
SSL Labs：
DNSSEC：
Cloudflare 缓存命中率：
Cloudflare 4xx/5xx：
证书到期日：
异常与下一步：
```

不要把 Cloudflare token、数据库连接串、SMTP 密码或 `/etc/ai-price.env` 内容写入
记录。
