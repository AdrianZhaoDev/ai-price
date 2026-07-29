# 采集项目增删手册（AI）

“采集项目”指一个目录产品及其 adapter 来源。开始前阅读
[`DATA_SOURCES.md`](DATA_SOURCES.md)；上线前完整阅读
[`VPS_OPERATIONS.md`](VPS_OPERATIONS.md)。

## 1. 新增采集项目

1. 只选择无需登录、可重复访问的官方公开页面、官方公开 JSON 或 App Store。
   第三方媒体只能用于发现线索，不能作为价格来源。
2. 在 `lib/data/catalog.ts` 新增目录项和基础报价，保证 `id`、`providerSlug`、
   `productSlug` 一致且长期稳定。
3. 实现并注册 adapter：
   - App Store：修改 `lib/collectors/registry.ts`，必要时补
     `lib/collectors/adapters/app-store.ts` 的 canonical plan 映射；
   - 官方订阅页：在 `lib/collectors/adapters/official-pages.ts` 增加解析器、adapter，
     并加入 `officialPageAdapters`；
   - API 价目：平台规则放入
     `lib/collectors/adapters/api-pricing/rules.ts`，共享逻辑才放 `shared.ts`。
4. adapter 必须实现 `id`、`providerSlug`、`sourceUrl`、`parserVersion`、
   `collect`、`parse`、`healthCheck`，并输出完整 `NormalizedOffer`。
5. 添加脱敏 fixture 和测试：成功、缺字段、套餐增删、异常币种/周期。更新
   `docs/DATA_SOURCES.md`。
6. 普通新增项目不需要 migration；只有 schema 变化才运行
   `npm run db:generate` 并审查生成 SQL。

本地验证：

执行 `seed` 和稳定性检查前，确认 `DATABASE_URL` 指向本地测试库；不得对生产数据库执行以下本地验证命令。

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run seed
npm run collect -- --source=<完整-adapter-id>
npm run test:stability
```

## 2. 删除采集项目

先确认删除范围是整个产品、单个 adapter，还是 App Store storefront。不得用模糊
字符串批量删除。

代码侧：

1. 从 `lib/collectors/registry.ts` 或 `officialPageAdapters` 移除注册；
2. 从 `lib/data/catalog.ts` 移除不再展示的产品；
3. 仅在没有其他来源复用时删除解析器、规则、fixture 和测试；
4. 更新 `docs/DATA_SOURCES.md` 及受影响的数量、稳定性断言。

数据库历史不会因删除代码自动消失。默认采用逻辑停用并保留审计历史：

- 将对应 `sources.enabled`、`products.enabled` 设为 `false`；
- 将对应 `plans.active` 设为 `false`；
- 通过可审查、可重复执行的 migration 完成，并同步调整稳定性检查只统计启用来源。

只有用户明确要求删除历史数据，并已完成本地与 Neon 备份、影响范围核对和回滚方案
后，才可硬删除 provider/product/source。不得直接在生产执行无备份的 `DELETE`。

## 3. 上线验收

按 [`VPS_OPERATIONS.md`](VPS_OPERATIONS.md) 提交、CI、部署。部署脚本会运行 seed；
不要手工修改当前 release。

新增后必须确认：

- 精确 adapter 采集成功，报价与官网一致；
- 全量 run 的来源数、成功数和目录数量符合预期；
- Neon 同步成功，后台没有新错误。

删除后必须确认：

- registry 不再生成目标 adapter；
- 页面不再展示目标项目；
- timer 不再采集目标来源；
- 历史数据按选择被停用保留或经授权删除；
- 本地与 Neon 状态一致。
