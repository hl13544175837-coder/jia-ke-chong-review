# 技术债解耦基线记录

## 版本

- 隔离工作区：`/Users/yenns/Documents/新版招聘/zhipin-mvp/.worktrees/technical-debt-decoupling`
- 开发分支：`codex/technical-debt-decoupling-20260804`
- 基线提交：`5654d502d550`
- 基线包含滚动修复：`2e61c47`
- 2026-08-04 核验的公司 GitLab `test`：`d5801f53cb7742eb913104fad9066b16a48dc6d5`
- 数据库唯一迁移头：`20260804_14`

## 自动门禁

执行命令：

```bash
bash scripts/check-sit-release.sh
```

结果：

- 后端及 Agent 测试：679 passed，0 failed，5 个第三方 SWIG 弃用提醒。
- 前端契约测试：126 passed，0 failed。
- TypeScript 类型检查：通过。
- ESLint：通过。
- Vite 正式构建：通过，2420 个模块完成转换。
- 前端入口包：307.8 KB，上限 351.6 KB，通过。
- 最大路由包：95.0 KB，上限 127.0 KB，通过。
- 前端依赖安全：通过；仅保留未启用 RSC 模式的不适用公告例外。
- Python 依赖安全：未发现已知漏洞。
- Git 差异格式：通过。
- SIT 实值配置：本次未提供 `SIT_ENV_FILE`，不冒充公司环境验收。

## 已有页面基线证据

本轮重构前的已审批主流程截图继续以以下记录为准：

- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-01-demand-list.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-02-demand-detail.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-03-candidate-detail.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-04-interview-list.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-05-interview-detail.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-07-interviewer-screening.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-10-interviewer-interview-detail.png`
- `docs/verification/2026-08-04-recruitment-six-optimizations/actual-11-offer-list.png`

人才地图当前仍运行时读取 `readdy-frontend/src/mocks/talentMap.ts`，属于本计划明确整改项，不把演示数据截图作为真实接口验收证据。

## 基线边界

- 不处理企业微信消息、企业微信日历和 ZIP 解析。
- 不改变已审批页面视觉和招聘业务流程。
- Mock 数据没有清理，现有本地数据没有迁移或删除。
- 所有后续变化必须与本记录对比；出现非计划行为变化时停止并回退对应小提交。
