# Readdy 新前端迁移与验收矩阵

> 状态：Codex 候选已完成第四轮“Demand 表头筛选与行内右抽屉语义收口”。同页交互基线为 `4656696`，真实筛选功能提交为 `c2dcf78`，本轮语义修正提交为 `8850949`；准确文档 HEAD 以 `git log -1` 和 `CODEX_RESULT_2026-07-22.md` 为准。本文是迁移过程的接线真源，不代替已部署环境证明。
>
> 代码基线：`origin/test` 的 `5e251a2`；当前分支 `codex/readdy-test-product`；当前 Demand 交互功能提交 `8850949`。旧公司招聘系统是视觉基准，Figma/Readdy 是流程与交互基准。
>
> 范围说明：本次是把 Figma/Readdy 梳理出的新招聘流程嫁接到现有公司前端设计体系，不是原样复制 Figma 的颜色、字体、间距和组件。正式开放仍必须满足真实 API、RBAC、组织隔离、审计和测试门禁。

## 1. 迁移目标

- 旧公司招聘系统作为视觉基准：优先复用其颜色、字体、间距、宽度、表格、按钮和信息层级；Figma/Readdy 只作为最新流程、页面关系和交互方式的基准。
- 详情和下钻默认在当前页面右侧抽屉完成，保留原列表、筛选和滚动上下文；适合聚合查看的信息可直接筛选当前列表，详情使用明确的“查看详情”入口，二者都不直接跳走。
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
| `/login` | 未登录 | 网关 OAuth + `/auth/me` | 保留公司登录视觉与真实协议，补齐错误态和会话恢复；不为嫁接流程改动鉴权底座 |
| `/dashboard` 及统计抽屉 | 全部角色 | `/candidates`、`/demands`、`/interviews`、`/notifications`；manager/admin 可用 `/bi/overview` | KPI 点击在当前页打开真实口径说明抽屉；组织级汇总无法唯一定位 Demand 时只给宽范围次级入口，不冒充精准下钻 |
| `/demands` / `/jobs` 招聘管理 | recruiter/manager/admin | `/demands`、`/jobs`、`/jobs/clarify`、匹配接口 | Demand 六个表头均可展开真实服务端筛选；职位、编号、部门、城市和截止日期保留快速筛选。行内负责人、HC、阶段数字和状态作为具体 Demand 信息，首击在当前页打开对应右侧抽屉；完整看板/工作台只作为抽屉中次级入口。岗位/JD 模板位于 `/job-templates`，新增岗位和 AI 澄清/保存仍走真实接口 |
| `/candidates` 简历库 | recruiter/manager/admin | `/candidates`、`/resume/*`、候选人流程、批量入流程 | 搜索/筛选/上传/负责人/加入 Demand 全部真实化；候选人行和姓名点击在当前页打开详情与真实流程抽屉，完整档案为次级入口 |
| `/kanban` 进度看板 | recruiter/manager/admin | `/pipeline/demands/*` | Demand 选择器 + KPI 卡 + 阶段列真实看板；候选人卡片在当前页打开流程详情抽屉；推进、淘汰、修正、转 Demand 和历史继续走真实接口；面试官无写操作按钮 |
| `/interviews` 面试管理 | recruiter/manager/admin | `/interviews`、`/interview/assignments`、取消、反馈、AI 面试 | 统计卡在当前页筛选，面试行打开右侧详情（面试信息/反馈/流程记录）；安排、取消、反馈仍是受权限控制的真实操作；支持 `status` 和 `demand` URL 筛选 |
| `/offers` Offer 管理 | recruiter/manager/admin | `/offers`、`/offers/<id>`、`/offers/<id>/actions`、Demand Offer 草稿接口 | Offer 行和姓名点击打开当前页真实详情/历史抽屉；草稿、审批、发放、回复、撤回、入职状态机不变；详情快速切换已有请求竞态保护 |
| `/talent-map` | recruiter/manager/admin | `/talent-maps*`、`/talent-map-companies/*`、`/talent-map-people/*` | **代码候选已接通**：正式路由、地图/公司/人选真实写入、筛选、公司优先级和人选接触状态持久化；招聘专员限本人，manager/admin 限本组织 |
| `/analytics` | manager/admin | `/bi/overview`、`/bi/demand/*` | 团队 KPI + 漏斗 + Demand 下钻；KPI 点击在当前页打开说明/下钻抽屉；无个人绩效排名、成本或编造月度趋势 |
| `/dashboard/hired` | recruiter/manager/admin | `/offers`（status=onboarded） | 真实已入职视图；入职行和姓名点击在当前页打开详情抽屉，完整候选人档案为次级入口 |
| `/ai-assistant` | recruiter/manager/admin | `/agent/tools`、会话、SSE chat | **错误态已加固**：会话列表/详情/能力目录失败均可见并可重试；本地会话编号按工号隔离；复用真实会话；工具集不得包含主流程写操作 |
| `/settings` | admin；个人设置全角色 | `/admin/users`、`/auth/change-password`、审计和系统接口 | Readdy 的静态开关改成真实配置或明确只读；角色权限由后端控制 |
| `/interviewer/*` | interviewer | `/interview/assignments`、面试反馈、已分配候选人详情 | **本地候选已验收**：工作台、我的面试、已分配候选人和参与岗位都由真实 assignment 裁剪；所有面试官入口统一指向 `/interviewer/interviews`，无全量库或 AI 会话预加载 |
| `/director/*` | manager/admin | BI、Demand、Offer 审批/反馈事实 | 驾驶舱 KPI 与审批行使用当前页抽屉；审批详情来自真实 Offer API，approve/reject 状态机不变；进展和洞察继续按真实风险主题组织 |
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

