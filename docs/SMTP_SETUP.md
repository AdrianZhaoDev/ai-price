# SMTP 邮件配置教程

这份文档给站点管理员阅读，用于选择邮件服务并在 AI Price Atlas 中完成 SMTP
配置。

## 1. 先看结论：应该选哪个

建议分两个阶段：

### 当前生产环境

站点已使用 `lowpriceradar.com`，但网站域名与发信域名可以分开。现有个人邮箱 SMTP
可继续承担低流量通知；它不要求给网站根域配置 MX。

个人邮箱方案的特点：

- 开通简单，不需要先购买或验证域名；
- 国内收件箱测试方便；
- 项目当前邮件量小，足够验证订阅成功通知、退订和管理员告警。

QQ 邮箱只适合临时或低流量运行。不要长期承担正式批量通知，也不要用账号登录
密码，必须使用单独生成的 SMTP 授权码。

如果没有 QQ 邮箱，可以用 163 邮箱；不建议为了这个项目专门使用 Gmail，因为
应用专用密码和国内收件体验通常不如 QQ/163 方便。

### 使用正式发信域名

如果有腾讯云企业实名认证，优先使用 **腾讯云邮件推送（SES）**。

理由：

- 主要用户是国内用户；
- 支持发信域名、DKIM、SPF、DMARC、发送记录和退信统计；
- 比个人邮箱更适合订阅成功通知和价格变化通知。

