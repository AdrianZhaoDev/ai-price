# VPS 生产运维更新流程（AI 必读）

本文档只面向执行生产运维的 AI/代理。任何部署、更新、回滚、环境变量、Nginx、
数据库或定时任务操作前，必须完整阅读并按顺序执行。

SMTP 的人工配置说明见 [`SMTP_SETUP.md`](SMTP_SETUP.md)，不要在本文档重复。

## 1. 固定生产信息

| 项目           | 值                                        |
| -------------- | ----------------------------------------- |
| SSH            | `ssh american-vps`                        |
| 公网地址       | `https://lowpriceradar.com`               |
| 源站 IP        | `107.173.87.110`（不作为公开访问入口）    |
| 应用根目录     | `/opt/ai-price`                           |
| 当前版本软链接 | `/opt/ai-price/current`                   |
| 版本目录       | `/opt/ai-price/releases/<UTC 时间戳>`     |
| 环境变量       | `/etc/ai-price.env`                       |
| Web 服务       | `ai-price.service`                        |
| 采集服务       | `ai-price-collect.service`                |
| 采集 timer     | `ai-price-collect.timer`                  |
| 应用监听       | `127.0.0.1:3100`                          |
| Nginx          | 公网 80/443 端口                          |
| 源站证书       | `/etc/letsencrypt/live/lowpriceradar.com` |
| PostgreSQL     | `127.0.0.1:5432`，数据库 `ai_price`       |
| 当前数据库模式 | 本地读取、本地写入、Neon 异步同步         |
| 采集出站代理   | WARP Proxy `127.0.0.1:40000`              |
| Cloudflare SSL | Full (strict)                             |

## 2. 强制规则

- 不得直接修改 `/opt/ai-price/current` 中的代码。
- 不得覆盖或输出 `/etc/ai-price.env`。
- 不得把 SMTP、数据库或 token 密钥写入仓库、日志或回复。
- 不得删除 PostgreSQL 数据。
- Nginx 必须保有 80/443；不得恢复旧 v2ray 服务或让其他服务抢占 443。
- 不得删除 `/etc/letsencrypt`、覆盖证书私钥或停用 `certbot.timer`。
- 必须用新 release 发布，再原子切换 `current`。
- VPS 必须执行 `npx next build --webpack`。
- VPS 不得用 `npm run build`；它是 vinext/Cloudflare 构建。
- 数据库目标变量必须明确保留为预期值，不能在发布时意外切换主写库。
- 同步目标是源库公开数据的完整镜像；目标库中同名表不得保存独立维护的数据。
- 数据库 schema 或 migration 变化时，发布前必须备份数据库。
- 发布完成必须验证服务、HTTP、数据库、timer 和日志。

## 3. 标准更新流程

正常发布使用 GitHub Actions 验证过的 Linux 构建产物。VPS 不再重复安装相同依赖，
也不重复构建同一提交。`deploy/vps-update.ps1` 会核对提交、CI 结论和 SHA-256，
自动备份数据库、上传、原子切换并完成基础验收。

### 3.1 提交并推送

```powershell
Set-Location 'C:\Users\zhangjunjun\Documents\ai-price'
git branch --show-current
git status --short
git diff --check
npm run typecheck
npm test
git add <本次文件>
git commit -m "type: describe the change"
git push origin main
```

必须在 `main` 分支且工作区干净。有未知修改时停止，不得强制覆盖。

GitHub `CI` 工作流会执行：

```text
npm ci
format check
lint
typecheck
coverage tests
Next.js webpack production build
Playwright E2E
production artifact + SHA-256 manifest
```

第三方实时采集不进入 CI，避免外站波动造成随机失败。

### 3.2 发布 GitHub 验证产物

```powershell
.\deploy\vps-update.ps1
```

脚本只接受当前本地 `HEAD` 对应且结论为 `success` 的 CI run。如果 CI 尚在执行，
脚本会等待；失败则停止，不会改动生产。也可明确指定 run：

```powershell
.\deploy\vps-update.ps1 -RunId 123456789
```

脚本成功时应输出：

```text
DEPLOYED_COMMIT=<40 位提交>
GITHUB_RUN_ID=<run id>
DEPLOY_SECONDS=<秒数>
```

安装脚本还会输出：

