# Readdy 新前端迁移与验收矩阵

> 状态：本地代码与四角色浏览器候选已收口，功能候选 SHA 为 `5ef064a`，待推送 CFPD `test` 并完成公司 SIT 现场验收。本文是迁移过程的接线真源，不代替已部署环境证明。
>
> 代码基线：`origin/test` 的 `5e251a2`；本地功能候选 `5ef064a`；新界面来源：本地 `readdy-export-12214982`。
>
> 范围说明：本次是 Readdy 新产品全量替换，早期 P0 试点文档中“人才地图不开放”的约束已被本次明确需求取代；正式开放仍必须满足真实 API、RBAC、组织隔离、审计和测试门禁。

## 1. 迁移目标

- Readdy 导出的页面和交互作为最终前端，不保留旧前端作为第二套正式入口。
- 继续使用当前 Flask 后端、数据库、Demand 维度流程、RBAC、组织隔离、审计和 BI 口径。
- 继续使用公司网关 OAuth、`X-Emp-Code`、Apollo `appId=zhipin`、`mcp.sso.token` / `MCP_SSO_TOKEN` 及银河/集团门户/乾坤 token 交换链。
- 正式页面只展示后端真实结果。加载失败显示错误和重试，不能拿 mock、硬编码或 `localStorage` 冒充成功。
- AI 只做解析、匹配、总结和建议，不自动推进、淘汰、发 Offer、转需求或关闭 Demand。

## 2. 不能丢失的旧系统底座

| 能力 | 现有真源 | 迁移规则 |
|---|---|---|
| 公司登录 | `frontend/src/lib/gatewayAuth.ts` | 保留网关账号密码登录和 profile 查询，不使用 Readdy 的定时器假登录 |
| 会话与身份 | `frontend/src/lib/auth.tsx`、`frontend/src/lib/api.ts` | 保留 Bearer token 与 `X-Emp-Code`；登录后以 `/api/auth/me` 的后端角色为准 |
| 菜单/按钮权限 | `frontend/src/lib/permissions.tsx` | 保留 `clientId=zhipin` 的网关菜单和按钮 code；后端 RBAC 仍是最终安全边界 |
| Apollo | `backend/apollo_config.py` 及 `run.py` / `gunicorn.conf.py` 启动配置 | `appId` 固定 `zhipin`；密钥只来自 Apollo、环境变量或 CI |
| 公司第三方 token | `backend/app/services/third_party_service.py` | 保留 `mcp.sso.token` 登录及 `yhToken`、`goToken`、`omgToken` 交换 |
| 招聘流程 | `demand_service`、`pipeline_service` | Job 是岗位画像，Demand 是具体招聘任务；所有流程事实按 `demand_id` 归属 |
| 权限和隔离 | `backend/app/middleware/auth.py` 与各业务服务 | 保留 admin / manager / recruiter / interviewer 四角色、`org_id` 和负责人范围 |
| 审计与安全 | `events`、幂等记录、软删除/匿名化 | 所有关键写操作继续由后端校验、幂等并留痕 |

## 3. 角色映射

Readdy 的角色选择器只是演示开关，正式产品必须删除。角色由公司身份和后端账号决定。

| Readdy 界面称呼 | 正式技术角色 | 说明 |
|---|---|---|
| 招聘专员 | `recruiter` | 只看和操作自己负责的 Demand、候选人和岗位范围 |
| 招聘主管 | `manager` | 当前组织团队管理与运营 BI |
| 人力资源总监 | `manager` | 复用 manager 权限；总监驾驶舱不能引入个人绩效排名 |
| 系统管理员 | `admin` | 用户、系统和审计管理；仍受当前组织边界 |
| 面试官 | `interviewer` | 只看分配给自己的面试、候选人和反馈入口 |

## 4. 页面接线矩阵

