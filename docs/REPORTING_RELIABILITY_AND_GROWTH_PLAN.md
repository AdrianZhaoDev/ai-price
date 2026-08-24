# 报告质量、采集恢复与 SEO 增长计划

## 2026-08-24 基线

| 范围                       | 当前证据                                                                      | 解释                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Google Search Console 效果 | 59 点击、1,010 展示、CTR 5.8%、平均排名 19.2                                  | 控件实际只有 23 个数据日，是滚动快照，不作为完整 28 天比较。                                        |
| GSC 网页索引               | 80 已收录、702 未收录、680 discovered-not-indexed                             | 与上次索引更新相比，已收录 +23、未收录 -16、抓取未收录 -13、404 -5、noindex +2、备用 canonical +1。 |
| Ahrefs                     | 2026-08-21 Site Audit 因 crawl credits 耗尽失败；最新完成 crawl 为 2026-08-14 | 历史 Health 100 / Errors 0 不能写成当前值。                                                         |
| Cloudflare                 | Dashboard 与 HTTP Traffic 的请求聚合不一致；Web Analytics 样本不足            | 边缘请求、国家分布和 Nginx 请求都不等于真人访问。                                                   |

## 已实现边界

- Kimi 月付通过公开表头定位，支持 CNY 与 USD；Huawei MaaS 对思考/非思考价格分别记录，
  并以模型与价格类型而非单一 offer 数量保护完整性。
- TRAE 不再请求已失效的公开 JSON endpoint；无免登录价格载荷时保持最后有效报价并报告
  `ACCESS_BLOCKED`。
- `npm run audit:public-seo` 低并发校验 Sitemap、HTTP、title、description、canonical、
  noindex、Dataset/ItemList JSON-LD、重复元数据和响应耗时。超时是“尚在处理”。
- 目录浏览资格与搜索收录资格分离：没有价格信号或可搜索详情的模型可继续浏览，但不进入
  Sitemap，详情页返回 `noindex, follow`。

## 观测与隐私

生产启用时，Cloudflare Zaraz 使用原生 CMP，并创建唯一的“匿名分析”目的。该目的必须
绑定 Zaraz 工具并默认 opt-in；代码只提供“管理隐私偏好”入口，调用原生
`showConsentModal()`，不保存自定义 cookie/localStorage，也不写入数据库。现有五个事件
只允许模式、Provider、订阅范围、排序方向和枚举结果，禁止邮箱、token、自由文本、URL
和查询参数。

日报必须单列 GSC、Bing、Cloudflare Web Analytics、Security Analytics、Nginx、Zaraz、
Ahrefs 与内部 SEO 审计的可用性和最后成功时间。外部登录或套餐不足一律标“不可用”，
不转写为 0。

## SEO 增长工作

- API 目录补充可见 FAQ 和 FAQPage，解释每百万 Token 的输入、缓存输入、输出价格、
  官方来源与参数页 noindex；中文与英文目录互为 canonical/hreflang 的稳定入口。
- Google AI Pro 页面补充名称、变体、地区价和官方来源 FAQ，并与 API 目录建立普通
  双向链接。参数型 CTA 继续 `nofollow`，不作为搜索目标。
- 先按内部审计和 GSC 分层抽样 680 个 discovered-not-indexed URL，再通过收录资格筛选
  降低低价值模型页进入 Sitemap 的机会；不批量重写 robots、canonical 或手动请求索引。

## 验收与发布

测试覆盖解析成功/缺字段/套餐减少/异常金额、搜索资格、Sitemap 与 metadata、审计超时、
Zaraz 偏好入口和匿名事件字段。完成本地质量门禁、PR CI 与审核后，生产发布必须使用
合并后 main 的成功 artifact，并复验 219 个 regular 来源、核心页面、缓存、CMP 与事件。
Hunyuan 当前数据库写入故障需先按采集错误手册完成只读诊断和备份/回滚评估，不与本计划
中的网页解析修改混合处理。