- `DEPENDENCIES_REUSED=1`：复用按 lockfile 哈希保存的依赖；
- `PREBUILT_BUILD=1`：使用 CI 已验证的 Linux 构建；
- `RELEASE_DIR=...`：本次不可变 release；
- `INITIAL_COLLECTION_SKIPPED=1`：已有生产数据，由 timer 继续采集。

### 3.3 发布后完整验收

快速脚本已验证服务和 HTTP；执行者仍须检查数据库、timer 和日志：

```powershell
ssh american-vps
```

```bash
readlink -f /opt/ai-price/current
systemctl is-active \
  ai-price.service nginx postgresql ai-price-collect.timer certbot.timer
curl -fsS -o /dev/null -w "app=%{http_code}\n" http://127.0.0.1:3100/
curl -fsS --resolve lowpriceradar.com:443:127.0.0.1 \
  -o /dev/null -w "origin-https=%{http_code}\n" \
  https://lowpriceradar.com/
curl -fsS -o /dev/null -w "public=%{http_code}\n" https://lowpriceradar.com/
curl -sS -o /dev/null -w "http=%{http_code} redirect=%{redirect_url}\n" \
  http://lowpriceradar.com/
curl -sS -o /dev/null -w "admin-errors=%{http_code}\n" \
  http://127.0.0.1:3100/admin/errors
openssl x509 -checkend 1209600 -noout \
  -in /etc/letsencrypt/live/lowpriceradar.com/fullchain.pem
sudo -u postgres psql -d ai_price -Atc \
  "SELECT 'observations=' || count(*) FROM price_observations"
sudo -u postgres psql -d ai_price -Atc \
  "SELECT 'runs=' || count(*) FROM collection_runs"
systemctl list-timers ai-price-collect.timer --no-pager
journalctl -u ai-price.service --since "-10 minutes" --no-pager
```

启用 Neon 同步时还要执行：

```bash
sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a
  source /etc/ai-price.env
  set +a
  cd /opt/ai-price/current
  npm run sync:data
'
```

验收条件：五个服务/timer 均为 `active`，源站 HTTPS 和公网均为 `200`，HTTP
一跳 `301` 到主站 HTTPS，错误页未登录时重定向，数据库记录大于 0，timer 有
下次运行时间，证书剩余至少 14 天，Web 日志无持续重启或连接错误。

### 3.4 GitHub 不可用时的手工回退

只有 GitHub Actions 或 artifact 服务不可用时才使用。手工流程必须在本机完成
全套检查，并让 VPS 自行构建：

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npx next build --webpack

$releaseArchive = Join-Path $env:TEMP "ai-price-manual.tar.gz"
git archive --format=tar.gz -o $releaseArchive HEAD
scp $releaseArchive american-vps:/tmp/ai-price.tar.gz
scp package-lock.json american-vps:/tmp/ai-price-package-lock.json
scp deploy/vps-install.sh american-vps:/tmp/ai-price-vps-install.sh
ssh american-vps
```

进入 VPS 后先按第 3.3 节确认目标，再备份数据库：

```bash
install -d -o postgres -g postgres -m 0700 /var/backups/ai-price
BACKUP_FILE="/var/backups/ai-price/ai_price_$(date -u +%Y%m%d%H%M%S).dump"
sudo -u postgres pg_dump --format=custom --file="$BACKUP_FILE" ai_price
chmod 700 /tmp/ai-price-vps-install.sh
/tmp/ai-price-vps-install.sh \
  107.173.87.110 \
  /tmp/ai-price.tar.gz \
  /tmp/ai-price-package-lock.json
```

手工 archive 不含 `.next/BUILD_ID`，所以安装器会在 VPS 运行强制的
`next build --webpack`。完成后按第 3.3 节验收并删除 `/tmp/ai-price-*`。

## 4. 采集任务

查看 timer：

```bash
systemctl list-timers ai-price-collect.timer --no-pager
```

手工采集：

```bash
systemctl start ai-price-collect.service
journalctl -u ai-price-collect.service -f
```

采集结束后：

```bash
journalctl -u ai-price-collect.service -n 350 --no-pager
sudo -u postgres psql -d ai_price -Atc \
  "SELECT count(*) FROM price_observations"
