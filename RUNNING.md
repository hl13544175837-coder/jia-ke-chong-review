# 智聘 · 快速启动

> **状态声明（2026-07-11）**：本代码树是完成合并前 P0 收口的 CFPD `test` 候选。Git ref、Libra 构建、K8S 部署和测试站运行态是四类证据，不能相互替代；本说明不单独构成 SIT 已发布证明。

## 前置条件

- Python 3.11–3.13（推荐及容器基线 3.12）
- Node.js 20.19–20.x 或 22.12+，npm 10+
- pip 安装依赖前先升级安装器：`python -m pip install --upgrade pip`
- 安装后端依赖：`python -m pip install -r backend/requirements.txt`

---

## 启动后端

```bash
cd backend
PORT=5001 python run.py
```

开发联调后端固定使用 http://localhost:5001，前端开发服务会代理到这个端口。

启动日志只显示脱敏后的数据库 driver/host/database label，不打印用户名、密码或 query。`GET /api/health` 只用于进程 liveness；它返回 200 不能证明数据库连接、schema revision、backfill、uploads 或外部依赖 ready。

Libra/SIT 的 RC server 镜像在 Gunicorn 启动前依次执行受控空库 bootstrap 和 `alembic -c /app/backend/alembic.ini upgrade head`。`ALLOW_EMPTY_DATABASE_BOOTSTRAP=true` 只会初始化“真正为空”的数据库并写入当前 Alembic head；发现部分业务表或不完整 schema 会拒绝继续。`AUTO_MIGRATE_DATABASE=true` 再负责已有库的加性升级。Makefile 对 `GA` 同时关闭这两个开关，因此这不是生产自动建表/迁移授权。直接运行 `python run.py` 不触发容器 entrypoint；需要时在 `backend/` 显式执行 bootstrap 或 Alembic。

---

## 公司 MySQL 测试库试用（需现场复核）

历史试用环境快照见 [`docs/历史试用环境快照_需现场复核.md`](docs/历史试用环境快照_需现场复核.md)。这份文档只记录某一次本机接入公司 MySQL 的状态，不是当前环境证明。新开 Codex 对话时，可以先读它恢复背景，但必须再检查 `backend/.env`、`git remote -v` 和 `python3 backend/scripts/check_pilot_readiness.py`。

历史上公司测试库使用 MySQL 8.0.32，项目通过 SQLAlchemy 的 `mysql+pymysql://` 驱动连接。若现场确认本轮仍要接公司 MySQL 并给同事临时试用，`backend/.env` 至少需要包含：

```env
FLASK_DEBUG=false
DATABASE_URL=mysql+pymysql://<user>:<password>@<host>:3306/<database>?charset=utf8mb4
CORS_ORIGINS=http://localhost:5000,http://127.0.0.1:5000,http://<本机局域网IP>:5000
ALLOW_PUBLIC_REGISTRATION=false
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
BACKUP_DIR=/var/backups/zhipin
AI_RECRUITMENT_COMPLIANCE_ACK=true
CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.内网域名/privacy
AI_HUMAN_REVIEW_REQUIRED=true
FIELD_ENCRYPTION_KEY=PASTE_GENERATED_FERNET_KEY_HERE
BOSS_CLI_AUTO_INSTALL=false
ALLOW_EMPTY_DATABASE_BOOTSTRAP=false
AUTO_MIGRATE_DATABASE=false
```

`CORS_ORIGINS` 每一项必须是无路径的完整 HTTP(S) origin；`*`、`null`、带用户名/密码、path、query、fragment、空格或非 HTTP(S) scheme 都会被自检和生产启动护栏拒绝。

`FIELD_ENCRYPTION_KEY` 不能复制占位值。启用 BOSS 或进入测试/生产前，先生成固定 Fernet 密钥：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Flask 应用工厂在 RC/SIT/生产模式下不会创建或修改表。真正空库需从项目根目录显式执行 `python backend/scripts/bootstrap_database.py --allow-empty`；脚本只接受空库，发现部分建表会 fail closed。已有库升级到 `demand_id` P0 必须经过 Alembic Expand：当前 RC/SIT 由容器 entrypoint 在 Gunicorn 前执行，GA/生产由唯一 migration job 执行。只有自动化测试或 `debug + SQLite` 的本地兼容路径允许应用侧建表。任何路线都不能用手工 SQL 代替已测试的 revision。只有本地演示库需要演示数据时才执行：

```bash
cd backend
python seed_dev.py
```

真实 HR 试点库不要运行 `seed_dev.py`。

### demand_id 当前迁移与核验顺序

当前 audit/backfill/verify 脚本和 migrations 已存在。本地文件库按以下顺序验证，不跳过审批、audit 或 verify：

