# AGENTS.md

## 强制开发、审核与发布流程

本项目的每一次代码开发都必须完整执行以下流程，不得直接在主仓库或 `main` 上修改、
提交或发布：

1. 开始前运行 `git worktree list --porcelain`、`git status --short --branch` 和
   `git rev-parse --show-toplevel`，确认当前目录是为本次任务新建的独立工作树。
   如果不是独立新工作树，必须先从主仓库创建新的工作树再继续；发现未知修改时停止，
   不得覆盖、清理或带入本次分支。
2. 获取最新 `origin/main`，从它新建 `codex/<任务说明>` 开发分支。不得从陈旧提交、
   其他功能分支或本地未合并的 `main` 开始。
3. 完成代码和文档后，必须在本地执行与改动相称的针对性测试，并至少执行
   `git diff --check`、`npm run format:check`、`npm run lint`、
   `npm run typecheck`、`npm run test:coverage` 和
   `npx next build --webpack`；涉及用户交互时还必须执行相关 Playwright E2E。
   任一检查失败不得发起合并。
4. 只提交本次任务文件，推送开发分支并向 `main` 发起 PR。PR 必须说明变更、原因、
   影响、迁移或回滚风险以及已执行的验证。
5. PR 发起后必须等待 GitHub CI 全部成功，并等待 PR 的 Codex 机器人完成审核。
   必须逐条检查未解决的审核线程；所有可执行意见均须修复、重新验证、推送并等待复审。
   存在失败检查、Codex 审核未完成、未解决的有效意见或合并冲突时，禁止合并。
6. 审核和检查全部通过后才可把 PR 合并到 `main`。合并后必须在干净的 `main`
   工作区获取并核对远端合并提交，不得从开发分支直接部署。
7. 需要更新生产环境时，合并完成后继续完整执行本文件的“VPS 生产环境更新规则”
   以及 [`docs/VPS_OPERATIONS.md`](docs/VPS_OPERATIONS.md)；发布必须使用该
   `main` 提交对应且结论为成功的 GitHub Actions 生产构建产物，并完成全部生产验收。

## VPS 生产环境更新规则

本项目的生产环境位于 SSH 别名 `american-vps` 对应的 VPS，当前通过
`https://lowpriceradar.com` 提供服务。

任何代理或维护者执行生产环境部署、代码更新、环境变量修改、SMTP 配置、数据库
迁移、定时采集调整、Nginx 修改、域名接入、HTTPS 配置、回滚或故障排查之前，
必须先完整阅读并严格遵循
[`docs/VPS_OPERATIONS.md`](docs/VPS_OPERATIONS.md)。

`docs/VPS_OPERATIONS.md` 是给 AI/代理执行的唯一生产更新流程。SMTP 服务商选择
和人工配置说明单独位于
[`docs/SMTP_SETUP.md`](docs/SMTP_SETUP.md)；涉及 SMTP 时应在执行运维流程的
同时读取该文档，不得把两类说明重新混写。

## 采集专项手册选择

- 收到采集异常邮件、后台出现错误、采集服务失败、报价缺失、解析结构变化、网络
  超时或 Neon 同步异常时，必须读取并执行
  [`docs/COLLECTION_ERROR_RUNBOOK.md`](docs/COLLECTION_ERROR_RUNBOOK.md)。
  如需修改代码并重新上线，还必须完整执行 `docs/VPS_OPERATIONS.md`。
- 新增或删除 provider、产品、adapter、官方价格页、API 价目来源、App Store 应用
  或 storefront 时，必须读取并执行
  [`docs/COLLECTION_PROJECT_RUNBOOK.md`](docs/COLLECTION_PROJECT_RUNBOOK.md)，
  同时读取 [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)。如需上线，继续执行
  `docs/VPS_OPERATIONS.md`。
- 同一任务同时包含“修错误”和“增删项目”时，两份专项手册都必须读取。
- 专项手册只规定诊断和采集代码流程；部署、备份、回滚及生产验收始终以
  `docs/VPS_OPERATIONS.md` 为唯一准则。

必须遵守以下约束：

- 不得在 `/opt/ai-price/current` 中直接修改生产代码。
- 必须使用文档中的 release 打包、上传、验证和原子切换流程。
- 正常更新必须先由 GitHub Actions 完成质量检查并生成生产构建产物，再执行
  `deploy/vps-update.ps1`；只有 GitHub 不可用时才使用文档中的手工回退流程。
- VPS 必须使用原生 Next.js webpack 生产构建
  `npx next build --webpack`；不得用面向 Cloudflare/vinext 的
  `npm run build` 作为 VPS 生产构建。
- 不得把 `/etc/ai-price.env`、SMTP 密码、邮箱授权码、数据库密码或其他生产密钥
  写入仓库、日志、提交信息或对话回复。
- 更新时必须保留 PostgreSQL 数据、`/etc/ai-price.env`、Let's Encrypt 证书和
  Certbot 自动续期配置，除非用户明确授权对应变更。
- 数据库迁移前必须按文档创建备份；可能不向后兼容的迁移必须先制定数据库回滚
  方案。
- 发布完成后必须检查 Web、Nginx、PostgreSQL、采集 timer、公网 HTTP、数据库
  数据量和服务日志；不能只以构建成功作为完成标准。
- 修改生产部署方式、目录、服务名、端口、环境变量或更新命令时，必须在同一次
  变更中同步更新 `docs/VPS_OPERATIONS.md`。
