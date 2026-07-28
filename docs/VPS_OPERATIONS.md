# VPS 生产运维更新流程（AI 必读）

本文档只面向执行生产运维的 AI/代理。任何部署、更新、回滚、环境变量、Nginx、
数据库或定时任务操作前，必须完整阅读并按顺序执行。

SMTP 的人工配置说明见 [`SMTP_SETUP.md`](SMTP_SETUP.md)，不要在本文档重复。

## 1. 固定生产信息

| 项目 | 值 |
| --- | --- |
| SSH | `ssh american-vps` |
| 公网地址 | `http://107.173.87.110` |
| 应用根目录 | `/opt/ai-price` |
| 当前版本软链接 | `/opt/ai-price/current` |
| 版本目录 | `/opt/ai-price/releases/<UTC 时间戳>` |
| 环境变量 | `/etc/ai-price.env` |
| Web 服务 | `ai-price.service` |
| 采集服务 | `ai-price-collect.service` |
| 采集 timer | `ai-price-collect.timer` |
| 应用监听 | `127.0.0.1:3100` |
| Nginx | 公网 80 端口 |
| PostgreSQL | `127.0.0.1:5432`，数据库 `ai_price` |
| 当前数据库模式 | 本地读取、本地写入、Neon 异步同步 |
| 特殊约束 | v2ray 正在占用公网 443 |

## 2. 强制规则

- 不得直接修改 `/opt/ai-price/current` 中的代码。
- 不得覆盖或输出 `/etc/ai-price.env`。
- 不得把 SMTP、数据库或 token 密钥写入仓库、日志或回复。
- 不得删除 PostgreSQL 数据。
- 不得修改 v2ray 或占用 443，除非用户明确授权。
- 必须用新 release 发布，再原子切换 `current`。
- VPS 必须执行 `npx next build --webpack`。
- VPS 不得用 `npm run build`；它是 vinext/Cloudflare 构建。
- 数据库目标变量必须明确保留为预期值，不能在发布时意外切换主写库。
- 同步目标是源库公开数据的完整镜像；目标库中同名表不得保存独立维护的数据。
- 数据库 schema 或 migration 变化时，发布前必须备份数据库。
- 发布完成必须验证服务、HTTP、数据库、timer 和日志。

## 3. 标准更新流程

### 3.1 本地确认代码

在 PowerShell 中：

```powershell
Set-Location 'C:\Users\zhangjunjun\Documents\ai-price'
git branch --show-current
git status --short
git log -1 --oneline
```

如果需要同步远端：

```powershell
git fetch --all --prune
git pull --ff-only
```

有未知本地修改时停止，不得使用 `reset --hard` 或强制 checkout。

发布内容必须先提交，因为 `git archive HEAD` 不包含未提交文件：

```powershell
git diff --check
git diff
git add <本次文件>
git commit -m "type: describe the change"
git status --short
```

发布前 `git status --short` 应为空；否则必须明确哪些文件不发布。

### 3.2 本地验证

```powershell
npm ci
npm run typecheck
npm test
npx next build --webpack
```

如果修改采集器或数据源：

```powershell
npm run test:stability
```

`npm ci` 报锁文件不同步时：

```powershell
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci
git diff -- package-lock.json
```

审查并提交 `package-lock.json` 后再发布。不得在 VPS 改用宽松的
`npm install` 绕过锁文件。

### 3.3 连接并确认 VPS

```powershell
ssh american-vps
```

在 VPS 执行：

```bash
whoami
hostname
curl -4 https://api.ipify.org
echo
readlink -f /opt/ai-price/current
node --version
npm --version
```

预期公网 IP 为 `107.173.87.110`，Node.js 不低于 20.9。目标不符时停止。

### 3.4 数据库变更时备份

仅在本次包含 schema 或 migration 变化时执行：

```bash
install -d -o postgres -g postgres -m 0700 /var/backups/ai-price
BACKUP_FILE="/var/backups/ai-price/ai_price_$(date -u +%Y%m%d%H%M%S).dump"
sudo -u postgres pg_dump --format=custom --file="$BACKUP_FILE" ai_price
ls -lh "$BACKUP_FILE"
```

