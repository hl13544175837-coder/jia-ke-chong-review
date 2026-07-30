# 智聘·招聘管理系统 — 部署文档

> **版本**：2026-07-11 demand-scoped P0 closeout candidate
> **适用环境**：Windows 10/11、Linux（Ubuntu 20.04+）、macOS 13+  
> **架构**：React SPA + Flask/Gunicorn 模块化单体；SQLite（开发）/ MySQL（公司试点）/ PostgreSQL（兼容）
>
> **状态**：本代码树已完成合并前 P0 收口，可作为 CFPD `test` 的下一代码候选。推送 Git、完成构建、产生部署记录和测试站实际运行是不同状态；生产与真实数据仍执行本文完整门禁。

---

## 目录

1. [系统架构](#1-系统架构)
2. [环境要求](#2-环境要求)
3. [快速启动（本地开发）](#3-快速启动本地开发)
4. [演示数据初始化](#4-演示数据初始化)
5. [LLM API 配置](#5-llm-api-配置)
6. [生产部署](#6-生产部署)
7. [公网穿透（cloudflared）](#7-公网穿透cloudflared)
8. [MVP 内部试用账号](#8-mvp-内部试用账号)
9. [功能模块说明](#9-功能模块说明)
10. [常见问题](#10-常见问题)

---

## 1. 系统架构

```
前端 (Vite + React + TS + Tailwind)
    │  开发模式: readdy-frontend 默认 localhost:3000；完整验收使用 :5190
    │  单入口部署: Flask 直接托管 readdy-frontend/out (SPA)
    ▼
后端 (Flask + SQLAlchemy)  开发 localhost:5001 / 生产 localhost:5000
    ├── /api/auth          认证 (JWT + RBAC)
    ├── /api/resume        简历上传/解析 (PDF + Word)
    ├── /api/candidates    候选人管理
    ├── /api/jobs          岗位管理 + JD 智能解析
    ├── /api/match         候选人-岗位匹配
    ├── /api/interview     AI 面试题生成 + 评估
    ├── /api/pipeline      候选人管道
    ├── /api/bi            Demand 进度、瓶颈与当前责任协同（不做人员排名/绩效）
    ├── /api/agent         LangGraph AI 助手 (SSE 流式)
    └── /api/boss          BOSS 直聘实验辅助能力：账号导入、收件箱、推荐候选人和简历下载
    │
    ├── base_agent/        LLM 客户端 / 简历解析 / 匹配算法
    └── hireinsight.db     SQLite 数据库 (试点/生产换 MySQL 或 PostgreSQL)
```

**角色权限**：

| 角色 | 权限范围 |
|------|---------|
| admin | 当前组织内账号、候选人、岗位、流程、BI、审计和 AI 边界管理 |
| manager | 当前组织内团队 BI、岗位/候选人/流程管理 |
| recruiter | 当前组织内自己负责的候选人、岗位、匹配、AI 面试和个人数据；不能查看或操作别人负责的岗位 |
| interviewer | 分配给自己的候选人查看 + 面试反馈 |

---

## 2. 环境要求

| 组件 | 最低版本 | 备注 |
|------|---------|------|
| Python | 3.11–3.13 | 推荐及容器基线 3.12 |
| Node.js | 20.19–20.x 或 22.12+ | 与 `readdy-frontend/package.json` engines 一致 |
| npm | 10+ | 使用 lockfile 和 `npm ci` |
| Git | 任意 | 可选 |

> BOSS 直聘模块是实验辅助能力，不属于 HR 试点主流程必测项。若开放该模块，还需要可用的 `boss` CLI。运行期自动安装已被禁止，容器不为该实验能力携带 git；旧的 `BOSS_CLI_AUTO_INSTALL=true` 会被安全忽略。请在镜像构建阶段固定、审查 CLI 版本并设置 `BOSS_CLI_BIN`。BOSS Cookie 会用
> `FIELD_ENCRYPTION_KEY` 加密落库，测试/生产环境必须配置固定 Fernet 密钥。

---

## 3. 快速启动（本地开发）

### 3.1 克隆/解压项目

```bash
# 解压后进入项目根目录
cd 智聘-招聘管理系统
```

### 3.2 安装后端依赖

```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3.3 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`。本地开发只跑 HR 主流程时，至少填写 LLM 和 JWT 配置：
```env
# LLM 配置（必填，否则 AI 功能不可用）
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
OPENAI_API_KEY=sk-your-deepseek-key-here   # 主推荐字段
DEEPSEEK_API_KEY=sk-your-deepseek-key-here  # 兼容旧模块，建议同值
API_KEY=sk-your-deepseek-key-here           # 兼容旧模块，建议同值
LLM_API_KEY=sk-your-deepseek-key-here       # 兼容旧模块，建议同值

# JWT 密钥（生产环境请修改）
JWT_SECRET=change-me-in-production
```

本地只验证 HR 主流程时，可以暂不配置 BOSS Cookie 密钥。只要要测试 BOSS，或进入测试/生产环境，就必须先生成固定 Fernet 密钥，并写入 `backend/.env`：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```env
FIELD_ENCRYPTION_KEY=PASTE_GENERATED_FERNET_KEY_HERE
```

不要把 `PASTE_GENERATED_FERNET_KEY_HERE` 或尖括号占位值原样复制到可用环境。

### 3.4 启动后端

```bash
cd backend
PORT=5001 python run.py
```

输出 `✓ 智聘 · 招聘管理系统 后端已启动 http://localhost:5001` 即启动成功。

### 3.5 安装前端依赖并启动

**Windows PowerShell**（推荐，npm 仅在 PowerShell 可用）：
```powershell
cd readdy-frontend
npm ci
npm run dev
```

**Linux / macOS**：
```bash
cd readdy-frontend
npm ci
npm run dev
```

直接运行 Vite 时访问 **http://localhost:3000**；完整本地验收使用根目录 `./scripts/serve-isolated-demo.sh` 后访问 **http://127.0.0.1:5190**。

---

## 4. 演示数据初始化

仅本地开发/演示数据库可以运行下面命令。运行一次后会创建全套演示数据（候选人 / 岗位 / 流程 / 面试报告），可多次运行（每次清空重建）：

```bash
cd backend
python seed_dev.py
```

**无需 LLM API Key**，所有 AI 生成字段已预填。真实 HR 试点库、公司测试库和生产库不要执行 `seed_dev.py`。

正式试点前不要把演示数据带到真实环境。清理时先预览：

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

确认备份目录、数据库和上传目录后，先进入停写窗口并停止应用 worker/异步任务，再由负责人执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

脚本会先生成带 manifest 和 SHA-256 校验和的可恢复快照，再删除 `@mvp.local` demo owner 及其关联业务数据；只删除这些记录独占引用的上传文件，真实 owner、无关文件和跨范围引用不会被顺带清理。发现混合归属会 fail closed；MySQL 暂不支持脚本自动确认清理，必须走同引擎恢复演练和受审计的 DBA 路线。表结构会保留。

### 数据库生命周期

RC/SIT/生产的 Flask 应用工厂不会执行 `create_all`、补列或其他 DDL。真正空库只能显式运行 `python backend/scripts/bootstrap_database.py --allow-empty`：脚本验证数据库完全为空后创建 metadata 并写入当前 Alembic head；缺失任一 `20260710_01` 之前的旧基线业务表都会拒绝继续且不 stamp，`candidate_demand_flows` 则由该 Expand revision 新建。已有库统一使用 `alembic upgrade head`，当前收口候选 head 为 `20260730_13`；revision 11 增加简历指纹，revision 12 增加简历版本，revision 13 增加面试改约申请与历史索引，均不回填或改写已有业务行。只有自动化测试或显式 `FLASK_DEBUG=true + LOCAL_SCHEMA_COMPAT=true + SQLite` 本地兼容路径允许应用侧建表。

因此 Gunicorn/Flask worker 只消费已准备好的 schema；生产必须由唯一 migration job 执行升级。禁止用手工 SQL、多个 worker 并发迁移或“启动失败后让应用补一补”替代受测试的 revision。

`20260711_04` 会读取并规范化现有 Demand `request_no`，必须在停止 Demand 创建/编辑、排空旧后端实例与可能写 Demand 的 worker 后才能执行。从停写开始到 `alembic current == 20260711_04` 且 `verify_demand_scope.py` 通过前，不得恢复 Demand 写入。该 revision 的 downgrade 只恢复列可空性并移除唯一索引，不会还原大小写、首尾空格、空编号或 80 字符截断前的原始值；若必须恢复这些原值，只能使用迁移前同一 backup ID 的整库快照。

---

## 5. LLM API 配置

系统支持 DeepSeek（推荐）和 OpenAI 兼容接口：

### DeepSeek（推荐，默认）

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
LLM_MAX_TOKENS=8192
OPENAI_API_KEY=sk-your-deepseek-key
DEEPSEEK_API_KEY=sk-your-deepseek-key
API_KEY=sk-your-deepseek-key
LLM_API_KEY=sk-your-deepseek-key
```

### OpenAI

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_URL=https://api.openai.com/v1/chat/completions
OPENAI_API_KEY=sk-your-openai-key
```

### 依赖 LLM 的功能

| 功能 | 离线可用 |
|------|---------|
| 简历 AI 解析 (PDF/DOCX) | ❌ 需要 LLM |
| JD 结构化 + 澄清追问 | ❌ 需要 LLM |
| AI 面试题生成 + 评估 | ❌ 需要 LLM |
| LangGraph AI 助手对话 | ❌ 需要 LLM |
| 候选人列表 / 岗位管理 / 流程看板 / BI 看板 | ✅ 离线可用 |

---

## 6. 生产部署

### 公司 Libra / SIT 发布防错说明

可复用的实际发布路线见 [docs/08_Libra_SIT发布路线.md](./docs/08_Libra_SIT发布路线.md)。后续用户说“发布到 test / SIT”或“test-zhipin 没变化”时，先按该文档执行。

公司测试站 `https://test-zhipin.yimidida.com/` 不是读取本地默认 `origin` 仓库。Libra 发布平台当前读取的代码源是：

```bash
git@git.ymdd.tech:cfpd/zhipin-mvp.git
```

本地常见的 `origin` 可能指向 `git@git.ymdd.tech:arc/zhipin-mvp.git`。把代码推到 `origin/test` 只代表 ARC 仓库更新，不代表 Libra/SIT 会构建到这次修改。发布前必须先确认 CFPD 仓库的 `test` 分支已经包含目标提交：

```bash
git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test
```

如果修复先落在其他仓库或分支，不能把整条历史强推到 CFPD。应从 CFPD 当前 `test` 切出临时工作区，只带本次必要改动，再推回 CFPD 的 `test`：

```bash
git fetch git@git.ymdd.tech:cfpd/zhipin-mvp.git '+refs/heads/*:refs/remotes/cfpd/*' --prune
git worktree add -B codex/cfpd-<fix-name> /tmp/zhipin-cfpd-<fix-name> cfpd/test
cd /tmp/zhipin-cfpd-<fix-name>
# 修改代码并完成专项验证
git push git@git.ymdd.tech:cfpd/zhipin-mvp.git HEAD:test
```

Libra 页面操作先进入执行 pipeline 页，选择 `test` 分支构建 `zhipin-server` 与 `zhipin-frontend`；可以勾选“构建完成自动部署到 SIT 环境”，但勾选不等于部署已发生。构建后先在“部署日志”分别核对本批次两个模块的 RC：已有发布记录就等待结果，不再手工绑定同一版本；pipeline 已结束且刷新后仍只有构建版本、没有部署记录，才进入“持续交付 → 持续发布 → k8s应用管理”核对可绑定版本并发布。任何时候都必须确认 pipeline `sha` / `CommitID` 等于 CFPD `test` 目标提交，再做测试站资产与受控 API 验收。

历史上也可能通过构建成功行的“发布到SIT”按钮完成发布。只有本批次 pipeline 已结束且部署日志仍无记录时才评估该通道，并先确认“提交内容”或 `CommitID` 等于 CFPD `test` 目标提交；已有部署记录时不得重复发布同一 RC。

CI 触发构建时如果未显式传入 `PKG_TAG` 或 `PKG_VERSION`，GitLab CI 和 Makefile 会兜底使用 `RC` 和当前时间戳，避免生成 `zhipin-frontend:` / `zhipin-server:` 这类空镜像标签导致构建失败；Libra 包记录也会使用同一个 `RC_<时间戳>` 版本号。

为了让当前可丢弃数据的 SIT 同时支持空库和旧库，Makefile 只对非 `GA` 的 RC/SIT server 镜像传入 `ALLOW_EMPTY_DATABASE_BOOTSTRAP=true` 与 `AUTO_MIGRATE_DATABASE=true`。容器 entrypoint 先让 bootstrap 仅在真正空库创建并 stamp 当前 head，再执行一次 `alembic -c /app/backend/alembic.ini upgrade head`；部分建表的库会直接阻断，绝对配置路径避免 K8S 工作目录变化导致 `script_location` 丢失。`GA` 对两个开关都明确传入 `false`。SIT 扩展迁移发布时不得同时扩容多个新副本；如果待升级库尚未到 `20260711_04`，还必须先停止 Demand 写入并排空所有旧 server 实例，不能让旧 Pod 与新容器 entrypoint 并行读改编号。发布后必须核对 revision（本候选为 `20260730_13`）、verify 报告和受控 API；正式环境仍按唯一 migration job 门禁执行。

当前 RC/SIT 还会显式传入 `ALLOW_INSECURE_SIT_STARTUP=true`、`SECURITY_HEADERS_ENABLED=false`、`RATE_LIMIT_ENABLED=false` 和 `ALLOW_PUBLIC_REGISTRATION=true`，CORS 留空时允许测试跨域。这是项目负责人单人、可丢弃数据测试的明确授权，不开 `FLASK_DEBUG`，也不改动 Demand/候选人/面试/BI 的业务数据约束。`GA` 对这些值使用严格反向配置，且 `ALLOW_INSECURE_SIT_STARTUP=false`。完整测试模板见 `backend/sit-unrestricted.env.example`；`check_pilot_readiness.py` 只是真实数据试点/GA 门禁，不是当前 SIT 构建阻断器。

#### 公司工号小范围同事试用

多人跑招聘全流程时使用 `backend/sit-team-trial.env.example`，不要使用全部人员默认管理员的旧配置。前后端必须注入同一份工号角色映射，例如：

```env
AUTH_GATEWAY_USER_ROLE=recruiter
AUTH_GATEWAY_ROLE_MAP=EMP_HR:recruiter,EMP_INTERVIEWER_1:interviewer,EMP_INTERVIEWER_2:interviewer,EMP_MANAGER:manager,EMP_DIRECTOR:hr_director
RESUME_AI_ENABLED=false
```

构建前端时把相同映射作为 `VITE_GATEWAY_ROLE_MAP` 传给 Makefile。未映射工号按招聘专员处理，不得回退为管理员。本轮模型简历解析关闭：文件正常入库，候选人详情自动提示并展开手动补录；招聘需求、筛选、面试、改约、反馈、Offer、人才池和入职流程仍需完整验收。Test 网关必须覆盖或清洗客户端自带的 `X-Emp-Code`，只把已认证用户的真实工号传给后端。

镜像构建还会把经 Makefile 校验的 `RC` / `GA` 写入镜像内部 `.release-channel` 文件，而不是可被 K8S 环境变量替换的 `ENV`。GA entrypoint 会在 bootstrap/Alembic 之前核对所有严格值；运行时若尝试开启 SIT 放行、自动迁移/空库初始化、公开注册，或关闭安全头/限流，容器会在任何数据库动作前拒绝启动。缺失或未知发布标记同样 fail closed。

如果点击“发布到SIT”弹出：

```text
发布请求发起失败：zhipin-server该模块在当前环境无主机
zhipin-frontend该模块在当前环境无主机
```

这只能说明传统主机发布通道没有主机/实例绑定，不能推导代码构建失败、K8S 不可用或自动部署已发生。回到本批次部署日志核对；如果没有记录，再进入持续发布/K8S 按 `Sit(集成)` / `产品一组` / `zhipin-mvp` / 模块筛选。筛选后仍无数据就停止，不猜入口、不继续点击发布。若日志出现“异常”、`Ready 0/1` 或 `CrashLoopBackOff`，停止重复发布同一 RC 并获取容器日志。部署历史、可绑定版本和 K8S 可回滚版本是三类数据，不得互相替代。遇到该弹窗时仍需单独验证测试站是否已有真实部署证据：

```bash
curl -sS -L -D /tmp/test-zhipin.headers https://test-zhipin.yimidida.com/ -o /tmp/test-zhipin.html
rg -o '/assets/[^" ]+' /tmp/test-zhipin.html | sort -u
```

前端展示类修复可继续检查对应资产内容；例如右上角中国国旗修复，应在新 JS/CSS 中看到 `🇨🇳`，且不再出现旧的红白双色旗 CSS。

### demand_id 发布与 schema 迁移门禁

`demand_id` 不是只发一个新镜像的普通功能。它使用 Expand → Backfill → Dual-write/Shadow-read → Strict cutover → Contract，详细操作见 [docs/10_demand_id迁移与回滚手册.md](./docs/10_demand_id迁移与回滚手册.md)。

发布顺序必须是：

1. 记录目标环境、引擎、CFPD SHA、当前 schema revision 和负责人。
2. 停止自动发布，先在同引擎临时库完成数据库 + uploads 备份恢复。
3. 单次运行 Expand migration；当前 RC/SIT 镜像由 entrypoint 在 Gunicorn 前执行，GA/生产由唯一 migration job 执行；两种路线都不允许多个新 K8S 副本并发跑 Alembic。
4. 运行 audit 和 backfill dry-run，对歧义 bundle 取得业务映射，再执行回填。
5. 运行 verify：核心事实 `demand_id` 无空值，跨组织/孤儿/歧义为 0，每行 `job_id == demand.job_id`。
6. 部署 dual-write 兼容版并完成 shadow comparison。
7. 只有新前端、新后端、AI、BI、通知与审计均已 demand-scoped，旧 worker/旧静态资产全部退出，才设置 cutover marker。
8. 一旦允许同 Job 并行多 Demand，旧代码无法表达新事实；此后不允许只回退镜像，只能向前修复，或停写后整体恢复 cutover 前快照。

当前项目没有已证明可用的 Libra 一次性 migration job。发布前必须由运维确认使用 init job、独立 K8S Job 或受控人工命令，并保证 migration 成功后才启动业务 worker。如果这一步没有 Owner 与证据，只可构建镜像，不可 cutover。

### 方案 A：Flask 托管前端静态文件（单进程，推荐小团队）

1. 构建前端：
```powershell
cd readdy-frontend
npm ci
npm run build    # 生成 readdy-frontend/out/；构建产物不提交
```

2. 修改 `.env`。可以从轻量试点模板开始：
```bash
cp backend/lightweight-pilot.env.example backend/.env
```
先生成固定 Fernet 密钥：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

然后把 `change-me`、域名、数据库地址、LLM Key、备份目录和 Fernet 密钥替换成真实值：
```env
FLASK_DEBUG=false
LOCAL_SCHEMA_COMPAT=false
JWT_SECRET=your-strong-random-secret-here
JWT_EXPIRY_HOURS=8
DATABASE_URL=mysql+pymysql://user:pass@host:3306/zhipin?charset=utf8mb4
CORS_ORIGINS=https://zhipin.内网域名
UPLOAD_FOLDER=/var/lib/zhipin/uploads
AI_RECRUITMENT_COMPLIANCE_ACK=true
CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.内网域名/privacy
AI_HUMAN_REVIEW_REQUIRED=true
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_LOGIN=10
RATE_LIMIT_AGENT_CHAT=20
RATE_LIMIT_RESUME_UPLOAD=8
BACKUP_DIR=/var/backups/zhipin
ALLOW_PUBLIC_REGISTRATION=false
FIELD_ENCRYPTION_KEY=PASTE_GENERATED_FERNET_KEY_HERE
ALLOW_EMPTY_DATABASE_BOOTSTRAP=false
AUTO_MIGRATE_DATABASE=false
BOSS_CLI_AUTO_INSTALL=false
BOSS_CLI_BIN=/usr/local/bin/boss
```

`CORS_ORIGINS` 使用与生产启动护栏相同的严格校验，只接受无 path/query/fragment/用户凭据的 HTTP(S) origin，拒绝 `*` 和 `null`。校验错误只包含条目序号、脱敏 scheme/host 和原因，不回显 userinfo/query secret。`run.py`、备份、恢复和清理日志只显示数据库 driver/host/database 的脱敏 label，不打印用户名、密码或 query。

`UPLOAD_FOLDER` 在试点/生产必须是显式的非临时绝对路径，并映射到持久卷。Flask、backup、restore、cleanup 与 readiness 共用同一解析器；缺失、相对路径、文件系统根目录或 `/tmp`/`/var/tmp` 都会 fail closed。

公司 MySQL 试用环境建议使用 InnoDB、`utf8mb4` 字符集、专用库和专用账号。当前代码也兼容 PostgreSQL，连接串可写为 `postgresql://user:pass@host:5432/zhipin`，会自动转为 `postgresql+psycopg://`。

3. 启动前自检（只读检查，不打印密钥）：
```bash
cd /path/to/project
python backend/scripts/check_pilot_readiness.py
```

开发机上的 `.env` 可能会显示大量 FAIL，这代表服务器必填配置还没填好，不代表脚本本身失败。只有服务器真实 `.env` 填完后，自检通过，才继续启动和开放试点。

4. 启动（Flask 会自动托管 `readdy-frontend/out`，也可用 `FRONTEND_DIST` 覆盖）：
```bash
cd backend
python run.py
```

访问 `http://your-server:5000` 即为完整系统。

### 轻量试点后台兜底

轻量试点不增加导出审批、水印或邀请制，HR 正常上传、推进、安排面试和导出。后台做低打扰保护：

- 重复上传同一批简历会复用第一次结果，不再重复创建候选人。
- 重复推进同一候选人到同一阶段、重复安排同一面试、重复提交同一轮反馈，会返回已有记录。
- 普通 JSON/表单写接口支持 `Idempotency-Key`：同一用户、同一路径、同一请求体和同一个 key 的重试会返回第一次结果；同 key 不同请求体返回 409。
- 同一面试官同一时间不能被安排两场不同面试；完全相同的重复安排仍返回已有记录。
- 上传只支持 PDF、DOCX 和 ZIP；旧版 `.doc` 因宏风险会被跳过，需转换后再上传。
- 误导入可按上传批次撤回：候选人会软删除、匿名化并删除原文件，保留审计事件。
- 候选人导出继续开放，但同一账号 10 分钟内第 6 次起会在审计日志标为 `warning`，管理员页标红。
- demand-scoped P0 中 AI 只保留解析、匹配、总结和建议；自动推进、淘汰、Offer、转派和关闭工具不进入试点工具目录。
- 管理员重置密码、用户自己修改密码后，旧登录 token 会立刻失效。

### 备份与恢复演练

上线前至少演练一次“能备份，也能恢复到临时库”。轻量试点不做复杂恢复后台，但必须留出可执行命令。

`demand_id` 发布需要三个独立快照：Expand 前、Strict cutover 前、cutover 验证后。每个快照应记录数据库引擎、schema revision、CFPD SHA、manifest、SHA-256、关键表行数与 uploads 包校验结果，不记录密码或带凭据的 URL。SQLite 使用 backup API 取得 WAL 一致快照；备份目录和敏感产物使用 `0700/0600` 权限。

备份：

```bash
cd backend
python scripts/backup_pilot_data.py --dry-run
python scripts/backup_pilot_data.py
```

恢复演练必须恢复到临时库和临时上传目录，不直接覆盖生产环境。新快照在 manifest 的 `uploads.source_root` 记录源根目录；恢复时会验证候选人附件引用仍在该根内，并规范为相对于新 `UPLOAD_FOLDER` 的路径。旧快照缺少源根字段，只能同原根目录恢复，不得静默迁移到其他挂载目录。恢复脚本会先校验 manifest/校验和、拒绝路径穿越、链接和特殊文件，并在 staging 完成后才原子切换；失败时保留原 uploads。当前标准脚本直接支持 PostgreSQL `pg_restore` 与 SQLite 文件恢复；MySQL 备份可由 `mysqldump` 产出 SQL，但 `restore_pilot_data.py --confirm` 明确 fail closed，只有 `--dry-run` 输出脱敏的人工计划。

如果目标 SIT/试点库是 MySQL，当前必须由 DBA 将同一 `database.sql` 导入临时库，核对 schema revision、关键表行数、Demand/Flow/Pipeline/Interview/Offer/Event 数据和 uploads 文件，并留下负责人、时间与证据；不得绕过脚本的 confirm 禁令。

仅有 `mysqldump` 文件或只有“备份命令成功”不算恢复证据。MySQL 恢复未通过时，不得进入 Backfill 写入或 Strict cutover。数据库和 uploads 不是跨资源事务，正式恢复必须停写，任一部分失败都不得宣布完成。

以下为当前 PostgreSQL/SQLite 命令示例：

```bash
cd backend
createdb zhipin_restore_check

DATABASE_URL=postgresql://user:pass@host:5432/zhipin_restore_check \
UPLOAD_FOLDER=/var/lib/zhipin/restore-check-uploads \
python scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/<backup-dir> --dry-run

DATABASE_URL=postgresql://user:pass@host:5432/zhipin_restore_check \
UPLOAD_FOLDER=/var/lib/zhipin/restore-check-uploads \
python scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/<backup-dir> --confirm
```

验收：临时库能查到用户、候选人、岗位和审计事件；候选人 `raw_file_path` 为安全相对路径，并能通过应用从临时 `UPLOAD_FOLDER` 实际预览/下载原简历，不能只检查文件存在。确认无误后删除临时库和临时目录：

```bash
dropdb zhipin_restore_check
rm -rf /var/lib/zhipin/restore-check-uploads
```

### 方案 B：gunicorn（多 worker，Linux 生产）

```bash
cd backend
# 推荐：用 gunicorn.conf.py（含 worker/超时参数 + 服务注册 master 单点钩子）
gunicorn -c gunicorn.conf.py run:app

# 等价的显式写法（不走注册钩子时用）：
gunicorn -w 4 -b 0.0.0.0:5000 --timeout 120 --keep-alive 5 "run:app"
```

> ⚠️ AI 助手的 SSE 流式响应需要 `--timeout` 设置足够大（推荐 120s+）
>
> ⚠️ 若启用了 Consul/Eureka 服务注册，**必须**用 `-c gunicorn.conf.py` 启动：
> 注册只在 gunicorn master 进程发生一次；直接 `-w 4 run:app` 会让每个 worker
> 各注册一份同 ip:port（见 [服务注册中心](#服务注册中心consul--eureka)）。

### 方案 C：systemd 服务（Linux 开机自启）

创建 `/etc/systemd/system/zhipin.service`：

```ini
[Unit]
Description=智聘招聘管理系统
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/project/backend
EnvironmentFile=/path/to/project/backend/.env
ExecStart=/usr/bin/python3 run.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable zhipin
systemctl start zhipin
```

### 服务注册中心（Consul / Eureka）

后端可选注册到 Consul 或 Eureka，供公司 Spring Cloud 服务发现。由配置动态选择后端，无需改代码。

**RC/SIT 镜像默认开启**：`docker-entrypoint.sh` 在 RELEASE_CHANNEL=RC 时，会为
`CONSUL_ENABLED=true`、`CONSUL_HOST=consul.tomcat.tomcat.01.sit`、`CONSUL_PORT=8500`、
`CONSUL_CHECK_MODE=ttl` 等注入默认值（无 K8S/Libra env 注入时的兜底）。运行时 env
始终优先，可整组覆盖指向别的 Consul。**GA 镜像不设这些默认**，保持“默认不注册”，
避免生产误连 SIT 注册中心；GA 要注册需显式在部署 env 里配置。

**配置来源与优先级**：环境变量 > Spring 属性文件（`REGISTRY_PROPERTIES_FILE`）> 默认。
属性文件支持 `spring.cloud.consul.*` / `eureka.*` 点号键，可直接复用 Spring 服务那份
`application.properties` 片段。后端选择：`REGISTRY_TYPE=consul|eureka|none` 显式指定，
或按 `CONSUL_ENABLED` / `EUREKA_ENABLED` 自动推导（两者都关 → 不注册）。

**SIT 示例（对应给定的 Consul 环境）**，写入 `backend/.env`：

```bash
CONSUL_ENABLED=true
EUREKA_ENABLED=false
CONSUL_HOST=consul.tomcat.tomcat.01.sit
CONSUL_PORT=8500
CONSUL_REGISTER=true
SERVICE_NAME=zhipin-server
SERVICE_PORT=5000            # 留空则取 PORT
SERVICE_PREFER_IP_ADDRESS=true
HEALTH_CHECK_PATH=/actuator/health
# Consul 主动回拉本服务健康检查（需 consul 能访问到本服务 ip:port）
CONSUL_CHECK_MODE=http
# 若 consul 与本服务跨网段、无法回拉，改为本服务主动上报心跳：
# CONSUL_CHECK_MODE=ttl
```

切 Eureka 只需：`CONSUL_ENABLED=false`、`EUREKA_ENABLED=true`、
`EUREKA_SERVER_URLS=http://eureka-1/eureka,http://eureka-2/eureka`。

**健康检查端点**：应用提供 Spring Boot 兼容的 `/actuator/health`（返回 `{"status":"UP"}`）
和 `/actuator/info`，Consul HTTP 检查和 Eureka healthCheckUrl 均指向它。

**多 worker 注意**：生产用 `gunicorn -c gunicorn.conf.py run:app` 启动，注册在
master 单点完成，worker 只负责响应健康检查；systemd 方案 C（单进程 `run.py`）会在
应用内直接注册一次，也安全。

**上线前连通性自检**（不必启动整个应用）：

```bash
# 用 .env / 环境变量里的配置，跑 注册 → 发现 → 注销
python backend/scripts/registry_smoketest.py
# 注册后保持在线 60s，便于在 Consul/Eureka UI 里肉眼确认
python backend/scripts/registry_smoketest.py --hold 60
```

> 网络前提：本机/本 Pod 必须能解析并访问 `CONSUL_HOST:CONSUL_PORT`（或 Eureka zone）。
> HTTP 检查模式还要求注册中心能反向访问本服务 `ip:port`；做不到时用 `CONSUL_CHECK_MODE=ttl`。

### Libra/CI 镜像构建参考（非手工试点首选）

公司 Libra/SIT 流水线会按 `zhipin-frontend` 和 `zhipin-server` 两个模块构建镜像。这是 CI/CD 打包与公司发布平台的模块形态，不改变业务边界。手工单入口路线先在 `readdy-frontend/` 运行 `npm run build`，再由 Flask 同源托管 `readdy-frontend/out`。

除非公司发布平台明确要求排查镜像构建、标签或模块包记录，否则手工试点部署不要按下面示例改成前后端双容器拓扑；优先使用上面的方案 A/B/C。

#### 1. 编译镜像
在具有 Docker 环境的机器上运行：
```bash
# 编译所有镜像（前端 + 后端）
make build PKG_TAG=RC PKG_VERSION=1.0.0

# 仅编译前端镜像
make buildfrontend PKG_VERSION=1.0.0

# 仅编译后端镜像
make buildserver PKG_VERSION=1.0.0
```

#### 2. 推送镜像到仓库
```bash
make push PKG_TAG=RC PKG_VERSION=1.0.0
```

#### 3. 双容器本地排查示例（仅用于复现 Libra 模块镜像）

```bash
# 1. 创建自定义网络
docker network create zhipin-net

# 2. 运行后端服务
docker run -d \
  --name zhipin-server \
  --network zhipin-net \
  -p 5000:5000 \
  -v /var/lib/zhipin/uploads:/app/backend/uploads \
  -e UPLOAD_FOLDER=/app/backend/uploads \
  -e JWT_SECRET=your-strong-random-secret-here \
  -e DATABASE_URL=postgresql://user:pass@host:5432/zhipin \
  -e LLM_PROVIDER=deepseek \
  -e LLM_API_URL=https://api.deepseek.com/v1/chat/completions \
  -e OPENAI_API_KEY=sk-your-deepseek-key-here \
  -e AI_RECRUITMENT_COMPLIANCE_ACK=true \
  -e CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.内网域名/privacy \
  -e AI_HUMAN_REVIEW_REQUIRED=true \
  registry-sit.uce.cn/system-zhipin-mvp/zhipin-server:1.0.0

# 3. 运行前端服务（前端 Nginx 默认会把 /api 请求代理到容器名为 zhipin-server 的 5000 端口）
docker run -d \
  --name zhipin-frontend \
  --network zhipin-net \
  -p 8080:8080 \
  registry-sit.uce.cn/system-zhipin-mvp/zhipin-frontend:1.0.0
```

该示例只用于排查 Libra/CI 模块镜像能否各自启动和互通，不作为 HR 试点对外访问方式。正式手工试点仍以 `http://your-server:5000` 或 HTTPS 反代后的单入口访问为准。

---

## 7. 公网穿透（cloudflared）

内部临时试看优先暴露完整本地验收入口 `5190`，它会连接隔离登录桥 `5100` 和后端 `5010`。

```bash
# Windows
tools\cloudflared.exe tunnel --url http://127.0.0.1:5190 --protocol http2 --no-autoupdate

# Linux/macOS (需先下载 cloudflared)
cloudflared tunnel --url http://127.0.0.1:5190 --protocol http2 --no-autoupdate
```

启动后输出类似：
```
https://ward-mounted-concerning-fans.trycloudflare.com
```

> ⚠️ 免费隧道链接每次重启会变化，不适合生产。生产用途请注册 Cloudflare 账号配置命名隧道（Named Tunnel）。

---

## 8. MVP 内部试用账号

所有账号密码：`Zhipin2026`

| 角色 | 邮箱 | 说明 |
|------|------|------|
| 管理员 | admin01@mvp.local | 全量权限 + 账号管理 |
| 招聘经理 | manager01@mvp.local | 完整 BI 看板 + 团队数据 |
| 招聘负责人 | lead01@mvp.local | 完整 BI 看板 + 团队数据 |
| 招聘专员 | hr01@mvp.local | 候选人 / 岗位 / 管道 / 个人数据 |
| 招聘专员 | hr02@mvp.local | 候选人 / 岗位 / 管道 / 个人数据 |
| 招聘专员 | hr03@mvp.local | 候选人 / 岗位 / 管道 / 个人数据 |
| 面试官 | interviewer01@mvp.local | 面试任务 / 候选人查看 |

MVP 试用阶段建议一人一个账号。系统会按用户 ID 记录 Demand/候选人当前负责人、流程推进人和面试反馈人；前者用于当前责任协同，后两者是不可重写的历史行为留痕。BI 不将这些数据用于人员排名、绩效或奖金；多人共用账号会使当前责任和审计行为者都不可信。试点审计日志还会记录候选人详情查看、候选人 CSV 导出、越权 403 和 Demand-indexed 业务操作，并附带 request_id、角色、IP、来源、结果和失败原因；同一账号短时间高频导出候选人会在管理员审计页标红。

生产多组织隔离依赖 `org_id`：部署初始化时必须为每个组织创建独立管理员，并确认历史用户、岗位、候选人、流程、面试、BI 和 AI 对话均归入正确组织。当前一期没有前端组织管理页面，跨组织开通和迁移由部署脚本或数据库初始化处理。

---

## 9. 功能模块说明

| 模块 | 路径 | 说明 |
|------|------|------|
| 工作台 | `/` | 角色化欢迎页 + KPI 看板 + 快速入口 |
| AI 助手 | `/agent` | LangGraph ReAct 智能体，自然语言查询系统数据 |
| 候选人 | `/candidates` | 公司人才库 + 多维筛选 + 个人收藏 + 匹配后入流程 + 受控精确查重合并 + 档案详情/导出 |
| 简历上传 | `/upload` | 拖拽上传 PDF/DOCX/ZIP，AI 自动解析技能标签；旧版 DOC 跳过 |
| 岗位管理 | `/jobs` | 创建岗位，AI 追问补全 JD，智能解析技能要求 |
| 候选人匹配 | `/jobs/:id/match` | 按岗位 AI 匹配并排名候选人 |
| 候选人管道 | `/pipeline` | 阶段管理（待筛选→AI初筛→业务待反馈→面试中→Offer→已入职/淘汰），支持误推进后的“修正阶段”并保留历史流水 |
| AI 面试 | `/interviews` | 生成定制题目，录入作答，AI 评估报告 |
| 数据看板 | `/bi` | 按 Demand 展示当前阶段、停留、待补反馈、HC 和当前责任，所有数字可下钻；不用于人员排名、绩效或奖金，面试官不开放 BI |
| BOSS 直聘实验辅助 | 无可达前端路由（源码保留 `/boss`） | P0 `featureRegistry` 未注册该 feature；后端只读/账号实验接口保留，批量导入与 AI 初筛固定 410。若重新开放，必须确认 `demand_id` 写契约、`FIELD_ENCRYPTION_KEY`、boss CLI 来源和 Cookie 使用边界 |

---

## 10. 常见问题

### Q：简历上传失败，提示 EOF marker not found？

A：已修复（2026-06-14）。确保运行的是最新代码。`.docx` 和 PDF 均已支持，旧版 `.doc` 格式请另存为 `.docx` 后上传。

### Q：简历上传失败，接口返回 500？

A：先检查后端日志。如果出现 `Permission denied: '/app/backend/uploads'`，说明容器内上传目录不可写。`/tmp/zhipin_uploads` 只是本地 debug 的可写默认；试点/生产启动护栏要求显式配置 `UPLOAD_FOLDER` 到非临时的绝对挂载目录，并保证运行用户有写权限。

### Q：AI 功能不可用，提示 LLM 调用失败？

A：检查 `backend/.env` 中的 API Key 是否填写正确，网络是否能访问 LLM API 端点。

### Q：前端页面空白？

A：
1. 开发模式确认后端已启动（`http://localhost:5001` 可访问）；生产模式确认 `http://localhost:5000` 可访问
2. 单入口模式：确认已在 `readdy-frontend/` 运行 `npm run build` 生成 `readdy-frontend/out/`
3. 开发模式：确认 `npm run dev` 在 PowerShell 中运行（不是 Git Bash）

### Q：数据库如何重置？

A：仅显式 `FLASK_DEBUG=true + LOCAL_SCHEMA_COMPAT=true + SQLite` 本地开发/演示库可以删除 `backend/hireinsight.db`，重启后端走本地兼容建表，再运行 `python seed_dev.py`。RC/SIT/生产空库必须显式 bootstrap，已有库必须 Alembic；真实 HR 试点库、公司测试库和生产库禁止用 `seed_dev.py` 重置。需要清演示数据时，先备份，再按 `cleanup_demo_data.py --dry-run` / `--confirm` 执行。

### Q：端口冲突怎么办？

A：直接 Vite 开发默认前端 `3000`；完整本地验收固定使用 `5190/5100/5010`。如果必须改端口，需同步核对启动脚本和前端代理目标。

### Q：Windows 下 npm 命令找不到？

A：必须在 **PowerShell** 中运行 npm 命令，不要在 Git Bash 中运行。

---

## 快速验证清单

本地准备 Test/SIT 发布候选时，先在仓库根目录运行统一门禁：

```bash
./scripts/check-sit-release.sh
```

该命令只读检查代码、构建、依赖安全、迁移 head、Git 状态和 RC 构建参数；不会清理 Mock、迁移数据库、提交、推送或发布。如需同时验证小团队 SIT 的真实配置文件，使用：

```bash
SIT_ENV_FILE=/absolute/path/to/sit.env ./scripts/check-sit-release.sh
```

发布后打开 `/actuator/info`，核对后端返回的版本、渠道、构建时间和预期 schema，并确认登录页页脚是同一个版本。这能防止“前端是新版、后端还是旧版”的暗病。

### 本地开发/演示验证

```bash
# 1. 后端启动验证
cd backend
python -c "from app import create_app; app=create_app(); print('后端 OK')"

# 2. 本地演示数据（只适用于本地演示库）
python seed_dev.py

# 3. 前端构建验证
cd ../readdy-frontend
npm run type-check
npm run lint
npm run build

# 4. 接口验证
curl http://localhost:5001/api/jobs   # → 401 (未登录，正常)
```

### 试点/生产验证

试点/生产验证不运行 `seed_dev.py`。先确认 `.env`、数据库、密钥、CORS、备份目录和合规开关都通过自检，再做构建和只读接口冒烟：

```bash
# 1. 启动前自检（只读检查，不打印密钥）
python3 backend/scripts/check_pilot_readiness.py

# 2. 后端应用创建验证
cd backend
python -c "from app import create_app; app=create_app(); print('后端 OK')"

# 3. schema 独立验证（应用可构造不等于数据库 ready）
alembic current  # 当前代码候选应为 20260730_13

# 4. 前端构建验证
cd ../readdy-frontend
npm ci
npm run type-check
npm run build

# 5. liveness 与未登录接口验证
curl -i http://localhost:5000/api/health # 仅证明进程存活
curl -i http://localhost:5000/api/jobs   # → 401/403 未登录，正常
```

demand-scoped P0 额外要求：记录 `alembic current`、audit/backfill/verify 报告、同引擎恢复证据，并使用同一 Job 的两个 Demand 验证流程、面试、Offer、HC、权限和 BI 不串账。旧 job-only 请求在无法唯一解析 Demand 时应返回 409 `demand_id_required`，不能默认选最新 Demand。

---

*智聘·招聘管理系统 © 2026 — AI 驱动的企业招聘管理平台*
