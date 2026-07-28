# 部署说明

## 推荐组合

- Web：Vercel
- Database：Neon PostgreSQL 或任意托管 PostgreSQL
- Scheduler：GitHub Actions 每天两次
- Email：任意标准 SMTP，生产推荐 SES 或国内云邮件服务

该组合使网页请求只读取数据库，采集不会占用网页服务器资源。
首页使用 15 分钟增量再验证；采集完成后无需重新构建或部署，最迟约 15 分钟即可
展示数据库中的新价格。

## 环境变量

```dotenv
DATABASE_URL=
DIRECT_DATABASE_URL=
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
COLLECTOR_CONCURRENCY=5
```

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

## GitHub Secrets

采集工作流需要：

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `ADMIN_EMAIL`
- `EMAIL_TOKEN_SECRET`

仓库内 `.github/workflows/collect-prices.yml` 使用
`0 10,22 * * *`，对应北京时间 18:00 与次日 06:00。先迁移数据库，再运行采集；
任何来源失败会使任务以非零状态结束。

CI 不应获得生产数据库和 SMTP 密钥。

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
- seed 不会在生产环境覆盖真实数据。
- 定时任务可手工触发。
- 管理员收到测试告警。
- 用户确认和退订链接使用生产域名。
- SPF/DKIM/DMARC 验证通过。
- 覆盖率门槛、构建和 E2E 全部通过。
- 375px 和 1440px 视觉检查通过。