记录备份完整路径。备份包含生产数据，不得提交或公开。

退出 VPS：

```bash
exit
```

### 3.5 本地打包

```powershell
Set-Location 'C:\Users\zhangjunjun\Documents\ai-price'
$releaseStamp = Get-Date -Format 'yyyyMMddHHmmss'
$releaseArchive = Join-Path $env:TEMP "ai-price-$releaseStamp.tar.gz"
git archive --format=tar.gz -o $releaseArchive HEAD
Get-Item $releaseArchive
git log -1 --oneline
git status --short
```

### 3.6 上传

```powershell
scp $releaseArchive american-vps:/tmp/ai-price.tar.gz
scp package-lock.json american-vps:/tmp/ai-price-package-lock.json
scp deploy/vps-install.sh american-vps:/tmp/ai-price-vps-install.sh
```

确认上传完整：

```powershell
ssh american-vps "stat -c '%n %s bytes' /tmp/ai-price.tar.gz /tmp/ai-price-package-lock.json /tmp/ai-price-vps-install.sh"
```

### 3.7 发布

```powershell
ssh american-vps
```

记录旧版本：

```bash
readlink -f /opt/ai-price/current
```

执行：

```bash
chmod 700 /tmp/ai-price-vps-install.sh
/tmp/ai-price-vps-install.sh \
  107.173.87.110 \
  /tmp/ai-price.tar.gz \
  /tmp/ai-price-package-lock.json
```

脚本应输出新的 `RELEASE_DIR` 和 `DEPLOYED_URL`。

- `INITIAL_COLLECTION_SKIPPED=1`：已有历史数据，交给 timer 后续采集。
- `INITIAL_COLLECTION_FAILED=1`：Web 可能已上线，但采集失败；必须继续检查。

### 3.8 发布后验证

```bash
readlink -f /opt/ai-price/current

systemctl is-active ai-price.service
systemctl is-active nginx
systemctl is-active postgresql
systemctl is-active ai-price-collect.timer

curl -fsS -o /dev/null -w "app=%{http_code}\n" http://127.0.0.1:3100/
curl -fsS -o /dev/null -w "nginx=%{http_code}\n" http://127.0.0.1/
curl -fsS -o /dev/null -w "public=%{http_code}\n" http://107.173.87.110/

sudo -u postgres psql -d ai_price -Atc \
  "SELECT 'observations=' || count(*) FROM price_observations"
sudo -u postgres psql -d ai_price -Atc \
  "SELECT 'runs=' || count(*) FROM collection_runs"

sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a
  source /etc/ai-price.env
  set +a
  cd /opt/ai-price/current
  npm run sync:data
'

systemctl list-timers ai-price-collect.timer --no-pager
journalctl -u ai-price.service --since "-10 minutes" --no-pager
```

验收条件：

- 四个服务检查均为 `active`；
- 三个 HTTP 检查均为 `200`；
- observation 数量大于 0；
- 启用同步时 `npm run sync:data` 返回目标名称和各表同步数量；
- timer 有下一次执行时间；
- Web 没有持续重启、数据库连接或模块加载错误。

退出 VPS，从本机再验证：

```powershell
curl.exe -I --max-time 20 http://107.173.87.110/
curl.exe -sS -o NUL -w "methodology=%{http_code}`n" http://107.173.87.110/methodology
curl.exe -sS -o NUL -w "privacy=%{http_code}`n" http://107.173.87.110/privacy
```

### 3.9 清理临时文件

VPS：

```bash
rm -f -- \
  /tmp/ai-price.tar.gz \
  /tmp/ai-price-package-lock.json \
  /tmp/ai-price-vps-install.sh
```

本机：

```powershell
Remove-Item -LiteralPath $releaseArchive
```

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

域名接入时需要修改 DNS、Nginx `server_name` 和 `APP_URL`，并签发证书。

当前 443 被 v2ray 占用。未制定共存方案前，不得让 Nginx 或 Certbot 抢占 443。