1. 页面已进入正式路由：视觉遵循旧公司招聘系统，流程和同页抽屉交互遵循 Figma/Readdy。
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
- Figma 文件 `PkZwN0jscEZXBXas5XdhKO` 用于核对新流程、信息关系和抽屉交互，不再作为颜色、字体、间距和组件外观的唯一视觉真源；全局品牌色已回到旧公司招聘系统的 `#00c07b` / `#009e66` 体系。
- 简历库已按 Readdy 三段式（全部候选人/招聘流程中/人才池）嫁接：批量勾选加入 Demand 走真实 `batch-pipeline`，快速详情抽屉保留完整简历入口，范围统计失败显示错误和重试。
- 招聘进度看板 `/kanban` 已按 Figma/Readdy 流程重组并沿用公司视觉：Demand 选择器、KPI 卡、阶段列、推进/淘汰/修正/历史全部走真实接口；面试官角色只读。
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

## 11. 上一轮本地基线证据（2026-07-22）

以下数字属于已提交 HEAD `5bdc6f7` 对应的上一轮证据。当前同页抽屉改动尚未形成最终提交，因此不能把这些数字直接当成本轮最终门禁；最终全量测试、构建、控制台和提交 SHA 由主任务重新收口。

- 验收环境：前端 `http://127.0.0.1:5174`、后端 `http://127.0.0.1:5001`、本地 OAuth 验收桥 `http://127.0.0.1:5100`，数据库 `/private/tmp/zhipin-codex-cef8386.db`，Alembic `20260722_07`。
- 四角色真实页面：admin、manager、recruiter、interviewer 均完成授权页面与直接输入越权 URL 验收；面试官越权页显示拒绝访问，不泄露目标页面业务数据。
- Offer 真实数据共 5 条：`draft` 1、`pending` 1、`onboarded` 3；已入职页、审批页和总监驾驶舱口径一致。
- 窄屏候选人 quickview 在 390px 视口通过，弹窗实际宽度为 382px，满足 `382 <= 390` 的验收条件。
- 最终交付页重新打开后控制台错误为 0；本地后端健康接口与前端首页均返回 HTTP 200。
- 上一轮自动化门禁：前端 90 个测试、typecheck、lint、build 均通过；后端 490 个测试通过；Base Agent 6 个测试通过。本轮新增交互测试与全量门禁结果待主任务补录。
- 本轮最终浏览器取证没有提交业务写操作；功能候选尚未 push、未进入 Libra、未部署 SIT。

## 12. 同页交互二次收口（本地候选）

### 12.1 已实现

- 新增共享右侧抽屉 `DrawerShell`：通过 portal 挂到页面根层，提供遮罩关闭、`Esc` 关闭、焦点约束与恢复、背景滚动锁定、对辅助技术的 dialog 语义，以及窄屏全宽展示。
- Demand：六个信息表头均可展开内联筛选；职位和需求编号使用精确条件，部门、城市、负责人、HC、截止日期、阶段和状态筛选在数据库分页前执行。行内负责人、HC、阶段数字和状态均在当前 `/demands` 打开对应右抽屉，不再重复套用已有筛选造成“点了没反应”。阶段抽屉使用当前 Demand 真实看板；“全部”候选人次级链接只携带 `demand`，不传无效的 `stage=all`。独立“查看详情”仍打开概览抽屉；新增 Demand、调整优先级、转派负责人、暂停/关闭和恢复继续复用真实 API、角色校验与审计。
- 候选人：点击行或姓名打开同页详情；概览和当前/历史应聘流程来自真实候选人流程接口，完整档案只作为次级入口。
- Kanban：点击候选人卡片或姓名打开当前 Demand 范围内的流程抽屉；切换 Demand 会清空旧详情和旧操作目标，避免跨 Demand 串数据；卡片外层不再伪装成包含子按钮的嵌套按钮，键盘入口由候选人姓名承担。
- 面试、Offer、已入职：点击表格行或姓名留在当前页，分别打开面试详情、Offer 详情/操作历史和入职详情；行内取消、反馈、审批或状态动作不会误触整行详情。面试的 `status` / `demand` 深链接筛选与地址栏双向同步，清除筛选后刷新不会恢复旧条件。
- Dashboard、Analytics、总监驾驶舱：KPI、今日待办、管理提醒、阶段条、阶段停留候选人与待补反馈均从纯信息/整行跳转变为当前页说明或下钻抽屉；完整工作台只在抽屉底部作为次级入口；无法唯一定位 Demand 的组织汇总不会伪装成精准阶段链接。
- 岗位模板：岗位行驱动原页面右侧详情；筛选为空时不再显示被排除岗位；新增岗位改为右侧抽屉并保留真实 AI 澄清/保存链路。
- 总监审批：待审批和最近审批行打开真实 Offer 审批详情抽屉，审批/驳回仍走后端状态机。
- Offer 详情：接口失败会在抽屉内显示可见错误条，加载或错误期间禁用打印，不再只靠瞬时提示表达失败。
- 视觉校准：保留旧公司招聘系统的视觉语言，Figma/Readdy 只指导流程及交互；全局品牌色恢复为 `#00c07b` / `#009e66`，页面、组件和 feature 源码的 Readdy 深绿硬编码已由自动合同扫描清零，没有把当前 Figma 草图的未优化视觉反向固化到正式页面。

