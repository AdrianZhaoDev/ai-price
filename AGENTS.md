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
3. 除下述“单来源网页变更热修”外，完成代码和文档后必须在本地执行与改动相称的针对性测试，并至少执行
   `git diff --check`、`npm run format:check`、`npm run lint`、
   `npm run typecheck`、`npm run test:coverage` 和
   `npx next build --webpack`；涉及用户交互时还必须执行相关 Playwright E2E。
   任一检查失败不得发起合并。
4. 只提交本次任务文件，推送开发分支并向 `main` 发起 PR。PR 必须说明变更、原因、
   影响、迁移或回滚风险以及已执行的验证。
5. PR 发起后必须等待 GitHub CI 全部成功。除下述热修例外，包含功能、逻辑、依赖、配置、数据库、
   构建、部署、安全或隐私影响的改动，还必须等待 PR 的 Codex 机器人完成审核。
   PR 创建后机器人会自动受理审核；主 PR 出现机器人添加的 👀 表情即表示正在审核，
   通常需要等待 3–20 分钟。主 PR 出现 `chatgpt-codex-connector[bot]` 添加的 👍
   （GitHub reaction `+1`）即表示审核已完成且没有可执行意见。首次提交不得主动评论
   `@codex review`，也不得因暂时没有审核正文而重复催促。必须逐条检查未解决的审核线程；
   所有可执行意见均须修复、重新验证并推送。只有后续提交的内容确实需要机器人重新审核时，
   才主动评论 `@codex review` 并等待复审；无需复审的后续提交不得重复触发。
   仅修改文档、注释、拼写或格式，且不改变上述任何行为或风险的小修改，CI 通过后
   无需等待 Codex 审核即可合并；如果合并前机器人已经留下有效意见，仍须先处理。
   存在失败检查、尚未完成的必要 Codex 审核、未解决的有效意见或合并冲突时，禁止合并。
6. 适用的审核要求和全部检查通过后才可把 PR 合并到 `main`。合并后必须在干净的
   `main` 工作区获取并核对远端合并提交，不得从开发分支直接部署。
7. 需要更新生产环境时，合并完成后继续完整执行本文件的“VPS 生产环境更新规则”
   以及 [`docs/VPS_OPERATIONS.md`](docs/VPS_OPERATIONS.md)；发布必须使用该
   `main` 提交对应且结论为成功的 GitHub Actions 生产构建产物，并完成全部生产验收。
8. 发布完成后，必须删除本地和远端除 `main` 外的所有分支，自动切换到 `main` 分支并
   拉取最新的 `origin/main` 更新。

## 单来源网页变更热修（快速通道）

仅当已有官方价格来源因公开网页的 DOM、路由数据或静态资产命名变化而失败，且修复
只涉及该来源的采集/解析函数、版本、定向测试、官方核验的目录兜底价及对应来源说明时使用。不得借此新增/删除
项目、改变数据库/共享 HTTP/通用解析器/价格身份、币种、单位、安全或部署配置。
不满足条件的任务走上述完整流程。官方公开报价消失、无法核验或需要登录时，保留旧报价
及错误，不得用第三方渲染、猜测价格或降低完整性门槛伪造成功。

1. 仍从最新 `origin/main` 新建独立工作树与 `codex/` 分支；读取采集错误手册和 VPS
   运维手册，核对精确来源的错误、原站当前价格、币种、账期、身份和数量。真实下架应
   记录官方证据并保留其他报价身份；只对该来源按手册单次接受条数变化。
2. 限定修改范围，升级该来源 `parserVersion`，加成功、缺字段/截断、增删套餐、异常金额
   的定向测试与完整性保护。先用无数据库实时采集核对官网，再运行
   `git diff --check`、`npm run format:check`、`npm run lint`、`npm run typecheck` 和
   受影响的 Vitest 文件。纯采集热修不在本地重复跑全仓覆盖率、Webpack 构建或 UI E2E；
   若涉及价格映射/跳变，额外跑对应稳定性测试。CI 仍执行全量质量检查及生产构建。
3. 只提交热修文件，推送并开 PR，说明官方证据、旧/新报价、风险与回滚。等待 CI 全绿。
   严格符合本节且没有未解决有效审核意见的纯单来源解析热修，可以不等待 Codex 机器人
   的最终 👍；若机器人已提出可执行意见，先修复、重新验证。包含本节规则自身变更的 PR
   不属于此豁免，仍等审核完成。
4. 合并后只从干净 `main` 的成功 GitHub 生产产物运行 `deploy/vps-update.ps1`，不得
   直接改生产文件或跳过备份/原子切换。先跑精确来源，再跑全量；核对旧错误解决、
   `source_count = success_count`、Neon 同步、服务/timer、数据库和公网 HTTP。任一失败
   不宣称修复完成，继续定位或按运维手册回滚。最后清理分支并回到最新 `main`。

## 托管范围

本项目只自动维护 `https://lowpriceradar.com` 对应的 VPS 生产环境。除非用户在
当前任务中明确要求，否则不得创建或恢复 `.openai/hosting.json`、不得添加 Sites
源码 remote，也不得自动构建、保存、核对或发布 ChatGPT Sites 托管版本。现有 Sites
网址不属于常规开发、合并或生产发布流程。

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