```

单个来源失败会使 oneshot 显示 failed，但成功来源仍可能已写入数据库。必须同时
检查 `successCount`、`failureCount`、`offerCount` 和 observation 数量。

## 5. 修改环境变量

先备份：

```bash
cp -a /etc/ai-price.env \
  "/etc/ai-price.env.backup.$(date -u +%Y%m%d%H%M%S)"
nano /etc/ai-price.env
```

不得输出完整文件。不得删除：

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `CRON_SECRET`
- `EMAIL_TOKEN_SECRET`

当前 VPS 应保持：

```dotenv
DATABASE_READ_TARGET=local
DATABASE_WRITE_TARGET=local
DATA_SYNC_ENABLED=true
DATA_SYNC_CHANNEL=neon
DATA_SYNC_TARGET=neondb
COLLECTOR_PROXY_URL=http://127.0.0.1:40000
```

`DATA_SYNC_TARGET_URL` 和 `REMOTE_DATABASE_URL` 属于密钥，不得输出。
连接串包含 `&`、`#`、空格等 shell 特殊字符时，值必须用单引号包裹，例如
`DATA_SYNC_TARGET_URL='postgresql://...'`；不得把真实连接串写入命令日志。

修改后：

```bash
chown root:ai-price /etc/ai-price.env
chmod 0640 /etc/ai-price.env
systemctl restart ai-price.service
systemctl status ai-price.service --no-pager
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
```

SMTP 的具体值和测试步骤只按 [`SMTP_SETUP.md`](SMTP_SETUP.md) 执行。

`COLLECTOR_PROXY_URL` 只影响采集 HTTP 请求。采集器优先使用代理；代理失败时会
自动改为直连并把 `proxy`/`direct` 路由写入错误详情。修改前先验证：

```bash
systemctl is-active warp-svc
warp-cli --accept-tos status
curl --proxy http://127.0.0.1:40000 --max-time 20 \
  -o /dev/null -w "%{http_code}\n" https://help.aliyun.com/
```

## 6. 代码回滚

查看版本：

```bash
readlink -f /opt/ai-price/current
ls -lah /opt/ai-price/releases
```

指定确切旧版本：

```bash
ROLLBACK_RELEASE=/opt/ai-price/releases/旧版本时间戳
test -d "$ROLLBACK_RELEASE"
```

切换并验证：

```bash
ln -sfn "$ROLLBACK_RELEASE" /opt/ai-price/current
chown -h ai-price:ai-price /opt/ai-price/current
systemctl restart ai-price.service
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
journalctl -u ai-price.service -n 150 --no-pager
```

数据库 migration 可能不向后兼容。涉及数据库时，不得仅回滚代码；必须使用发布
前的备份制定恢复方案，并获得用户明确授权后才能执行数据库恢复。

## 7. 清理旧版本

```bash
CURRENT_RELEASE="$(readlink -f /opt/ai-price/current)"
echo "$CURRENT_RELEASE"
du -sh /opt/ai-price/releases/*
```

至少保留当前版本和一个可用旧版本。只删除核对过的确切目录：

```bash
OLD_RELEASE=/opt/ai-price/releases/确切旧时间戳
test "$OLD_RELEASE" != "$CURRENT_RELEASE"
test -d "$OLD_RELEASE"
rm -rf -- "$OLD_RELEASE"
```

禁止使用未检查的通配符删除 release。

## 8. 快速排障

### Web/502

```bash
systemctl status ai-price.service --no-pager
journalctl -u ai-price.service -n 200 --no-pager
curl -v http://127.0.0.1:3100/
curl -v --resolve lowpriceradar.com:443:127.0.0.1 \
  https://lowpriceradar.com/
nginx -t
```

### PostgreSQL

```bash
systemctl status postgresql --no-pager
ss -lntp | grep 5432
sudo -u postgres psql -d ai_price -c "SELECT 1"
```

不得开放公网 5432。

### 远端同步

```bash
cd /opt/ai-price/current
sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a
  source /etc/ai-price.env
  set +a
  npm run sync:data
'
```

失败时检查目标开关、渠道、目标名称、目标 schema 和网络。不得输出目标连接串。

### 磁盘

```bash
df -h /
du -sh /opt/ai-price/releases/*
journalctl --disk-usage
```

只按第 7 节清理旧 release，不得删除当前 release、数据库或环境变量文件。

## 9. 域名与 HTTPS