| Readdy 页面 | 最终角色 | 现有后端/API | 实施动作 |
|---|---|---|---|
| `/login` | 未登录 | 网关 OAuth + `/auth/me` | 保留 Readdy 视觉，换成真实登录、错误态和会话恢复 |
| `/dashboard` 及统计抽屉 | 全部角色 | `/candidates`、`/demands`、`/interviews`、`/notifications`；manager/admin 可用 `/bi/overview` | 分区独立加载；失败不能显示伪造的 0 |
| `/jobs` 招聘管理 | recruiter/manager/admin | `/demands`、`/jobs`、`/jobs/clarify`、匹配接口 | **路由语义已对齐**：Readdy `/jobs` 展示真实 Demand；岗位/JD 模板保留在二级 `/job-templates`，不作为第二套招聘主入口 |
| `/candidates` 简历库 | recruiter/manager/admin | `/candidates`、`/resume/*`、匹配预览、批量入流程 | 搜索/筛选/详情/上传/负责人/加入 Demand 全部真实化；匹配摘要只展示后端明确返回的分数、命中项和欠缺项，前端不按自定阈值生成“建议初筛/暂不建议”等结论 |
| `/kanban` 进度看板 | recruiter/manager/admin | `/pipeline/demands/*` | **代码候选已接通**：Demand 选择器 + KPI 卡 + 阶段列真实看板；推进走 `movePipeline`，淘汰/修正填原因弹窗，历史时间线真实；新看板已支持填写原因后转 Demand；面试官无写操作按钮；`/pipeline` 仅保留为新看板兼容地址 |
| `/interviews` 面试管理 | recruiter/manager/admin | `/interviews`、`/interview/assignments`、取消、反馈、AI 面试 | **代码候选已接通**：统计卡、三维筛选、安排（Demand 带默认面试官、时间冲突高亮）、取消填原因、本人反馈复用 FeedbackForm；不触碰 pipeline 推进；角色收敛为 recruiter/manager/admin，面试官走 `/interviewer/*` |
| `/offers` Offer 管理 | recruiter/manager/admin | `/offers`、`/offers/<id>`、`/offers/<id>/actions`、Demand Offer 草稿接口 | **本地候选已验收**：真实列表、草稿、审批、发放、回复、撤回、入职和历史；Demand 加载失败或无可用 Demand 时禁止打开空表单，候选人加载失败可重试；不用 sessionStorage |
| `/talent-map` | recruiter/manager/admin | `/talent-maps*`、`/talent-map-companies/*`、`/talent-map-people/*` | **代码候选已接通**：正式路由、地图/公司/人选真实写入、筛选、公司优先级和人选接触状态持久化；招聘专员限本人，manager/admin 限本组织 |
| `/analytics` | manager/admin | `/bi/overview`、`/bi/demand/*` | **代码候选已接通**：团队 KPI + 漏斗 + Demand 下钻；无个人绩效排名/成本/渠道排名；月度趋势因无真实数据未编造 |
| `/dashboard/hired` | recruiter/manager/admin | `/offers`（status=onboarded） | **代码候选已接通**：真实已入职视图（累计/本月/Offer 至入职周期 + 入职记录表）；现有日期只能证明 Offer 记录创建到确认入职，不能冒充完整招聘周期 |
| `/ai-assistant` | recruiter/manager/admin | `/agent/tools`、会话、SSE chat | **错误态已加固**：会话列表/详情/能力目录失败均可见并可重试；本地会话编号按工号隔离；复用真实会话；工具集不得包含主流程写操作 |
| `/settings` | admin；个人设置全角色 | `/admin/users`、`/auth/change-password`、审计和系统接口 | Readdy 的静态开关改成真实配置或明确只读；角色权限由后端控制 |
| `/interviewer/*` | interviewer | `/interview/assignments`、面试反馈、已分配候选人详情 | **本地候选已验收**：工作台、我的面试、已分配候选人和参与岗位都由真实 assignment 裁剪；所有面试官入口统一指向 `/interviewer/interviews`，无全量库或 AI 会话预加载 |
| `/director/*` | manager/admin | BI、Demand、Offer 审批/反馈事实 | **代码候选已接通**：驾驶舱（biOverview 摘要+待审批计数）、进展（Demand 清单+biDemand 下钻）、洞察（按停滞/反馈积压/断流/HC 缺口主题组织，非换标题 BI 页）、审批（待审批队列+approve/reject 真实状态机） |
| `/kpi-standards` | manager/admin | `/kpi-standards`、`/kpi-standards/reset` | **代码候选已接通**：组织级版本化持久化、校验、并发冲突、审计和恢复默认；不使用 localStorage，不生成个人排名 |

## 5. Readdy 当前假数据清理范围

以下目录只可在迁移期间作为界面结构和 TypeScript 类型参考，不能被正式路由直接导入：

- `src/mocks/analytics.ts`
- `src/mocks/candidateProfiles.ts`
- `src/mocks/candidates.ts`
- `src/mocks/dashboard.ts`
- `src/mocks/director.ts`
- `src/mocks/interviewer.ts`
- `src/mocks/interviews.ts`
- `src/mocks/jobs.ts`
- `src/mocks/kpiStandards.ts`
- `src/mocks/notifications.ts`
- `src/mocks/offers.ts`
- `src/mocks/options.ts`
- `src/mocks/requisitionCandidates.ts`
- `src/mocks/resumePush.ts`
- `src/mocks/talentMap.ts`

正式完成门禁：`frontend/src` 的可达页面不得从 `mocks` 导入业务事实；不得使用浏览器存储持久化 Offer、KPI、角色、流程或审批结果。