### 12.2 已做的真实浏览器点击检查

本轮已在 Codex 专属前端 `http://127.0.0.1:5174` 实际点击并确认以下行为；这些是浏览器交互证据，不替代最终自动化门禁：

- Demand：六个表头展开器均实点可用；职位 `4→1`、需求编号 `4→1`、部门 `4→1`、城市 `4→3`、负责人 `4→2`、HC 未达成 `4→3`、面试阶段 `4→2`。本轮新实点“状态”表头，可见真实状态下拉；点击行内“招聘中”后 URL 仍是 `/demands`，右侧打开“状态与风险”并显示真实责任人和风险。点击“全部 2 人”后右侧显示该 Demand 的 2 名真实候选人，次级看板链接为 `/kanban?demand=4`。
- 候选人：打开候选人详情和“当前应聘 / 流程”，地址保持 `/candidates`，抽屉展示真实应聘记录。
- Kanban、面试、Offer、已入职：分别点击真实候选人/记录后均在原地址打开右侧抽屉，没有跳走；面试 URL 的 `status=pending_feedback` 筛选已实际生效，点击“清除全部”后地址恢复 `/interviews`，刷新不再恢复旧条件。
- Dashboard、Analytics、岗位模板、总监审批：KPI、今日待办、管理提醒、Demand 下钻 KPI、岗位行、新增岗位、审批 KPI 和审批行均完成当前页交互检查。
- 390px 窄屏：Demand 抽屉实测宽度为 390px，没有超出视口；随后已恢复桌面视口。

### 12.3 当前 P1 限制与收口边界

- 抽屉中的“完整需求工作台”“完整候选人档案”“完整看板”等仍是明确的次级跳转入口；首要信息浏览已同页化，但深度编辑没有强行塞进一个抽屉。
- `DrawerShell` 当前按单层业务抽屉设计；如果后续要求抽屉上继续叠加第二层抽屉，需要再定义焦点和遮罩栈规则。
- Kanban KPI 定位阶段、面试/Offer 统计卡筛选当前列表、岗位行更新固定右侧详情属于“同页直接反馈”，不会强制再套一层抽屉。
- 旧公司品牌色已有静态门禁；字体、间距、宽度目前仍以复用旧组件和真实浏览器检查为证据，尚未建立旧系统截图的像素级视觉回归，因此不能宣称和旧版逐像素一致。
- 阶段与 HC 筛选已保证真实分页和 legacy 单 Demand 兼容口径，但当前未对超大组织数据量做专项压测；进入生产前应基于 SIT 数据检查执行计划，并按需补阶段组合索引或预聚合查询。

### 12.4 本轮自动化与运行证据

- 前端测试文件：105 个，`npm test` 全量通过。
- `npm run typecheck -- --pretty false`、`npm run lint -- --quiet`、`npm run build`、`git diff --check` 全部通过。
- 后端 Python 3.12 全量：`493 passed`；Base Agent：`6 passed`；联合门禁共 `499 passed`。
- Alembic 代码 head：`20260722_07`；Codex 独立验收库 verifier 返回 `ok=true`，未映射事实、Demand/流程错配、活动流程冲突、面试槽位冲突、需求编号问题和默认面试官错配均为 0。
- 最终浏览器新会话控制台 error 为 0；仅有 2 条 React Router v7 future-flag 迁移提醒，不影响当前 React Router v6 运行。
- 本轮 Demand 语义修正后前端 105 个测试文件、TypeScript、ESLint 和生产构建均通过；Tabbit 真实点击的状态与阶段抽屉可用。
- 真实筛选仍在数据库分页前执行，并复用现有组织隔离、候选人最新阶段和 legacy 单 Demand 口径。本轮 `8850949` 只修正前端点击语义和测试，不新增后端接口或迁移；冻结鉴权、权限、Apollo 和 Token 文件未改。

### 12.5 不变底座与发布状态

- 公司登录、权限入口、Apollo 默认环境和 Token 链路继续冻结；冻结文件清单见第 2 节，本轮交互改动不需要修改这些协议。
- 正式页面继续使用真实后端 API；真实空态与错误态不会用 mock、浏览器存储或硬编码业务数据冒充成功。
- 当前尚未 push、尚未合并 CFPD `test`、尚未触发 Libra、尚未部署 SIT。