```bash
cd backend
alembic upgrade head
alembic current  # 当前收口候选应为 20260711_02
python scripts/audit_demand_scope.py --database <local-sqlite-fixture> \
  --output <audit-report.json> --manifest-output <mapping-to-review.json>
# 必须由 Product/Data Owner 将审批后的条目标记 approved=true
python scripts/backfill_demand_scope.py --database <local-sqlite-fixture> \
  --mapping <approved-mapping.json> --dry-run --report-output <dry-run-report.json>
python scripts/backfill_demand_scope.py --database <local-sqlite-fixture> \
  --mapping <approved-mapping.json> --apply --report-output <apply-report.json>
python scripts/verify_demand_scope.py --database <local-sqlite-fixture> \
  --output <verify-report.json>
```

上述命令的具体参数以各脚本 `--help` 为准。MySQL/PostgreSQL 不用本地 SQLite 结果代替同引擎验证；其发布与回滚门禁见 [docs/10_demand_id迁移与回滚手册.md](docs/10_demand_id迁移与回滚手册.md)。

### BOSS 直聘后端接口（实验辅助能力）

BOSS 直聘集成用于内部验证从招聘端账号拉取收件箱/推荐候选人、下载简历并导入系统的辅助流程。它不是当前 HR 试点主流程的必测项；主流程仍以手工上传简历、招聘需求、候选人匹配、流程推进、面试反馈和 BI 为准。

`/boss` 页面依赖后端 `/api/boss/*` 接口。测试环境部署后，未登录访问
`/api/boss/accounts` 应返回 401；登录后未绑定 BOSS 账号时，
`/api/boss/status` 应返回 409 `no_active_account`，不应返回 404。

BOSS 账号通过浏览器 Cookie 导入，Cookie 会写入 `boss_accounts` 表并用
`FIELD_ENCRYPTION_KEY` 加密。测试/生产环境必须使用固定 Fernet 密钥，避免后端
重启后已导入账号无法解密。涉及拉取收件箱、推荐候选人、下载简历等能力时，
后端还需要可用的 `boss` CLI。运行期依赖安装已被禁止，容器也不再为了该实验能力携带 git；旧的 `BOSS_CLI_AUTO_INSTALL=true` 会被安全忽略。若独立验证确实需要 BOSS，必须在镜像构建阶段固定并审查 CLI 版本，再用 `BOSS_CLI_BIN` 指向可执行文件。

P0 HR 主流程试点必须从主导航隐藏 `/boss` 页面，并让未单独授权的写入路径 fail closed；若要在独立验证中开放，必须先确认 BOSS Cookie 使用边界、`FIELD_ENCRYPTION_KEY`、boss CLI 安装来源和账号权限。

---

## MVP 内部试用账号

密码统一：`Zhipin2026`

| 展示角色 | 技术角色 | 邮箱 | 姓名 |
|------|------|------|------|
| 管理员 | `admin` | admin01@mvp.local | 系统管理员 |
| 招聘经理 | `manager` | manager01@mvp.local | 招聘经理01 |
| 招聘负责人 | `manager` | lead01@mvp.local | 招聘负责人01 |
| 招聘专员 | `recruiter` | hr01@mvp.local | 招聘专员01 |
| 招聘专员 | `recruiter` | hr02@mvp.local | 招聘专员02 |
| 招聘专员 | `recruiter` | hr03@mvp.local | 招聘专员03 |
| 面试官 | `interviewer` | interviewer01@mvp.local | 面试官01 |

> 权限口径只认 `admin` / `manager` / `recruiter` / `interviewer` 四类技术角色。“招聘负责人”是 `manager` 的业务展示名，不代表新增一类权限。

推荐给招聘专员一人一个账号。系统会把当前流程负责人、上传人、流程推进人和面试反馈人记录到具体用户 ID，用于找到当前责任与留痕。BI 只服务于进度、卡点和责任协同，不作个人绩效排名或奖金结算。

如果多人共用一个账号，系统无法说明当前应由谁处理，审计也无法还原谁做了哪个动作。MVP 试用阶段应各自登录自己的账号。

推荐用 **manager01@mvp.local** 或 **lead01@mvp.local** 登录，可看到完整 BI 看板和团队数据。

`demand_id` 目标看板按每条 Demand 解释当前阶段、停滞、待补反馈、Offer 和 HC；数字必须能下钻到候选人与业务事实。招聘专员只能看自己可管理的 Demand 及候选人，不能通过改 ID 查看别人数据。

面试官账号 **interviewer01@mvp.local** 只保留工作台和“我的面试”主入口。面试官可以从面试任务进入候选人详情查看材料并填写反馈；不会显示“推进 Offer/淘汰”等流程按钮，也不开放全量简历库、候选人流程、AI 助手主入口、岗位级 BI 或专员级 BI。