## 6. 业务状态映射

| Readdy 展示词 | 后端主流程事实 |
|---|---|
| 待筛选 / 简历入库 | `pending` |
| AI 初筛 | `ai_screen` |
| 用人部门筛选 / 业务复筛 | `business_review` |
| 一面 / 二面 / 终面 | 主阶段统一为 `interview`；轮次放在 assignment / feedback |
| Offer 中 | `offer` + Demand 下 OfferRecord |
| 已入职 | `onboarded` |
| 已淘汰 | `rejected` |
| 已转其他需求 | `transferred`，不得统计成淘汰 |

## 7. 已识别的接口缺口

1. 网关登录后的真实角色：已改为登录后读取 `/api/auth/me`；本地四角色通过 OAuth 验收桥复用同一前端调用链，正式公司网关仍待 SIT 现场验证。
2. Offer：已补 `20260721_05` 迁移、`offer_events` 历史、完整状态机、列表/详情/动作 API、RBAC、组织隔离、幂等、审计和前端真实页面；还需在公司网关四角色环境完成现场验收。
3. KPI 标准：已补 `20260721_06` 迁移、组织级版本化配置、manager/admin RBAC、审计、恢复默认和 Readdy 真实页面；目标日期、停滞、无推荐、低面试转化候选人量、开放过久阈值和阻塞分类已真正驱动 Demand 卡点与 BI 告警，并且只用于组织流程提醒，不是专员绩效。无真实公式的风险开关和绿/黄健康分阈值已从页面与对外配置移除，旧存量字段由后端兼容忽略。
4. 总监审批：已接入真实 Offer 待审批队列和后端状态机；页面不再使用只读 mock，也不会假装审批成功。
5. 面试官“待筛选”：旧后端已支持面试 assignment/feedback，但没有可让面试官浏览全量简历的权限；页面必须按有效分配裁剪。
6. Dashboard 月度趋势和分析导出：现有 BI 以 Demand 当前运营为主；新增统计必须保持可解释口径，不生成个人绩效排名。

## 8. 分阶段验收门禁

每个模块只有同时满足以下条件才标记完成：

1. Readdy 页面已进入正式路由，视觉和交互保持一致。
2. 加载、空数据、错误、重试和无权限状态齐全。
3. 所有展示数据来自真实 API；所有写操作刷新页面后仍存在。
4. 前端角色守卫、网关菜单/按钮权限和后端 RBAC 三层一致。
5. 组织隔离、负责人范围、Demand 状态和幂等约束通过负向测试。
6. 对应前端测试、后端测试、构建和浏览器主流程通过。
7. API、运行、迁移和验收文档已同步。

## 9. 接手基线（2026-07-21）

- 旧前端：类型检查和生产构建通过；1 个会话持久化测试仍按旧的固定 `/api` 字符串断言。
- 旧后端：437 个测试通过；2 个部署脚本测试因 shell 中变量后直接连接中文全角字符而失败。
- Readdy：约 3.1 万行前端源码、25 个页面路由，主要业务页面直接依赖 15 份 mock 数据。
- 上述失败均记录为迁移前基线，实施结束前必须修复并重新跑全量测试。

## 10. 当前实施进度（2026-07-22）