需要注意：腾讯云官方在 2026 年调整了权限，2026 年 3 月 2 日后新开通邮件推送
的个人认证用户不再支持 SMTP，企业认证用户不受影响。个人账号应先在控制台确认
是否拥有 SMTP 权限，不能默认一定可用。参考
[腾讯云 SMTP 发送邮件指南](https://cloud.tencent.com/document/product/1288/65749)。

如果没有企业认证或腾讯云 SMTP 权限，推荐 **Amazon SES**。它支持标准 SMTP、
域名验证和较完整的送达管理，但控制台和域名配置更复杂，国内邮箱送达效果需要
实际测试。

最终建议：

| 场景                       | 推荐           |
| -------------------------- | -------------- |
| 低流量、现有个人邮箱可用   | QQ 邮箱 SMTP   |
| 正式发信 + 腾讯云企业认证  | 腾讯云邮件推送 |
| 正式发信 + 无企业 SMTP权限 | Amazon SES     |
| 仅备用测试                 | 163 邮箱       |

## 2. 项目需要哪些配置

生产配置文件位于 VPS：

```text
/etc/ai-price.env
```

邮件相关字段：

```dotenv
APP_URL=https://lowpriceradar.com
CONTACT_EMAIL=
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ADMIN_EMAIL=
```

含义：

| 字段            | 说明                                    |
| --------------- | --------------------------------------- |
| `APP_URL`       | 邮件退订链接的站点地址                  |
| `CONTACT_EMAIL` | 网站上展示的联系邮箱                    |
| `SMTP_HOST`     | 邮件服务商 SMTP 地址                    |
| `SMTP_PORT`     | 465 或 587                              |
| `SMTP_SECURE`   | 465 填 `true`；587 通常填 `false`       |
| `SMTP_USER`     | SMTP 用户名，个人邮箱通常是完整邮箱地址 |
| `SMTP_PASSWORD` | 授权码、应用专用密码或 SMTP 专用密码    |
| `SMTP_FROM`     | 收件人看到的发件人                      |
| `ADMIN_EMAIL`   | 接收采集故障告警的邮箱                  |

端口组合：

```dotenv
# 推荐的直接 TLS
SMTP_PORT=465
SMTP_SECURE=true
```

或：

```dotenv
# STARTTLS
SMTP_PORT=587
SMTP_SECURE=false
```

587 配置中的 `false` 不表示明文发送。客户端先连接，再通过 STARTTLS 升级为加密
连接。

## 3. 最简单方案：QQ 邮箱

### 3.1 在 QQ 邮箱开启 SMTP

1. 登录 QQ 邮箱网页版。
2. 打开邮箱设置与账号/安全相关设置。
3. 找到 POP3/IMAP/SMTP 服务。
4. 开启 SMTP 服务。
5. 按页面要求完成安全验证。
6. 生成并保存 SMTP 授权码。

授权码只显示有限次数，应保存到密码管理器。它不是 QQ 登录密码。

### 3.2 要填写的值

假设发件邮箱是 `123456@qq.com`：

```dotenv
CONTACT_EMAIL=123456@qq.com
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=123456@qq.com
SMTP_PASSWORD=刚刚生成的QQ邮箱授权码
SMTP_FROM="AI Price Atlas <123456@qq.com>"
ADMIN_EMAIL=你用于接收告警的邮箱
```

生产环境必须保持：

```dotenv
APP_URL=https://lowpriceradar.com
```

否则退订邮件会指向错误地址。

## 4. 163 邮箱备用方案

1. 登录 163 邮箱网页版。
2. 在设置中开启 SMTP/客户端授权。
3. 生成客户端授权码。
4. 不要使用邮箱登录密码。

示例：

```dotenv
CONTACT_EMAIL=yourname@163.com
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=yourname@163.com
SMTP_PASSWORD=163客户端授权码
SMTP_FROM="AI Price Atlas <yourname@163.com>"
ADMIN_EMAIL=你用于接收告警的邮箱
```

## 5. 正式方案：腾讯云邮件推送

适合已经购买域名并拥有腾讯云企业认证的情况。

### 5.1 准备条件

- 一个可以管理 DNS 的域名；
- 腾讯云企业实名认证；
- 邮件推送服务已开通；
- 新账号已确认具有 SMTP 权限。

腾讯云当前规则和入口以官方文档为准：

- [邮件推送 SMTP 文档](https://cloud.tencent.com/document/product/1288/65720)
- [发信域名和邮件配置](https://cloud.tencent.com/document/product/1288/47454)

### 5.2 配置发信域名

1. 登录腾讯云邮件推送控制台。
2. 新建发信域名，建议使用独立子域名，例如：

   ```text
   mail.example.com
   ```

3. 按控制台给出的值，在域名 DNS 中添加验证记录。
4. 配置并保持 SPF、DKIM、DMARC 等记录。
5. 等待控制台显示域名验证通过。

不要自行猜测 DNS 值，必须逐项复制腾讯云控制台生成的记录。

### 5.3 创建发信地址和 SMTP 密码

1. 在邮件推送控制台进入“发信地址”。
2. 创建发信地址，例如：

   ```text
   price@mail.example.com
   ```

3. 为该发信地址设置 SMTP 密码。
4. 在 SMTP 服务地址页面确认当前 endpoint 和端口。

腾讯云的个人认证 SMTP 权限政策已经变化，因此必须以自己的控制台显示为准。

### 5.4 填入项目

示例中的 host 只作格式展示，应替换为控制台当前提供的真实 SMTP 地址：

```dotenv
APP_URL=https://example.com
CONTACT_EMAIL=price@mail.example.com
SMTP_HOST=腾讯云控制台提供的SMTP地址
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=price@mail.example.com
SMTP_PASSWORD=腾讯云中设置的SMTP密码
SMTP_FROM="AI Price Atlas <price@mail.example.com>"
ADMIN_EMAIL=admin@example.com
```

## 6. 正式备选：Amazon SES

适合已经购买域名，但没有腾讯云企业 SMTP 权限的情况。

### 6.1 创建和验证发件身份

1. 登录 AWS 控制台，进入 Amazon SES。
2. 选择一个离业务较近且支持 SES 的 Region。
3. 创建 Domain identity。
4. 把 SES 给出的 DNS 验证和 DKIM 记录添加到域名。
5. 等待 identity 显示 verified。
6. 如果账号仍在 sandbox，申请转为 production access。

SES 的身份验证和 SMTP 凭据按 Region 管理，创建时应始终使用同一个 Region。

### 6.2 创建 SMTP 凭据

在 SES 控制台的 SMTP settings 中创建 SMTP credentials。SMTP 用户名和密码不
等于 AWS Access Key，也不等于 AWS 登录密码。

官方说明：

- [创建 SES SMTP 凭据](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html)
- [SES SMTP 连接方式](https://docs.aws.amazon.com/ses/latest/dg/smtp-connect.html)

以 `us-west-2` 为例：

```dotenv
APP_URL=https://example.com
CONTACT_EMAIL=price@example.com
SMTP_HOST=email-smtp.us-west-2.amazonaws.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=SES生成的SMTP用户名
SMTP_PASSWORD=SES生成的SMTP密码
SMTP_FROM="AI Price Atlas <price@example.com>"
ADMIN_EMAIL=admin@example.com
```

也可以使用：

```dotenv
SMTP_PORT=587
SMTP_SECURE=false
```

如果使用其他 Region，必须替换 `SMTP_HOST`，不能照抄 `us-west-2`。

## 7. 把配置写入 VPS

### 7.1 连接服务器

在本机 PowerShell：

```powershell
ssh american-vps
```

### 7.2 备份配置

```bash
cp -a /etc/ai-price.env \
  "/etc/ai-price.env.backup.$(date -u +%Y%m%d%H%M%S)"
```

### 7.3 编辑

```bash
nano /etc/ai-price.env
```

填写邮件字段。不要修改或删除这些已有字段：

```text
DATABASE_URL
DIRECT_DATABASE_URL
CRON_SECRET
EMAIL_TOKEN_SECRET
```

nano 操作：

- `Ctrl+O`：保存；
- 按 Enter：确认文件名；
- `Ctrl+X`：退出。

不要把 `/etc/ai-price.env` 的完整内容复制到聊天、工单或截图中。

### 7.4 恢复正确权限

```bash
chown root:ai-price /etc/ai-price.env
chmod 0640 /etc/ai-price.env
ls -l /etc/ai-price.env
```

## 8. 检查和测试

### 8.1 检查字段是否填写

该命令只显示 `SET` 或 `MISSING`，不会输出密码：

```bash
set -a
source /etc/ai-price.env
set +a

for name in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD SMTP_FROM ADMIN_EMAIL APP_URL; do
  if [ -n "${!name:-}" ]; then
    echo "$name=SET"
  else
    echo "$name=MISSING"
  fi
done

unset SMTP_PASSWORD DATABASE_URL DIRECT_DATABASE_URL CRON_SECRET EMAIL_TOKEN_SECRET
```

全部字段应显示 `SET`。

### 8.2 测试 SMTP 认证

```bash
sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a
  source /etc/ai-price.env
  set +a
  cd /opt/ai-price/current
  ./node_modules/.bin/tsx -e "import(\"./lib/email/transport.ts\").then(async ({ verifyEmailTransport }) => { const ok = await verifyEmailTransport(); console.log(\"SMTP verify:\", ok); if (!ok) process.exit(1); })"
'
```

预期：

```text
SMTP verify: true
```

### 8.3 发送真实测试邮件

该命令会向 `ADMIN_EMAIL` 发一封邮件：

```bash
sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a
  source /etc/ai-price.env
  set +a
  cd /opt/ai-price/current
  ./node_modules/.bin/tsx -e "import(\"./lib/email/transport.ts\").then(async ({ getEmailTransport }) => { const info = await getEmailTransport().sendMail({ from: process.env.SMTP_FROM, to: process.env.ADMIN_EMAIL, subject: \"AI Price Atlas SMTP 测试\", text: \"SMTP 配置成功。\" }); console.log(\"SMTP test sent:\", info.messageId); })"
'
```

检查收件箱和垃圾邮件文件夹。命令返回 message ID 只说明服务商接受了邮件，不
代表邮件一定进入收件箱。

### 8.4 重启网站

```bash
systemctl restart ai-price.service
systemctl status ai-price.service --no-pager
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/
journalctl -u ai-price.service -n 100 --no-pager
```

预期状态为 active，HTTP 返回 `200`。

## 9. 常见问题

### `535` 或认证失败

检查：

- 是否使用授权码/应用专用密码，而不是登录密码；
- 用户名是否为完整邮箱；
- SMTP 密码是否复制完整；
- From 地址是否和认证账号或已验证地址一致；
- SES endpoint 和凭据是否属于同一个 Region。

### 连接超时

```bash
set -a
source /etc/ai-price.env
set +a
timeout 10 bash -c "echo >/dev/tcp/${SMTP_HOST}/${SMTP_PORT}" \
  && echo "SMTP TCP reachable" \
  || echo "SMTP TCP failed"
unset SMTP_PASSWORD DATABASE_URL DIRECT_DATABASE_URL CRON_SECRET EMAIL_TOKEN_SECRET
```

如果 TCP 不通，检查 host、端口、服务商限制和 VPS 出站网络。

### 邮件进入垃圾箱

- 正式使用自有域名；
- 配置 SPF、DKIM、DMARC；
- From 域名与已验证发信域名一致；
- 不突然大量发送；
- 清理无效收件地址；
- 关注退信和投诉；
- 避免夸张主题、短链和垃圾营销式内容。

### 用户订阅仍发送失败

```bash
journalctl -u ai-price.service -n 200 --no-pager
```

先确认 SMTP verify 和真实测试邮件都成功，再检查 `APP_URL`、数据库和应用日志。

## 10. 切换正式发信域名后的必做项

为邮件启用专用发信域名后：

1. 把 `APP_URL` 改成最终的 `https://域名`；
2. 使用域名邮箱作为 `SMTP_FROM`；
3. 配置 SPF；
4. 配置 DKIM；
5. 配置 DMARC；
6. 重新执行 SMTP verify；
7. 重新发送真实测试邮件；
8. 测试订阅成功通知和退订链接。

生产站点已使用 Nginx 443 和 Cloudflare Full (strict)。修改证书、Nginx 或
Cloudflare SSL 模式时必须遵循 `VPS_OPERATIONS.md`。
