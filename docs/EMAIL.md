# 邮件系统

面向站点管理员的服务商选择、QQ/163/腾讯云/Amazon SES 配置、VPS 填写与测试
步骤见 [SMTP 邮件配置教程](SMTP_SETUP.md)。

## 功能

- 用户价格订阅确认。
- 价格变化通知。
- 一键退订。
- 采集失败管理员告警。
- 每次发送有 delivery 记录，便于去重和排查。

## SMTP

使用 Nodemailer 标准 SMTP，可配置：

- AWS SES SMTP
- 阿里云邮件推送 SMTP
- 腾讯企业邮
- QQ 邮箱
- 163 邮箱
- Gmail
- 自建 SMTP

环境变量：

```dotenv
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="AI Price Atlas <price@example.com>"
ADMIN_EMAIL=
APP_URL=http://localhost:3100
EMAIL_TOKEN_SECRET=
```

`SMTP_SECURE=true` 通常配端口 465；端口 587 一般使用
`SMTP_SECURE=false`。`EMAIL_TOKEN_SECRET` 至少 32 个随机字符，
`APP_URL` 必须是用户可访问的生产域名，否则确认和退订链接无效。

## 用户流程

1. 用户选择产品或具体套餐并填写邮箱。
2. 服务端校验邮箱、限流并创建待确认记录。
3. 发送带一次性 token 的确认邮件。
4. 用户点击后激活订阅。
5. 一轮采集完成后，重新计算该套餐当前与上一轮的人民币最低三档。
6. 只有变动进入或离开最低三档时，发送包含当前最低三档的汇总通知。
7. 邮件底部始终包含退订链接。

## 安全与送达

- token 保存 SHA-256/HMAC 哈希，不保存明文。
- 确认 token 24 小时过期。
- 防止同一邮箱重复订阅。
- 对同一 IP 和邮箱限流。
- 配置 SPF、DKIM、DMARC。
- 发件域名和公开站点域名保持一致。
- 处理退信和投诉，生产环境维护 suppression list。

## 管理员告警

下列事件发邮件：

- 同一来源连续三次失败。
- 26 小时没有成功采集。
- 套餐数量下降超过 30%。
- 单次价格跳变超过 50%。
- SMTP 自检失败。

采集来源连续三次失败后，每轮错误通过 `email_deliveries.dedupe_key`
去重并发送一次；价格跳变超过 50% 立即告警。恢复状态在下一轮成功采集时清零。
汇率自身波动只更新人民币参考，不会被当作官方原价变化发送邮件。
