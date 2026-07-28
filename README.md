# AI Price Atlas

面向国内用户的 AI 官方价格参考与价格变动订阅服务。

首版覆盖三类价格：

1. ChatGPT、Gemini、Claude、Grok 的 App Store 跨区订阅价格。
2. 国内热门 AI 产品的官方会员订阅方案。
3. 没有消费者订阅方案的平台，其官方 API 价目表。

项目以“来源可追溯、价格有时间戳、失效不覆盖旧数据”为基本原则。页面只读取已经验证和持久化的数据，采集任务每 4 小时运行一次，失败会向管理员发送告警。

## 文档

- [产品范围](docs/PRODUCT.md)
- [技术架构](docs/ARCHITECTURE.md)
- [数据源与采集](docs/DATA_SOURCES.md)
- [UI 与主题系统](docs/UI.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md)
- [测试策略](docs/TESTING.md)
- [邮件系统](docs/EMAIL.md)
- [部署说明](docs/DEPLOYMENT.md)
- [VPS 生产运维更新流程（AI 必读）](docs/VPS_OPERATIONS.md)
- [SMTP 邮件配置教程](docs/SMTP_SETUP.md)

## 快速开始

```bash
npm install
npm run local:setup
npm run dev:local
```

本机测试环境使用 Docker PostgreSQL，并固定使用 `55432` 数据库端口与 `3100`
网页端口，避免占用常见的 `5432` 和 `3000`。`.env.local` 只用于本机且不会提交。
页面启动后访问 <http://127.0.0.1:3100>。

连续运行两轮真实采集并检查来源成功率、报价数量漂移、重复观测和数据库状态：

```bash
npm run test:stability
```

邮件不是本机页面与采集测试的依赖，SMTP 留空即可。未配置数据库时，页面仍会使用已核验的只读 seed，订阅流程使用进程内存和 JSON 邮件预览。生产环境需复制 `.env.example`、配置 PostgreSQL 与 SMTP，然后执行：

```bash
npm run db:migrate
npm run seed
npm run collect
```

## 当前实现

- 4 个海外应用、46 个 App Store storefront。
- 215 个采集来源、连续两轮稳定解析 884 条报价；外币按同轮汇率快照换算人民币。
- 15 个国内订阅来源，包含 GLM Coding、Comate、Qoder、TRAE、CodeBuddy、MiMo、华为 MaaS 和 SenseNova。
- 16 个国内 API 平台，新增 MiMo、百川、LongCat、SiliconFlow、华为 MaaS 与中国电信 TeleAI。
- 每 4 小时 GitHub Actions、人民币最低三档变化邮件、管理员故障告警。
- 本地 PostgreSQL 主写，支持采集完成后向 Neon/PostgreSQL 异步同步，并可配置
  页面读取和运行写入目标。
- Vitest 覆盖率门槛与桌面 / 手机 Playwright smoke。

文档是实现的约束来源；实现变化时需同步更新对应文档。
