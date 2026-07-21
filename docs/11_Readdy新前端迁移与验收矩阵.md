# Readdy 新前端迁移与验收矩阵

> 状态：实施中。本文是迁移过程的接线真源，不代替最终可运行产品。
>
> 代码基线：`origin/test` 的 `5e251a2`；新界面来源：本地 `readdy-export-12214982`。
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
| Apollo | `backend/app/services/apollo_config.py` 及启动配置 | `appId` 固定 `zhipin`；密钥只来自 Apollo、环境变量或 CI |
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
| `/candidates` 简历库 | recruiter/manager/admin | `/candidates`、`/resume/*`、匹配预览、批量入流程 | 搜索/筛选/详情/上传/负责人/加入 Demand 全部真实化 |
| `/kanban` 进度看板 | recruiter/manager/admin | `/pipeline/demands/*` | 只能按明确 `demand_id` 看板；推进、修正和转 Demand 走后端事务 |
| `/interviews` 面试管理 | recruiter/manager/admin | `/interviews`、`/interview/assignments`、取消、反馈、AI 面试 | 排期、取消、详情和反馈刷新后仍存在；任何反馈不自动推进主流程 |
| `/offers` Offer 管理 | recruiter/manager/admin | `/offers`、`/offers/<id>`、`/offers/<id>/actions`、Demand Offer 草稿接口 | **代码候选已接通**：真实列表、草稿、审批、发放、回复、撤回、入职和历史；不用 sessionStorage，待浏览器四角色验收 |
| `/talent-map` | recruiter/manager/admin | `/talent-maps*`、`/talent-map-companies/*`、`/talent-map-people/*` | **代码候选已接通**：正式路由、地图/公司/人选真实写入、筛选、公司优先级和人选接触状态持久化；招聘专员限本人，manager/admin 限本组织 |
| `/analytics` | manager/admin | `/bi/overview`、`/bi/demand/*` | 展示进度、瓶颈和责任协同；删除个人排名、绩效和奖金式结论 |
| `/ai-assistant` | recruiter/manager/admin | `/agent/tools`、会话、SSE chat | 复用真实会话；工具集不得包含主流程写操作 |
| `/settings` | admin；个人设置全角色 | `/admin/users`、`/auth/change-password`、审计和系统接口 | Readdy 的静态开关改成真实配置或明确只读；角色权限由后端控制 |
| `/interviewer/*` | interviewer | `/interview/assignments`、面试反馈、已分配候选人详情 | **代码候选已接通**：工作台、待筛选/反馈、我的面试、已分配候选人和参与岗位都由真实 assignment 裁剪；无全量库入口 |
| `/director/*` | manager/admin | BI、Demand、Offer 审批/反馈事实 | **路由已接通**：驾驶舱复用真实工作台，进展/洞察复用 Demand BI，审批复用 Offer 后端状态机与审计 |
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

1. 网关登录后的真实角色：现有前端用环境变量默认角色，必须改为登录后读取 `/api/auth/me`。
2. Offer：已补 `20260721_05` 迁移、`offer_events` 历史、完整状态机、列表/详情/动作 API、RBAC、组织隔离、幂等、审计和前端真实页面；还需在公司网关四角色环境完成现场验收。
3. KPI 标准：已补 `20260721_06` 迁移、组织级版本化配置、manager/admin RBAC、审计、恢复默认和 Readdy 真实页面；健康阈值已明确改为 Demand 流程健康，不是专员绩效。
4. 总监审批：Readdy 当前是只读 mock。正式审批必须先明确后端业务事实；没有接口前只可展示真实待办，不可假装审批成功。
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

## 10. 当前实施进度（2026-07-21）

- 登录、公司网关身份、Readdy 主壳、工作台和 Readdy 路由别名已接入；旧的假角色选择已移除。
- Offer 已形成真实数据库闭环。招聘专员可维护草稿和推进发放/回复/入职；只有 manager/admin 可审批；确认入职会同步把 Demand 下候选人推进到 `onboarded`。
- Offer 的所有状态变化写入 `offer_events` 和通用 `events`；重复请求可用 `Idempotency-Key` 安全重放。
- 当前 Alembic head 为 `20260721_06`；05 保留已有 `offer_records` 数据并新增生命周期/历史，06 新增组织级流程口径表。
- KPI 标准已从浏览器假持久化迁入真实后端；主管/管理员可维护，跨组织隔离，版本冲突不会静默覆盖。
- 人才地图已从隐藏试验页变为正式 Readdy 路由；地图、目标公司、潜在人选、筛选、优先级和接触状态都由后端持久化，不使用 mock 或浏览器业务存储。
- Readdy `/jobs` 已映射为真实用人需求（Demand）；旧岗位/JD 模板迁到 `/job-templates`，仍可从创建需求和岗位匹配流程到达。
- Dashboard 的面试、Offer、已入职和招聘周期路由已映射到真实面试、Offer、Pipeline 和 Demand BI；面试官与总监的 Readdy 路由已按后端角色守卫接入。
- 已从 Figma 文件 `PkZwN0jscEZXBXas5XdhKO` 的人才地图节点核对视觉真源；全局品牌色校准为 `#379f70` / `#e9f5f0`，人才地图改为横向地图和公司卡片、公司摘要、按需展开的真实写入面板。
- 仍未完成：全部 Readdy 业务页视觉替换、浏览器四角色全链路和公司 SIT 现场证据。因此本文整体状态仍为“实施中”。
