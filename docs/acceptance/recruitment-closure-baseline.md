# 招聘闭环长任务开工基线

记录时间：2026-07-28（Asia/Shanghai）

## 恢复点

- 恢复点名称：`JIAKECHONG-SAFEPOINT-20260728-BEFORE-LONGTASK`
- 原工作区分支：`codex/local-original-recruitment-flow`
- 原工作区 HEAD：`3798c631d7fb4c1bcaaf9a7de1683e79b42fc4c5`
- 安全快照提交：`4cfec352002fcdda0a247032fcde63ee8ba692a2`
- 安全快照分支：`safepoint/jiakechong-20260728-before-longtask`
- 完整文件副本：`/Users/yenns/Documents/新版招聘/_restore/JIAKECHONG-SAFEPOINT-20260728-BEFORE-LONGTASK/zhipin-mvp`
- 文件校验：源目录与副本均为 48,710 个文件，`rsync -anic --delete` 差异 0 行。

恢复提示词：

> 恢复本地项目到 `JIAKECHONG-SAFEPOINT-20260728-BEFORE-LONGTASK`，不要推送、不要合并。

## 原工作区未提交内容

```text
 M backend/seed_dev.py
 M backend/tests/test_seed_dev_demand_scope.py
?? .superpowers/
?? backend/scripts/add_interview_demo_data.py
?? docs/superpowers/plans/2026-07-27-recruitment-product-closure-v2.md
```

这些内容已同时进入完整文件副本和安全快照；原工作区未被清理、覆盖或切换分支。

## 隔离开发环境

- 开发分支：`codex/recruitment-product-closure-v2`
- 开发目录：`/Users/yenns/Documents/新版招聘/zhipin-mvp/.worktrees/recruitment-product-closure-v2`
- 起点：安全快照提交 `4cfec352002fcdda0a247032fcde63ee8ba692a2`
- 技术栈：保持现有 Flask / SQLAlchemy / React / Vite，不升级依赖。
- 发布边界：只在本地提交，不推送、不合并。

## 自动化基线

| 检查 | 命令 | 结果 |
|---|---|---|
| 后端全量 | `.venv/bin/pytest backend/tests -q` | 586 passed，0 failed，5 个既有依赖弃用警告 |
| 前端契约 | `node --test frontend/tests/*.test.mjs` | 132 passed，1 failed |
| 前端已知缺件 | `readdy_zip_exact_parity.test.mjs` | 缺少仓库外 `references/readdy-export.zip`，与业务代码无关 |
| 类型检查 | `npm --prefix readdy-frontend run type-check` | exit 0 |
| 代码检查 | `npm --prefix readdy-frontend run lint` | exit 0 |
| 正式构建 | `npm --prefix readdy-frontend run build` | exit 0；仅有既有大包体积警告 |

## 界面冻结基线

- 招聘角色侧栏保留：工作台、招聘需求、候选人、面试管理、Offer、人才地图。
- 人才地图完全排除，不修改源码、路由、数据和测试。
- 不删除、改名或换序现有导航、页签、主要板块、表格列和常用入口。
- 同一页面整个任务累计最多新增两个常驻控件；低频动作使用现有“更多/…”菜单。
- 当前实际试点前端为 `readdy-frontend`（5190）；`frontend/tests` 是仓库级契约测试目录，不代表改动旧 `frontend/src` 页面。

## 基线结论

恢复点、隔离工作区和现有自动化基线均已记录。唯一前端失败是开工前已经存在的仓库外 ZIP 缺件；后续业务验收不得把该缺件算成本次回归，也不得用它掩盖新增失败。
