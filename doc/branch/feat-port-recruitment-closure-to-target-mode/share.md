# 招聘闭环迁移到目标态第一阶段

- 基线：`origin/codex/target-mode-stage1-modules`（`42811e3`）。
- 任务：GitHub Issue #15。
- 目标：保留甲方招聘中控台、模块 facade 和 integrations capability 边界，迁移现有招聘闭环、面试通知及 Docker 本地运行能力。
- 保护边界：不修改登录鉴权、Token/JWT/RBAC、OAuth/profile、菜单按钮权限及相关构建配置；相关差异等待项目负责人明确授权。
- 当前进度：正在梳理两条分支的业务能力、冲突文件和可安全迁移提交。
