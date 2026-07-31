# 开发计划

## 阶段 0：文档与约束

- [x] 产品范围
- [x] 架构决策
- [x] 数据源矩阵
- [x] UI 与主题规范
- [x] 测试策略
- [x] 邮件和部署约定

## 阶段 1：应用骨架

- [x] Next.js 16 + TypeScript strict
- [x] ESLint、Prettier、Vitest、Playwright
- [x] 主题令牌与基础 primitives
- [x] Drizzle schema 与本地 seed fallback
- [x] 三种价格模式与响应式布局

验收：无需数据库也能通过 seed 数据渲染完整页面，主题可切换。

## 阶段 2：价格领域

- [x] 标准化价格类型
- [x] 套餐映射
- [ ] 汇率换算
- [x] 当前价和历史价 repository
- [x] 官方链接与 freshness 状态

验收：三种模式不能错误混排，原始价格与派生价格可追溯。

## 阶段 3：采集

- [x] 静态 HTML adapter
- [x] App Store adapter
- [x] DeepSeek、Kimi、MiniMax、StepFun 首批 adapter
- [x] fixture 与 parser 测试
- [x] 每日两次 CLI 调度
- [x] stale 与异常检测

验收：模拟页面变更时不覆盖最后有效值，并生成告警事件。

## 阶段 4：邮件

- [x] SMTP transport
- [x] 邮件模板
- [x] 订阅默认生效与后台成功通知邮件
- [x] 退订
- [x] 价格变更通知
- [x] 管理员故障告警

验收：使用本地测试 SMTP 完成全链路。

## 阶段 5：测试与 CI

- [x] 单元测试
- [x] 适配器契约测试
- [ ] API 集成测试
- [x] Playwright 移动端与桌面 smoke
- [x] 覆盖率行/分支不低于 70%
- [x] GitHub Actions CI
- [x] GitHub Actions 每日采集工作流

## 阶段 6：交付

- [x] 性能与可访问性检查
- [x] 视觉 QA
- [ ] 部署文档实测
- [ ] SMTP 配置说明实测
- [x] 环境变量模板
- [ ] 完成需求逐项审计

## 文档同步规则

- Schema 变化更新 `ARCHITECTURE.md`。
- 数据源或解析策略变化更新 `DATA_SOURCES.md`。
- 主题和组件契约变化更新 `UI.md`。
- 环境变量或部署流程变化更新 `DEPLOYMENT.md`。
- 测试门槛变化更新 `TESTING.md`。