管理员账号用于创建账号、重置密码和管理角色。管理员重置密码、用户自己修改密码后，旧登录态会立刻失效，需要重新登录。当前 MVP 还不是完整企业管理员后台，暂未提供全量数据导出审批、导出水印、字段级权限等企业治理能力；但候选人详情查看、候选人 CSV 导出、删除、负责人转派、流程推进、Demand 关闭/恢复、角色变更、AI 解析产物落库/基线遗留写事件和越权 403 都会进入审计日志；P0 不允许 AI 写主流程。

右上角只保留通知和账号菜单。修改密码、退出登录都在账号菜单里，侧边栏不再重复显示个人信息卡片，避免试用人员把账户操作误认为招聘主流程。

招聘专员工作台里的「今日待办」会直接带到对应页面：业务待反馈、面试中跟进、Offer 跟进会进入候选人流程的对应阶段；待补反馈会进入面试任务页的待处理列表。工作台首屏 KPI 数字也可以点击下钻：候选人总数进简历库，需求/岗位总数进招聘管理，面试中进对应阶段流程。候选人流程首次打开时会优先展示有候选人且更需要处理的阶段，不会默认停在空的“待筛选”。

AI 助手首页的示例问题会按角色变化：招聘专员看到自己负责候选人的卡点和待反馈问题，经理/负责人看到团队漏斗和专员推进问题，管理员看到审计、权限和 AI 边界问题。

生产级多组织隔离使用 `users.org_id` 和业务表 `org_id`：登录后，岗位、候选人、流程、面试、BI、通知、AI 工具和审计日志都会按当前组织过滤。当前一期不提供前端“组织管理”页面，新组织开通、首个管理员和历史数据归属需要由部署初始化或数据库迁移脚本完成。

### 试用时的空数据处理

`Job` 是可复用职位/JD 模板，`RecruitmentDemand` 是具体招聘责任单。HR 可以用同一 Job 创建不同城市、部门、批次、HC 或负责人的 Demand；流程和面试必须选中具体 Demand，匹配仍使用 Job 画像。没有候选人时先上传简历；没有可用 Demand 时去需求工作台新建或恢复；面试官为空时由管理员创建或启用账号。

简历上传页只负责把简历保存到简历库。支持 PDF、DOCX 和 ZIP；旧版 `.doc` 存在宏风险，系统会跳过并提示先转换。上传成功后，如果要推进某个需求，去「简历库」选择「目标岗位 / 加入招聘需求」查看适配候选人，再点击「加入该需求流程」。筛选区里的「入需求流程状态」只用来区分候选人是否已进需求流程。候选人来源、内推人/猎头联系人和本次上传备注都是选填信息，默认收起，不影响上传。

岗位匹配结果页默认展示 AI 推荐排序。如果 HR 明确知道要找某个人，或觉得 AI 排名不准，可以切到「全部候选人」，在权限范围内按姓名、公司、学校、岗位、技能或邮箱搜索候选人；页面会继续显示该候选人与当前岗位画像的匹配预览，并允许手动加入该需求流程。匹配度、入需求流程状态、匹配技能和缺失技能筛选只影响当前结果，批量加入也只作用于当前筛选后已勾选的人。

面试安排只能选择启用中的面试官账号和在招岗位。如果账号被停用或岗位已关闭，先由管理员启用账号，或到招聘岗位页恢复在招，再重新安排面试。同一个面试官同一时间只能有一场面试；如果系统提示已有安排，需要改时间或换面试官。

面试反馈统一在「面试任务」页处理，但它不再作为招聘专员、经理或管理员的左侧一级入口。候选人在管道进入面试阶段后，可以从管道右侧点击「填写面试反馈」，系统会带着候选人和岗位定位到待反馈项；面试官在「我的面试」任务卡上点「填写反馈」后，会自动切到待处理并滚动到对应反馈表。AI 预筛参考只是辅助，不替代人工安排和反馈。

需求是流程的启停边界：Demand 暂停、取消或关闭后限制其新流程写入，但不同步关闭 Job 模板，也不影响同一 Job 下的其他 Demand。

候选人详情的 P0 目标是“原始简历 / 结构化画像 / 匹配分析”三页签，原始简历默认展示且是事实真源；AI 结果是可收起的辅助判断。原文件丢失、解析失败或用户无权限时，页面必须说明原因和下一步，不得用结构化文本伪装原件。

为避免网络抖动或用户连点造成重复数据，后端会轻量复用重复请求：同一账号短时间重复上传同一批简历会返回第一次结果；重复推进到同一阶段、重复安排同一面试、重复提交同一轮反馈，不会再追加第二条业务记录。普通写接口也支持 `Idempotency-Key`，前端或网关重试时同 key、同请求体会复用第一次结果。用户不用额外操作。

