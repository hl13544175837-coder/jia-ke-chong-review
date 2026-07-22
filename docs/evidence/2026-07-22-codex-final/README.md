# 2026-07-22 Codex 最终本地验收证据

> 结论：`codex/readdy-test-product` 的功能候选 SHA 为 `5ef064a`，基于远端 `test` `5e251a2`。本目录只证明本机自动化与真实浏览器页面验收通过；当前未 push、未进入 Libra 构建/部署、未在 SIT 生效，不能表述为 SIT 已部署或已上线。

机器可读结果见 [`acceptance.json`](./acceptance.json)。此前的 [`../2026-07-22/`](../2026-07-22/README.md) 仅为历史预收口证据。

## 验收环境

- 日期与时区：2026-07-22，Asia/Shanghai
- 分支：`codex/readdy-test-product`
- 远端基线：`origin/test@5e251a2`
- 功能候选：`5ef064a9f1874d176271ffe3dbcc2c580e912795`
- 浏览器前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:5001`
- 本地 OAuth 验收桥：`http://127.0.0.1:5100`
- 数据库：`/private/tmp/zhipin-codex-cef8386.db`
- Alembic：`20260722_07`

OAuth 验收桥只绑定本机，用于让四角色复用正式前端的登录调用形状；它不代表公司网关、Apollo 或 Token 交换已在 SIT 验收。

## 数据快照

- Offer 共 5 条：`draft` 1、`pending` 1、`onboarded` 3。
- `candidate_demand_flows`、`pipeline_stages` 与 `offer_records` 的 `demand_id` 均无 NULL 记录。
- 本次最终浏览器取证只读查看页面，没有提交会改变业务事实的写操作。

## 四角色真实页面验收

| 角色 | 真实页面 | 权限与越权结果 |
|---|---|---|
| admin | 招聘看板、系统设置 | 授权页面正常加载，真实导航和数据可见 |
| manager | 总监驾驶舱、简历库、Offer 审批、已入职 | 授权页面正常；Offer 总数与状态分布一致 |
| recruiter | 简历库、看板、面试、Offer、已入职、人才地图、AI 助手 | 授权入口按招聘专员范围展示；无 manager/admin 专属入口 |
| interviewer | 我的面试、越权拒绝页 | 只显示有效分配；直接输入无权 URL 显示拒绝访问，不泄露目标页面数据 |

## 窄屏验收

- 候选人 quickview 使用 390px 宽视口，弹窗实际宽度为 382px，满足 `382 <= 390`。
- 抽屉内容可读，关键操作与完整简历入口可达，没有依赖桌面宽度才能查看的业务信息。

## 运行态检查

- 最终交付页重新打开后，浏览器控制台错误为 0。
- 后端 `/api/health` 返回 HTTP 200，前端首页返回 HTTP 200；OAuth 验收桥的正式登录接口由四角色真实登录验证。

## 自动化门禁

| 门禁 | 最终结果 |
|---|---|
| 前端测试 | 90 个测试通过 |
| 前端 typecheck | 通过 |
| 前端 lint | 通过 |
| 前端生产 build | 通过 |
| 后端全量测试 | 490 个测试通过 |
| Base Agent | 6 个测试通过 |
| Alembic head | `20260722_07` |

## 截图清单

| 文件 | 证据内容 | 尺寸 |
|---|---|---|
| [`admin-kanban.jpg`](./admin-kanban.jpg) | 管理员招聘看板 | 1272×716 |
| [`admin-settings.jpg`](./admin-settings.jpg) | 管理员系统设置 | 1272×716 |
| [`manager-director-cockpit.jpg`](./manager-director-cockpit.jpg) | 招聘经理总监驾驶舱 | 1272×716 |
| [`manager-candidates.jpg`](./manager-candidates.jpg) | 招聘经理真实简历库 | 1272×716 |
| [`manager-approvals.jpg`](./manager-approvals.jpg) | 招聘经理 Offer 审批 | 1272×716 |
| [`manager-hired.jpg`](./manager-hired.jpg) | 招聘经理已入职页 | 1280×720 |
| [`interviewer-my-interviews.jpg`](./interviewer-my-interviews.jpg) | 面试官我的面试 | 1272×716 |
| [`interviewer-access-denied.jpg`](./interviewer-access-denied.jpg) | 面试官越权拒绝页 | 1272×716 |
| [`mobile-candidate-quickview.jpg`](./mobile-candidate-quickview.jpg) | 382px 窄屏候选人 quickview | 382×827 |

## 尚未完成的公司环境门禁

1. 尚未将功能候选 push 到 CFPD `test`。
2. 尚未触发或完成 Libra 构建与部署。
3. 尚未在公司 SIT 验证真实网关、Apollo/MCP Token、部署 CommitID、镜像、schema 和四角色现场行为。
4. 因此本地证据不能替代 SIT 发布证据，也不能作为生产上线证明。
