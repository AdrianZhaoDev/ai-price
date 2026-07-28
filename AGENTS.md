# AGENTS.md

## VPS 生产环境更新规则

本项目的生产环境位于 SSH 别名 `american-vps` 对应的 VPS，当前通过
`http://107.173.87.110` 提供服务。

任何代理或维护者执行生产环境部署、代码更新、环境变量修改、SMTP 配置、数据库
迁移、定时采集调整、Nginx 修改、域名接入、HTTPS 配置、回滚或故障排查之前，
必须先完整阅读并严格遵循
[`docs/VPS_OPERATIONS.md`](docs/VPS_OPERATIONS.md)。

`docs/VPS_OPERATIONS.md` 是给 AI/代理执行的唯一生产更新流程。SMTP 服务商选择
和人工配置说明单独位于
[`docs/SMTP_SETUP.md`](docs/SMTP_SETUP.md)；涉及 SMTP 时应在执行运维流程的
同时读取该文档，不得把两类说明重新混写。

必须遵守以下约束：

- 不得在 `/opt/ai-price/current` 中直接修改生产代码。
- 必须使用文档中的 release 打包、上传、验证和原子切换流程。
- VPS 必须使用原生 Next.js webpack 生产构建
  `npx next build --webpack`；不得用面向 Cloudflare/vinext 的
  `npm run build` 作为 VPS 生产构建。
- 不得把 `/etc/ai-price.env`、SMTP 密码、邮箱授权码、数据库密码或其他生产密钥
  写入仓库、日志、提交信息或对话回复。
- 更新时必须保留 PostgreSQL 数据、`/etc/ai-price.env`、现有 v2ray 服务及其占用
  的 443 端口，除非用户明确授权对应变更。
- 数据库迁移前必须按文档创建备份；可能不向后兼容的迁移必须先制定数据库回滚
  方案。
- 发布完成后必须检查 Web、Nginx、PostgreSQL、采集 timer、公网 HTTP、数据库
  数据量和服务日志；不能只以构建成功作为完成标准。
- 修改生产部署方式、目录、服务名、端口、环境变量或更新命令时，必须在同一次
  变更中同步更新 `docs/VPS_OPERATIONS.md`。