- 登录、公司网关身份、Readdy 主壳、工作台和 Readdy 路由别名已接入；旧的假角色选择已移除。
- Offer 已形成真实数据库闭环。招聘专员可维护草稿和推进发放/回复/入职；只有 manager/admin 可审批；确认入职会同步把 Demand 下候选人推进到 `onboarded`。
- Offer 的所有状态变化写入 `offer_events` 和通用 `events`；重复请求可用 `Idempotency-Key` 安全重放。
- 当前 Alembic head 为 `20260722_07`；05 保留已有 `offer_records` 数据并新增生命周期/历史，06 新增组织级流程口径表，07 补齐 AI 会话归档/调用审计并增加 Offer 组织内唯一约束。
- KPI 标准已从浏览器假持久化迁入真实后端；主管/管理员可维护，跨组织隔离，版本冲突不会静默覆盖；目标日期、阶段停滞、无推荐、低面试转化候选人量、开放过久阈值和阻塞分类已被 Demand/BI 服务读取，旧版本缺字段时由后端补默认值，旧存量死字段则兼容忽略。
- 人才地图已从隐藏试验页变为正式 Readdy 路由；地图、目标公司、潜在人选、筛选、优先级和接触状态都由后端持久化，不使用 mock 或浏览器业务存储。
- Readdy `/jobs` 已映射为真实用人需求（Demand）；旧岗位/JD 模板迁到 `/job-templates`，仍可从创建需求和岗位匹配流程到达。
- Dashboard 的面试、Offer、已入职和招聘周期路由已映射到真实面试、Offer、Pipeline 和 Demand BI；面试官与总监的 Readdy 路由已按后端角色守卫接入。
- 已从 Figma 文件 `PkZwN0jscEZXBXas5XdhKO` 的人才地图节点核对视觉真源；全局品牌色校准为 `#379f70` / `#e9f5f0`，人才地图改为横向地图和公司卡片、公司摘要、按需展开的真实写入面板。
- 简历库已按 Readdy 三段式（全部候选人/招聘流程中/人才池）嫁接：批量勾选加入 Demand 走真实 `batch-pipeline`，快速详情抽屉保留完整简历入口，范围统计失败显示错误和重试。
- 招聘进度看板 `/kanban` 已从旧 Pipeline 页换成 Readdy 视觉真实看板：Demand 选择器、KPI 卡、阶段列、推进/淘汰/修正/历史全部走真实接口；面试官角色只读。
- 面试管理 `/interviews` 已换成 Readdy 真实页面：安排（默认面试官+时间冲突提示）、取消（填原因）、本人反馈、查看反馈；不触碰主流程推进；角色收敛为 recruiter/manager/admin。
- 已入职 `/dashboard/hired` 已形成真实视图：Offer 生命周期 `onboarded` 记录、累计/本月/Offer 至入职周期摘要，不再是跳转占位；完整招聘周期须以后端明确起点与统计字段为准。
- 数据分析 `/analytics` 与总监四页已接通真实 BI/Offer：无个人绩效排名、无编造月度趋势；洞察页按风险主题组织。
- AI 助手错误态已加固：会话列表/详情/能力目录失败可见可重试，会话列表已接通后端分页、新建、重命名和软归档；会话与消息同时按用户和组织隔离，已归档会话不能继续写入。每次 chat/execute 的成败、耗时、模型和工具链写入脱敏限长的组织审计日志，只有管理员可查看。
- 本地四角色已通过真实浏览器登录和路由验收：管理员、招聘经理、招聘专员、面试官均走登录页；直接输入越权 URL 会保留原地址并显示清楚的“无权访问”页，不泄露目标页面业务数据。面试官“我的面试”入口已修正为 `/interviewer/interviews`，且不再后台请求无权 AI 会话接口。
- 最终验收库的流程、阶段和 Offer 记录均使用明确 `demand_id`，阶段性演示库兼容口径不再作为当前证据；本次最终浏览器取证只读查看真实页面，没有提交会改变业务事实的写操作。
- Offer 次级数据失败保护已补齐；本地无可用 Demand 时按钮禁用并给出下一步，候选人列表失败时可重试且不能保存空草稿。
- 本地验收环境固定使用 Python 3.12、`:5001` 后端、`:5100` OAuth 验收桥和 `:5174` 前端；正式构建与 SIT 不使用验收桥。
- 最终本地证据见 [`evidence/2026-07-22-codex-final/README.md`](./evidence/2026-07-22-codex-final/README.md) 与机器可读的 [`acceptance.json`](./evidence/2026-07-22-codex-final/acceptance.json)；`evidence/2026-07-22/` 仅保留为历史预收口记录。
- 仍未完成：CFPD `test` 推送、Libra 构建/部署、公司网关、Apollo/MCP Token 和 SIT 四角色现场证据；`/settings` 继续使用现有真实管理页，未做纯视觉重写。不能把本地通过表述成 SIT 已上线。

## 11. 最终本地证据（2026-07-22）

- 验收环境：前端 `http://127.0.0.1:5174`、后端 `http://127.0.0.1:5001`、本地 OAuth 验收桥 `http://127.0.0.1:5100`，数据库 `/private/tmp/zhipin-codex-cef8386.db`，Alembic `20260722_07`。
- 四角色真实页面：admin、manager、recruiter、interviewer 均完成授权页面与直接输入越权 URL 验收；面试官越权页显示拒绝访问，不泄露目标页面业务数据。
- Offer 真实数据共 5 条：`draft` 1、`pending` 1、`onboarded` 3；已入职页、审批页和总监驾驶舱口径一致。
- 窄屏候选人 quickview 在 390px 视口通过，弹窗实际宽度为 382px，满足 `382 <= 390` 的验收条件。
- 最终交付页重新打开后控制台错误为 0；本地后端健康接口与前端首页均返回 HTTP 200。
- 自动化门禁：前端 90 个测试、typecheck、lint、build 均通过；后端 490 个测试通过；Base Agent 6 个测试通过。
- 本轮最终浏览器取证没有提交业务写操作；功能候选尚未 push、未进入 Libra、未部署 SIT。
