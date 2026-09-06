# 部署说明

> 当前 `american-vps` 自建生产环境的代码更新、数据库备份、发布、验证与回滚，
> 统一以 [VPS 生产运维更新流程](VPS_OPERATIONS.md) 为准。SMTP 的人工配置见
> [SMTP 邮件配置教程](SMTP_SETUP.md)。

## 推荐组合

- Web：Vercel
- Database：Neon PostgreSQL 或任意托管 PostgreSQL
- Scheduler：官方价格由 VPS timer 每 4 小时运行；公开栏目快照由 GitHub Actions 每 4 小时发布
- Email：任意标准 SMTP，生产推荐 SES 或国内云邮件服务

该组合使网页请求只读取数据库，采集不会占用网页服务器资源。官方价格 collector 继续
使用 VPS 本地库和既有 `ai-price-collect.timer`；新增卡网/API 中转站 collector 只在
GitHub-hosted runner 上拉取公开快照并写入远程 public-data DB，不迁移或停用 VPS collector。
首页使用 15 分钟增量再验证；采集完成后无需重新构建或部署，最迟约 15 分钟即可
展示数据库中的新价格。

## 环境变量

```dotenv
DATABASE_URL=
DIRECT_DATABASE_URL=
LOCAL_DATABASE_URL=
REMOTE_DATABASE_URL=
DATABASE_READ_TARGET=local
DATABASE_WRITE_TARGET=local
DATA_SYNC_ENABLED=false
DATA_SYNC_CHANNEL=neon
DATA_SYNC_TARGET=neondb
DATA_SYNC_TARGET_URL=
APP_URL=
CONTACT_EMAIL=
CRON_SECRET=
EMAIL_TOKEN_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ADMIN_EMAIL=
COLLECTOR_CONCURRENCY=3
```

`DATABASE_URL` 保持向后兼容并默认作为本地写库。页面读取可通过
`DATABASE_READ_TARGET` 在本地和远程之间切换；采集与订阅通过
`DATABASE_WRITE_TARGET` 选择运行数据库。

公开快照 workflow 使用独立的 GitHub Secrets/Variables。来源 URL 和采集开关仅用于
GitHub；VPS Web 使用 PUBLIC_DATA_DATABASE_URL 的独立只读凭据及 SEO 开关，不能
把 GitHub 的数据库写入凭据复制给 Web。

```dotenv
PUBLIC_DATA_DATABASE_URL=
PUBLIC_CHANNELS_SNAPSHOT_URL=
PUBLIC_TRANSIT_SNAPSHOT_URL=
PUBLIC_DATA_DOMAIN=all
PUBLIC_DATA_CONCURRENCY=1
PUBLIC_DATA_COLLECTION_ENABLED=false
# migration + first healthy generation verified before enabling SEO indexing
PUBLIC_DATA_INDEXING_ENABLED=false
```

GitHub 的 `PUBLIC_DATA_DATABASE_URL` 必须指向远程 public-data PostgreSQL；
Web 使用同库只读账号。未批准来源时保持 GitHub Variable
`PUBLIC_DATA_COLLECTION_ENABLED=false`，定时任务将跳过；人工 dispatch 仍检查配置并
在缺失时失败，不会自动迁移或写入本地数据库。
`PUBLIC_DATA_DIRECT_DATABASE_URL` 不属于定时 workflow secrets；仅在受控 migration
步骤中临时使用，并按 VPS 运维流程保护和清理。

`PUBLIC_DATA_INDEXING_ENABLED` 不应放入定时采集步骤。保持 `false` 时，两个公开栏目
仍可供人工核对，但页面 metadata 返回 `noindex, follow` 且 sitemap 不列出栏目；只有
公开表迁移完成、至少一轮快照成功发布并通过数据质量检查后，才在 Web 运行环境中
显式设置为 `true`。这项开关不会改变 collector 的采集范围。

开启 `DATA_SYNC_ENABLED` 后，每轮采集完成都会把公开价格和采集表完整镜像到目标
PostgreSQL。`neon` 与 `postgresql` 通道都使用标准 PostgreSQL 协议。
`DATA_SYNC_TARGET_URL` 是生产密钥，不得提交到仓库。
服务器环境文件会被 Bash 读取；连接串含 `&` 等 shell 特殊字符时，必须将完整值
放在单引号内。

## 本地开发

```bash
npm install
npm run local:setup
npm run dev:local
```

本地 Docker PostgreSQL 映射到 `127.0.0.1:55432`，页面运行在
`http://127.0.0.1:3100`。这两个端口与常见的 PostgreSQL、Next.js 默认端口错开，
不会干扰已有项目。SMTP 可以保持为空；页面与采集测试不依赖发信。

使用以下命令连续采集两轮，验证 200 个来源的成功率、报价数量漂移、重复观测和
数据库运行状态：

```bash
npm run test:stability
```

