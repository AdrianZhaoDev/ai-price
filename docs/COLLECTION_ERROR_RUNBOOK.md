# 采集错误处理手册（AI）

用于处理异常邮件、`/admin/errors` 报错、采集任务失败或数据未同步。部署步骤以
[`VPS_OPERATIONS.md`](VPS_OPERATIONS.md) 为准；禁止直接修改生产 release。

## 1. 查看错误

先打开 `https://lowpriceradar.com/admin/errors`，按错误类型、渠道和状态筛选并展开
“完整错误日志”。再连接服务器：

```bash
ssh american-vps
systemctl status ai-price-collect-scheduled.service --no-pager
journalctl -u ai-price-collect-scheduled.service -n 350 --no-pager
sudo -u postgres psql -d ai_price -x -c "
SELECT e.id, s.slug, s.type, e.code, e.message, e.details,
       e.created_at, e.resolved_at
FROM collection_errors e
JOIN sources s ON s.id = e.source_id
WHERE e.resolved_at IS NULL
ORDER BY e.created_at DESC;"
```

不得输出 `/etc/ai-price.env`、数据库连接串、SMTP 授权码或 token。

只有同一来源连续两个 `scheduled` 运行失败，或开放错误持续达到 8 小时，才升级为
采集故障。timer 触发独立的 `ai-price-collect-scheduled.service`，并通过
`--trigger=scheduled` 标记；人工使用 `ai-price-collect.service` 或本地单来源复核，
仍记为 `manual`，不得被误计为连续计划失败。每轮失败会计算这两个阈值并按来源去重发送
管理员告警；日报还必须主动检查达到 8 小时但采集期间未再次触发的开放错误。成功采集
会清零连续失败并解决该来源的开放错误。日报必须重新读取最近完整运行，不得把 219/219
基线当作当日结果。

## 2. 根据日志判断

| 日志特征                                             | 判断与处理                                        |
| ---------------------------------------------------- | ------------------------------------------------- |
| `UND_ERR_CONNECT_TIMEOUT`、`proxy/direct`            | 网络问题；分别验证直连和 WARP，不要先改解析器     |
| HTTP `429/5xx`                                       | 临时限流或上游故障；检查重试与退避                |
| HTTP `401/403`、`ACCESS_BLOCKED`                     | URL、访问挑战或登录限制；只能改用公开官方入口     |
| `STRUCTURE_CHANGED`、`EMPTY_RESULT`、`MISSING_PRICE` | 官网结构变化；保存脱敏 fixture，修改该来源解析器  |
| `PLAN_COUNT_COLLAPSE`                                | 核对官网是否真的下架套餐；未经确认不得接受新基线  |
| 数据库约束、migration、sync 错误                     | 根据完整 stack 和 SQL 状态修复，先备份再改 schema |

修改解析器时必须升级该来源的 `parserVersion`，补充成功、缺字段、增删套餐和异常金额
测试。共享 HTTP 或解析能力发生变化时，要回归全部适配器。

## 3. 本地修复与测试

在本机仓库修改，不得在 `/opt/ai-price/current` 中修：

```powershell
Set-Location 'C:\Users\zhangjunjun\Documents\ai-price'
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
```

涉及价格跳变、套餐映射或误报时，还要在仅限回环地址的临时测试库执行：

```powershell
$env:PRICE_STABILITY_TEST_DATABASE = "true"
npm run test:price-stability
```

有本地数据库时先验证精确来源：

```powershell
npm run collect -- --source=<完整-adapter-id>
```

仅当官网明确减少套餐、日志中的来源 ID 完全匹配时，才允许单次使用：

```powershell
npm run collect -- --source=<完整-adapter-id> --accept-plan-count-change
```

## 4. 上线与复验

完整阅读 [`VPS_OPERATIONS.md`](VPS_OPERATIONS.md)，提交、推送并等待 CI 全绿，然后：

```powershell
.\deploy\vps-update.ps1
ssh american-vps
```

先验证精确来源，再跑全量任务：

```bash
cd /opt/ai-price/current
sudo -u ai-price env HOME=/var/lib/ai-price bash -c '
  set -a; source /etc/ai-price.env; set +a
  npm run collect -- --source=<完整-adapter-id>
'
systemctl start ai-price-collect.service
journalctl -u ai-price-collect.service -f
```

完成条件：

- 最新全量 run 为 `success`，`source_count = success_count`，`failure_count = 0`；
- 目标来源旧错误已解决且没有新错误；
- 日志显示 Neon `dataSync` 成功；
- Web、PostgreSQL、Nginx 和采集 timer 正常。

任一条件不满足，不得宣称修复完成；按运维手册回滚或继续定位。
