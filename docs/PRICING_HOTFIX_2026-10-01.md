# 2026-10-01 官方价格采集修复

- Claude HTML 文档不再提供解析器可识别的价格表。改读同一官方文档的 `.md` 入口，保留公开 source URL、报价身份和 USD/百万 token 单位；实时复核解析 56 条报价，完整性检查通过。
- MiniMax 两份官方 Markdown 文档将表格分隔行压缩为 `:-`。仅在 MiniMax 解析入口规范化分隔行；删除划线原价后再读当前有效价格，避免把 M3 的原价当作折后价。
- MiniMax Token Plan 仍为 Plus $22、Max $55、Ultra $132/月；按量页实时解析 75 条，既有最低完整性门槛保持 67。三来源 parserVersion 分别升级到 Claude v4、MiniMax Token Plan v4、MiniMax API v8。
- 原站核验：`https://platform.claude.com/docs/en/about-claude/pricing.md`、`https://platform.minimax.io/docs/guides/pricing-token-plan.md`、`https://platform.minimax.io/docs/guides/pricing-paygo.md`。Claude 在本机受地区限制，通过生产服务器直接读取公开官方 Markdown 核验；未使用第三方渲染或登录数据。
- 不修改数据库 schema、共享 HTTP、通用 Markdown 解析器和生产配置；解析不完整时仍保留旧报价并报错。回滚使用前一个 release，数据库无需回滚。