结束测试后可停止数据库容器，数据卷会保留：

```bash
npm run local:db:down
```

没有配置数据库时，开发环境使用只读 seed 数据；订阅记录保存在进程内存，邮件
通过 Nodemailer JSON transport 预览。进程重启后这些开发数据会清空。
`npm run collect` 仍会验证官方页面，但不会持久化结果。

## GitHub Actions 采集配置

### 公开快照 workflow

`.github/workflows/collect-public-data.yml` 保留每 4 小时 schedule 和
`workflow_dispatch`。它在 GitHub-hosted runner 上执行
`npm run collect:public -- --trigger=scheduled --domain=all`，只把公开快照写入
远程 public-data PostgreSQL，不调用既有 `collect`，也不迁移现有 VPS collector。

需要配置以下 GitHub Secrets/Variables：

- Secret `PUBLIC_DATA_DATABASE_URL`：远程 public-data 写入连接串，禁止使用 VPS
  的本地连接串或把值打印到日志；
- 至少一个 `PUBLIC_CHANNELS_SNAPSHOT_URL` 或 `PUBLIC_TRANSIT_SNAPSHOT_URL`，
  可放在 Secret 或 repository Variable 中。开启任务后未配置任何 URL 或数据库时，workflow
  在安装依赖前明确失败；未配置的单个领域会跳过。

定时任务并发上限为 1，job/采集步骤有超时且不自动重试整轮；失败由下一次
schedule 或人工重跑处理，避免重复发布。HTTP 代理环境被清空，快照源必须使用
HTTPS；采集器还会拒绝凭据、私有主机、重定向和超大响应。workflow 不接收 SMTP
或 `DATA_SYNC_*` 密钥，日志不得包含完整数据库/快照 URL。

首次启用 schedule 前，必须在受控发布/运维步骤中为 public-data 表执行并验证
migration，并完成备份/回滚准备。workflow 有意不自动执行 `db:migrate`，防止
定时任务在发布并发时扩大数据库权限；migration 未完成时应保持 schedule 关闭或
接受任务失败告警。
`PUBLIC_DATA_DIRECT_DATABASE_URL` 如需使用，应在上述受控 migration 步骤中作为
一次性直连配置，不放入定时 workflow；完成后移除临时暴露。

### 官方价格 collector 与 VPS timer

官方价格生产采集仍由 VPS 的 `ai-price-collect.timer` 每 4 小时运行一次，并以
`scheduled` 记录触发类型。仓库内 `.github/workflows/collect-prices.yml` 仅供
人工触发，沿用官方价格数据库和 SMTP 配置；它不承担公开快照发布。VPS timer、
`/etc/ai-price.env`、WARP 代理和本地到远程的 `DATA_SYNC` 镜像均保持原有流程。

CI 构建与普通检查不应获得 VPS 生产数据库、SMTP 或同步密钥。公开快照 workflow
是受限例外，只接收专用 `PUBLIC_DATA_*` 配置，不能复用官方 collector 的密钥。

## 自有邮箱配置示例

### QQ / 163

- 在邮箱设置中开启 SMTP。
- 使用授权码，不使用网页登录密码。
- `SMTP_SECURE=true`，端口通常为 `465`。
- 生产环境仍需评估每日发送限额和退信能力。

### AWS SES

- 验证发件域名。
- 配置 DKIM。
- 申请移出 sandbox。
- 创建 SMTP credentials。
- 根据区域填写 SMTP host。

## 上线检查

- 数据库迁移成功。
- public-data 远程库已单独备份并完成 `public_data_generations`、`channel_*`、
  `transit_*` migration；定时 workflow 未获得迁移权限。
- 至少一个公开快照 URL 与 `PUBLIC_DATA_DATABASE_URL` 已配置；从 `main` 手工触发
  `collect-public-data.yml` 成功，日志不含连接串、查询参数或其他密钥。
- 远程库存在最新 `published` generation；对应公开页面只读该 generation，普通
  页面/API 请求不会触发上游抓取。
- `/channels`、`/api-transit` 及英文路径上线验收须确认页面返回 200、canonical 正确，
  并展示已发布 generation（或明确的降级状态），不能把合成 fixture 当作生产数据；
  只有确认首个健康 generation 后才将 Web 环境的 `PUBLIC_DATA_INDEXING_ENABLED` 改为
  `true`，届时 sitemap 才列出这些条目。
- VPS `ai-price-collect.timer`、本地 PostgreSQL 和官方价格采集验收仍通过。
- seed 不会在生产环境覆盖真实数据。
- 定时任务可手工触发。
- 管理员收到测试告警。
- 用户退订链接使用生产域名，不得跳转到内部 localhost 地址。
- SPF/DKIM/DMARC 验证通过。
- 覆盖率门槛、构建和 E2E 全部通过。
- 375px 和 1440px 视觉检查通过。
