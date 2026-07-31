# SEO 与 Cloudflare 持续观察手册（AI 必读）

本文用于发布后持续观察 `https://lowpriceradar.com` 的搜索可见性、DNS、TLS、
Cloudflare 边缘缓存和安全状态。它只规定观察与诊断；任何生产修改仍必须完整执行
[`VPS_OPERATIONS.md`](VPS_OPERATIONS.md)。

每日 15:00 的自动检查应执行独立流程
[`DAILY_MONITORING_WORKFLOW.md`](DAILY_MONITORING_WORKFLOW.md)。本文保存长期基线、
判断规则和观察方法；独立流程规定每次任务具体检查什么、如何分级以及怎样提交日报。

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
| SEO 数据       | Search Console 已验证，Sitemap 已提交                |
| 访问数据       | Cloudflare Web Analytics/RUM 或等价分析已启用        |
| 外链数据       | Ahrefs 域名已验证；不可用时明确写数据缺口            |

## 2. 当前生产基线

2026-07-30 已完成：

- Cloudflare 手动 Full (strict)（自动模式关闭）、Minimum TLS 1.2、TLS 1.3、
  HTTP/3、Brotli；
- HSTS 6 个月并包含子域，未启用 preload；
- Early Hints、Crawler Hints 已启用；
- Speed Brain、Rocket Loader、0-RTT 保持关闭，避免 beta 预取、脚本改写和请求重放风险；
- 根域已配置空 MX、`v=spf1 -all` 与严格 DMARC，明确该域不接收或发送邮件；
- 源站使用 Let's Encrypt ECDSA 证书，覆盖主域、`www`、`ai`；
- HTML 保持 `DYNAMIC`，静态资源继续按文件哈希和源站缓存头处理；
- SSL Labs 四个 Cloudflare IPv4/IPv6 边缘端点均为 A+，只支持 TLS 1.2/1.3；
- `/_next/static/` 静态资源已验证首次 `MISS`、再次访问 `HIT`，并带一年
  `immutable` 缓存；
- DNSSEC 已在 Dynadot 和 Cloudflare 完整启用，`.com` 父区、1.1.1.1 与 8.8.8.8
  均返回匹配的 DS，递归验证返回 `ad` 标志；
- Ahrefs 站点指标接口当前返回 `Insufficient plan`，不能把它解释成指标为零。

2026-07-31 数据测量基线：

- Google Search Console 域名资源已通过 Cloudflare DNS 自动验证；
- `https://lowpriceradar.com/sitemap.xml` 已提交成功，Google 首次读取发现 5 个页面；
- Search Console 新资源正在处理首批索引与效果数据，控制台提示约 1 天后可查看；
- Ahrefs 项目已通过 DNS TXT 验证，首次 Site Audit 已开始抓取；
- Ahrefs 初始基线为 DR 0、250 个引用域（30 天变化 +57）、自然流量 0、自然关键词
  0；这是项目刚建立时的 Ahrefs 当前值，不代表 Search Console 指标；
- Cloudflare Web Analytics/RUM 已全球启用，公开 HTML 已确认注入
  `cloudflareinsights` beacon，首批数据需要等待真实访问产生；
- Cloudflare 动态重定向规则 `WWW 直达 HTTPS 主域（单跳）` 已启用；
  `Always Use HTTPS` 为避免 `http://www` 两跳而关闭，HTTP 主域和 `ai` 继续由
  Nginx 一跳到规范 HTTPS 主域；
- 项目代码未发现 Google Analytics、Plausible、Umami、PostHog 或 Clarity；
- Nginx access log 可用于请求级估算，但不能替代用户、会话和参与度分析；
- 因 Cloudflare 代理和静态缓存存在，源站日志既可能看到边缘 IP，也可能遗漏缓存
  命中请求，所有“访客”字段必须标为估算。

2026-07-31 验证生效的公开 DS 参数是：

```text
Key tag: 2371
Algorithm: 13 (ECDSAP256SHA256)
Digest type: 2 (SHA-256)
Digest: C250DDD4F1A0C15295631D355D938BDEE1AC8AB63D295F433DC584C5275E833A
```

后续检查必须同时确认 DS 值没有漂移，并用 `dig +dnssec lowpriceradar.com A
@1.1.1.1` 检查响应 flags 中存在 `ad`。若 DS 参数与 Cloudflare 当前面板不一致，
不得直接覆盖；先确认是否发生了正常密钥轮换。

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

移动浏览器的紧凑地址栏可能只显示域名而隐藏路径。看到站内 404 时，不得只凭截图
判断首页宕机；先同时请求 `/`，再从 Nginx access log 核对实际请求路径。字面量
`/*` 是无效路径，保持 404 比重定向到首页更符合 SEO，避免产生 soft 404。

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

### 4.1 收录报告的固定口径

每次报告按以下顺序列证据：

1. Sitemap URL 总数和 URL 清单；
2. Search Console 已收录与未收录分类；
3. 最近一次 Googlebot/Bingbot 抓取核心 URL 的时间和状态码；
4. `site:` 查询只作为公开可见性抽查。

没有 Search Console 时，不得写“收录 0”。可以写“公开 `site:` 抽查未发现结果，
精确收录数待 Search Console 验证”。新站上线后的前 2–4 周不因短期无结果频繁改
canonical、robots 或 Sitemap。

### 4.2 搜索表现的固定口径

- 日报展示最近完整 7 天对前 7 天、最近完整 28 天对前 28 天；
- 总量之外必须列 Top 10 查询和页面，以及增长/下降 Top 5；
- 查询分品牌词、产品/模型词、AI 订阅词、API 价格词；
- 新站样本过小时报告绝对值，不放大百分比；
- 只有连续两个窗口方向一致，才判断为趋势。

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

### 6.1 访问分析口径

Cloudflare HTTP 流量表示边缘请求，不等于真人访问。Cloudflare Web Analytics/RUM
或独立分析工具才用于访客、页面浏览、来源、设备和 Core Web Vitals。Nginx 日志只
用于交叉验证公共 HTML 请求、状态码、来源和异常路径。

日报至少分开报告：

- 边缘总请求与缓存命中；
- 公共 HTML 页面浏览估算；
- 浏览器型非爬虫页面浏览估算；
- 搜索引荐请求；
- 已验证搜索爬虫、未验证爬虫 UA 和恶意扫描；
- 无法测量的会话、参与度和转化。

国家/地区请求量往往包含机器人和扫描器，不得称为“用户地区”。设备和浏览器只有
RUM/Analytics 数据可用时才写分布。

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

## 10. 观察频率

| 频率             | 范围                                                              |
| ---------------- | ----------------------------------------------------------------- |
| 每天 15:00       | 可用性、重定向、安全头、缓存、DNSSEC、服务、timer、证书、错误日志 |
| 每周一           | Search Console、Cloudflare 7 日趋势、索引异常、CWV                |
| 每月第一个工作日 | SSL Labs、Ahrefs、Cloudflare IP/UFW、证书与 DNS 配置漂移          |
| 发布后           | 立即执行第 3 节，并按第 8 节执行 2/7/28 天观察                    |

每日任务只能读取和报告。即使发现 P0，也不得自动修改 DNS、Cloudflare、Nginx、
systemd、数据库或生产文件；应在报告中给出证据、影响和建议动作，等待人工授权。