生产主域名为 `https://lowpriceradar.com`。DNS 和边缘 HTTPS 由 Cloudflare
提供，Cloudflare 必须使用 Full (strict) 连接源站。Nginx 使用 Let's Encrypt
证书监听 443；80、`www.lowpriceradar.com` 和 `ai.lowpriceradar.com` 均以 301
一跳重定向到主域名并保留路径和查询参数。

旧 v2ray 服务已于 2026-07-30 经授权退役，443 永久归 Nginx 使用。退役前配置的
root-only 备份位于 `/var/backups/retired-services/`；正常发布不得恢复旧服务。

### 9.1 首次签发或灾难恢复

正常发布只验证证书，不会重新签发。证书缺失时，先保持现有 HTTP Nginx 可用，再
执行：

```bash
apt-get update
apt-get install -y --no-install-recommends certbot python3-certbot-nginx
certbot certonly --nginx --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --cert-name lowpriceradar.com \
  -d lowpriceradar.com \
  -d www.lowpriceradar.com \
  -d ai.lowpriceradar.com
systemctl enable --now certbot.timer
```

签发后先验证源站，再把 Cloudflare 切到 Full (strict)：

```bash
nginx -t
curl --resolve lowpriceradar.com:443:127.0.0.1 \
  https://lowpriceradar.com/
openssl x509 -noout -subject -issuer -dates \
  -in /etc/letsencrypt/live/lowpriceradar.com/fullchain.pem
```

不得先切 Full (strict) 再签发证书，否则会造成 526/回源失败。

### 9.2 续期

Nginx 在 HTTP 和 HTTPS 都保留 `/.well-known/acme-challenge/`。证书续期配置使用
webroot `/var/www/html`，以兼容 Cloudflare 的 HTTPS 重定向。

```bash
certbot reconfigure --cert-name lowpriceradar.com \
  --webroot --webroot-path /var/www/html --non-interactive
systemctl status certbot.timer --no-pager
certbot renew --dry-run
openssl x509 -checkend 1209600 -noout \
  -in /etc/letsencrypt/live/lowpriceradar.com/fullchain.pem
```

`reconfigure` 必须在正式 Nginx 配置已加载、三个域名的 HTTP ACME challenge 均能
公网访问后执行；失败时它不会替换现有续期配置，应先修复 challenge 路径再重试。

### 9.3 Cloudflare 基线

必须保持：

- SSL/TLS：手动 Full (strict)，Automatic SSL/TLS 必须关闭；
- Minimum TLS Version：1.2；
- TLS 1.3、HTTP/2、HTTP/3、Brotli、Always Use HTTPS：启用；
- DNSSEC：启用且注册商存在 DS；
- HSTS：`max-age=15552000; includeSubDomains`，暂不加入 preload；
- Early Hints、Crawler Hints：启用；Speed Brain、Rocket Loader、0-RTT：保持关闭；
- HTML 默认不在边缘强制缓存；只对带内容哈希的 `/_next/static/` 和明确静态资源
  使用长缓存；
- `/admin/`、`/api/`、`/subscription/` 必须 `private, no-store`；
- 源站 80/443 只允许 Cloudflare 官方 IP 段，SSH 规则必须保留。

详细的 SEO、边缘缓存、安全头和趋势观察流程见
[`SEO_CLOUDFLARE_MONITORING.md`](SEO_CLOUDFLARE_MONITORING.md)。

### 9.4 源站防火墙

UFW 只允许 Cloudflare 官方 IPv4/IPv6 段访问 80/443，SSH 继续使用独立的
`22/tcp LIMIT` 规则。官方清单：

- `https://www.cloudflare.com/ips-v4`
- `https://www.cloudflare.com/ips-v6`

每月及 Cloudflare 公告 IP 变更后执行：

```bash
ufw status numbered
curl -fsS https://www.cloudflare.com/ips-v4
curl -fsS https://www.cloudflare.com/ips-v6
```

把官方新增网段先加入 80/443 allow 规则，确认公网 HTTPS 正常后，才删除已退出
清单的旧网段。不得先删除全部 Web 规则，不得删除 SSH 规则，也不得重新加入
`80/tcp ALLOW Anywhere` 或 `443/tcp ALLOW Anywhere`。完成后从 Cloudflare 公网
访问应为 200，而从非 Cloudflare 地址直连源站 IP 的 80/443 应超时。
