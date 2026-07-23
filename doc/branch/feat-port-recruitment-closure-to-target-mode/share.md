# 招聘闭环迁移到目标态第一阶段

- 基线：`origin/codex/target-mode-stage1-modules`（`42811e3`）。
- 任务：GitHub Issue #15；前端基线缺陷 #16；核心页面演示数据清理 #17。
- 目标：保留甲方招聘中控台、模块 facade 和 integrations capability 边界，迁移现有招聘闭环、面试通知及 Docker 本地运行能力。
- 保护边界：不修改登录鉴权、Token/JWT/RBAC、OAuth/profile、菜单按钮权限及相关构建配置；相关差异等待项目负责人明确授权。
- 当前进度：非鉴权招聘闭环迁移已完成，Issue #16、#17 已关闭。MySQL 8.0.32、前后端和企微替身已用高位端口全容器运行；真实数据已走通岗位、需求、DOCX 入库、资料修改、流程推进、安排面试、企微免登录评分评价、HR 查看结果并结束面试。前端非鉴权功能契约、类型检查、Lint、生产构建及 314 项后端业务测试通过。
- 待决策：Issue #14 的本地 OAuth 菜单 405 修复已在 `main` 的 `555812c` 完成，但涉及本分支保护的 `authMode`、`gatewayAuth`、`permissions` 和鉴权测试，未获明确授权前不移植；总迁移 Issue #15 保持打开。
- 已知范围外演示模块：Offer 管理仍使用 `MOCK_OFFERS`，人才地图仍为前端本地状态；两者不参与本轮“HR 结束面试”闭环。