如果整批简历误导入，管理员、经理或该批次上传人可以按上传批次撤回。撤回会把该批候选人从列表、看板和匹配中移除，匿名化候选人信息并删除原简历文件；审计日志会保留谁在什么时候因为什么原因撤回。撤回不是普通恢复按钮，如需找回真实候选人数据，必须走备份恢复演练和权限审批。

如果需求被误关闭或误暂停，使用 Demand 自身的恢复动作并填写原因。Demand 的状态、优先级和负责人都是受审计业务动作，但不再同步改写 Job 模板。

管理员进入「系统设置」后，先在「账号管理」查看成员列表；需要新增试点账号时再点击「创建账号」展开表单。审计日志和 AI 边界在同一页顶部标签中切换。审计日志里能看到操作者、角色、目标、request_id、IP、来源（页面 / AI / 安全）、结果和失败原因；越权请求和短时间高频导出会标红为告警。

如果候选人推进错阶段或误淘汰，在候选人流程右侧打开「更多操作：修正阶段」，必须填写修正原因。修正会影响当前阶段和 BI 当前存量，但历史流水会保留，后续复盘能看到这次是补救操作。

如果候选人更适合另一 Demand，转移必须原子完成：来源流程记 `transferred`，目标从 `pending` 开始，当前负责人跟随目标 Demand。转出不计入淘汰；任一步失败都要整体回滚。

如果流程负责人分错，经理或管理员在具体 Demand 下选择新招聘专员并填写原因。转派更新 Demand 和活动 Flow 的当前责任，历史推进人、面试官和审计 actor 不重写。

BI 试点时先看 Demand 进度、停滞、待补反馈、HC 和当前责任；详细口径以 BI 设计文档为准。不展示个人绩效排名，不从当前负责人反推历史功劳。

### 可直接转发的试用说明

请用分配的账号登录试用智聘。系统主要帮我们找到一次招聘需求，看清候选人推进到哪一步、轮到谁处理、哪里卡住了。招聘专员主要看需求工作台、候选人和流程；经理/负责人看进度、卡点和协同责任；面试官处理“我的面试”里的本轮反馈。AI 只给辅助建议，推进或淘汰由授权用户在流程页面操作。

---

## 重置本地演示/试用数据

下面命令只适用于本地演示库或明确可重建的试用库，会清空并重建演示数据。真实 HR 试点库不要用它重置。

```bash
cd backend
python seed_dev.py
```

清空并重新写入试用用户、候选人、岗位及面试记录：7 个试用账号、10 个候选人、4 个岗位。不需要 LLM Key。

如果准备给真实 HR 小范围试点，不要用 `seed_dev.py` 重置。先 dry-run 看清理范围：

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

确认备份无误后，才由负责人执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

该脚本会先生成带 manifest 和 SHA-256 校验和的可恢复快照，再删除 `@mvp.local` demo owner 的账号及关联业务数据，并且只删除这些记录独占引用的上传文件。真实 owner、无关文件和跨范围引用不会被顺带清理；检测到混合归属会 fail closed。MySQL 暂不支持脚本自动确认清理，必须走同引擎备份恢复与受审计的 DBA 路线。

---

## 需要 LLM Key 的功能

以下功能需要配置 API Key，其余功能（登录、候选人、岗位、流程、BI、已生成的面试报告查看）完全离线可用：

- JD 结构化解析
- AI 面试出题 & 评分
- 简历上传解析
- AI 助手对话与辅助建议

创建 `backend/.env`（参考 `.env.example`）：

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
OPENAI_API_KEY=sk-你的key
# 兼容旧模块，可选但建议同值：
DEEPSEEK_API_KEY=sk-你的key
API_KEY=sk-你的key
LLM_API_KEY=sk-你的key
```

---

## 前端二次开发

```bash
cd frontend
npm ci
npm run dev      # http://localhost:5173，代理到 :5001
npm run build    # 验证生产构建；frontend/dist/ 是生成物，不提交
```

开发时只保留一个前端地址：`http://localhost:5173`。如果 5173 被占用，Vite 会直接报错，不会自动跳到 5174/5175。

## 临时外链试用

给内部同事临时试看时，可以用 Cloudflare Tunnel 或 localtunnel 把本机 `5173` 暴露出去。前端开发服务已允许 `.trycloudflare.com` 和 `.loca.lt` 临时域名访问。

优先使用 Cloudflare Tunnel：

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --protocol http2
```

如果看到 localtunnel 的英文/中文安全确认页，说明那是 localtunnel 免费通道的访问确认，不是产品报错。面向 HR 试用时优先改用 Cloudflare Tunnel 链接。
