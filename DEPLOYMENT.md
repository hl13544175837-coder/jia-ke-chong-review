# 智聘·招聘管理系统 — 部署文档

> **版本**：2026-06-22
> **适用环境**：Windows 10/11、Linux（Ubuntu 20.04+）、macOS 13+  
> **架构**：Flask 单进程 + SQLite（开发）/ MySQL（公司试点）/ PostgreSQL（兼容）+ Vite React SPA

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
    │  开发模式: localhost:5173  →  /api 代理到 :5001
    │  生产模式: Flask 直接托管 frontend/dist (SPA)
    ▼
后端 (Flask + SQLAlchemy)  开发 localhost:5001 / 生产 localhost:5000
    ├── /api/auth          认证 (JWT + RBAC)
    ├── /api/resume        简历上传/解析 (PDF + Word)
    ├── /api/candidates    候选人管理
    ├── /api/jobs          岗位管理 + JD 智能解析
    ├── /api/match         候选人-岗位匹配
    ├── /api/interview     AI 面试题生成 + 评估
    ├── /api/pipeline      候选人管道
    ├── /api/bi            数据看板 (漏斗 + 专员效能 + 权限化岗位 BI)
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
| Python | 3.9+ | 推荐 3.11 |
| Node.js | 18+ | 推荐 20 LTS |
| npm | 9+ | 随 Node.js 附带 |
| Git | 任意 | 可选 |

> BOSS 直聘模块是实验辅助能力，不属于 HR 试点主流程必测项。若开放该模块，还需要运行期可用的 `boss` CLI。容器已包含 git，若设置
> `BOSS_CLI_AUTO_INSTALL=true`，首次调用会尝试从 GitHub 源码安装；内网无法访问
> GitHub 时，请由运维预装 CLI 并设置 `BOSS_CLI_BIN`。BOSS Cookie 会用
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
cd frontend
npm install
npm run dev
```

**Linux / macOS**：
```bash
cd frontend
npm install
npm run dev
```

访问 **http://localhost:5173** 即可使用。

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

确认备份目录、数据库和上传目录后，再由负责人执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

脚本会先备份，再删除 `@mvp.local` demo 账号及其关联业务数据，并清空 `backend/uploads/`、`uploads/` 文件；表结构会保留。

### 数据库兼容补列

应用启动时会对历史试点库做轻量兼容补列。`upload_batches` 表会按当前模型补齐缺失列（如组织、来源链接、内推人、目标岗位、备注、创建时间等），`interview_feedback` 等已存在业务表会先补齐 `org_id` 等组织隔离字段，再执行旧面试反馈原因标签归一化，避免旧库因缺列导致 Flask 启动失败。该补列是幂等操作，列已存在时不会重复修改。

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

当前推荐的 Libra 页面操作路线是：进入执行 pipeline 页，选择 `test` 分支，点击“开始构建”，并勾选“构建完成自动部署到 SIT 环境”。构建成功后必须核对 pipeline 的 `sha` / `CommitID` 等于刚推到 CFPD `test` 的提交，再做测试站资产验收。

历史上也可能通过构建成功行的“发布到SIT”按钮完成发布。如果使用这条备选路线，必须先确认该行“提交内容”或 `CommitID` 等于 CFPD `test` 最新提交；不要发布旧行，尤其不要只看“构建成功”绿色对勾。

CI 触发构建时如果未显式传入 `PKG_TAG` 或 `PKG_VERSION`，GitLab CI 和 Makefile 会兜底使用 `RC` 和当前时间戳，避免生成 `zhipin-frontend:` / `zhipin-server:` 这类空镜像标签导致构建失败；Libra 包记录也会使用同一个 `RC_<时间戳>` 版本号。

如果点击“发布到SIT”弹出：

```text
发布请求发起失败：zhipin-server该模块在当前环境无主机
zhipin-frontend该模块在当前环境无主机
```

这说明普通发布通道没有可用主机/实例绑定，不代表代码构建失败。优先改走执行 pipeline 页的 `test` 分支自动部署路线；如公司后续仍要求使用普通发布按钮，再让运维确认 Libra 的“应用维护 / k8s应用管理”里是否补齐模块与 SIT 主机/实例绑定。遇到该弹窗时仍需单独验证测试站是否已被构建流程同步静态包：

```bash
curl -sS -L -D /tmp/test-zhipin.headers https://test-zhipin.yimidida.com/ -o /tmp/test-zhipin.html
rg -o '/assets/[^" ]+' /tmp/test-zhipin.html | sort -u
```

前端展示类修复可继续检查对应资产内容；例如右上角中国国旗修复，应在新 JS/CSS 中看到 `🇨🇳`，且不再出现旧的红白双色旗 CSS。

### 方案 A：Flask 托管前端静态文件（单进程，推荐小团队）

1. 构建前端：
```powershell
cd frontend
npm run build    # 生成 frontend/dist/
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
JWT_SECRET=your-strong-random-secret-here
JWT_EXPIRY_HOURS=8
DATABASE_URL=mysql+pymysql://user:pass@host:3306/zhipin?charset=utf8mb4
CORS_ORIGINS=https://zhipin.内网域名
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
BOSS_CLI_AUTO_INSTALL=false
BOSS_CLI_BIN=/usr/local/bin/boss
```

公司 MySQL 试用环境建议使用 InnoDB、`utf8mb4` 字符集、专用库和专用账号。当前代码也兼容 PostgreSQL，连接串可写为 `postgresql://user:pass@host:5432/zhipin`，会自动转为 `postgresql+psycopg://`。

3. 启动前自检（只读检查，不打印密钥）：
```bash
cd /path/to/project
python backend/scripts/check_pilot_readiness.py
```

开发机上的 `.env` 可能会显示大量 FAIL，这代表服务器必填配置还没填好，不代表脚本本身失败。只有服务器真实 `.env` 填完后，自检通过，才继续启动和开放试点。

4. 启动（Flask 会自动托管 `frontend/dist`）：
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
- AI 写操作继续可用，仍写入 `agent.write` 审计；试点说明中应写清 AI 只做辅助，最终决定由人确认。
- 管理员重置密码、用户自己修改密码后，旧登录 token 会立刻失效。

### 备份与恢复演练

上线前至少演练一次“能备份，也能恢复到临时库”。轻量试点不做复杂恢复后台，但必须留出可执行命令。

备份：

```bash
cd backend
python scripts/backup_pilot_data.py --dry-run
python scripts/backup_pilot_data.py
```

恢复演练建议恢复到临时库或临时上传目录，不直接覆盖生产环境。脚本支持 PostgreSQL `pg_restore` 与 SQLite 文件恢复；MySQL 备份由 `mysqldump` 产出 SQL 文件，恢复时由 DBA 或部署同事导入临时 MySQL 库；脚本会校验 `uploads.tar.gz` 路径穿越：

```bash
cd backend
createdb zhipin_restore_check

DATABASE_URL=postgresql://user:pass@host:5432/zhipin_restore_check \
UPLOAD_FOLDER=/tmp/zhipin-upload-restore-check \
python scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/<backup-dir> --dry-run

DATABASE_URL=postgresql://user:pass@host:5432/zhipin_restore_check \
UPLOAD_FOLDER=/tmp/zhipin-upload-restore-check \
python scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/<backup-dir> --confirm
```

验收：临时库能查到用户、候选人、岗位和审计事件；临时 `UPLOAD_FOLDER` 里能看到原简历文件。确认无误后删除临时库和临时目录：

```bash
dropdb zhipin_restore_check
rm -rf /tmp/zhipin-upload-restore-check
```

### 方案 B：gunicorn（多 worker，Linux 生产）

```bash
cd backend
gunicorn -w 2 -b 0.0.0.0:5000 \
  --timeout 120 \
  --keep-alive 5 \
  "run:app"
```

> ⚠️ AI 助手的 SSE 流式响应需要 `--timeout` 设置足够大（推荐 120s+）

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

### Libra/CI 镜像构建参考（非手工试点首选）

公司 Libra/SIT 流水线会按 `zhipin-frontend` 和 `zhipin-server` 两个模块构建镜像。这是 CI/CD 打包与公司发布平台的模块形态，不改变本项目手工试点/生产推荐路线：前端先 `npm run build`，再由 Flask 同源托管 `frontend/dist`，对外暴露一个应用入口。

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

内部临时试看优先暴露前端开发服务 `5173`，因为前端会自动把 `/api` 代理到后端 `5001`。

```bash
# Windows
tools\cloudflared.exe tunnel --url http://127.0.0.1:5173 --protocol http2 --no-autoupdate

# Linux/macOS (需先下载 cloudflared)
cloudflared tunnel --url http://127.0.0.1:5173 --protocol http2 --no-autoupdate
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

MVP 试用阶段建议一人一个账号。系统会按用户 ID 记录候选人负责人、流程推进人和面试反馈人；BI 主绩效按候选人负责人归属，流程推进人用于操作留痕和后续动作审计，多人共用账号会导致贡献归属不清。试点审计日志还会记录候选人详情查看、候选人 CSV 导出、越权 403 和 AI 写操作，并附带 request_id、角色、IP、来源、结果和失败原因；同一账号短时间高频导出候选人会在管理员审计页标红。

生产多组织隔离依赖 `org_id`：部署初始化时必须为每个组织创建独立管理员，并确认历史用户、岗位、候选人、流程、面试、BI 和 AI 对话均归入正确组织。当前一期没有前端组织管理页面，跨组织开通和迁移由部署脚本或数据库初始化处理。

---

## 9. 功能模块说明

| 模块 | 路径 | 说明 |
|------|------|------|
| 工作台 | `/` | 角色化欢迎页 + KPI 看板 + 快速入口 |
| AI 助手 | `/agent` | LangGraph ReAct 智能体，自然语言查询系统数据 |
| 候选人 | `/candidates` | 简历库 + 技能标签 + 档案详情 + 受控 CSV 导出 |
| 简历上传 | `/upload` | 拖拽上传 PDF/DOCX/ZIP，AI 自动解析技能标签；旧版 DOC 跳过 |
| 岗位管理 | `/jobs` | 创建岗位，AI 追问补全 JD，智能解析技能要求 |
| 候选人匹配 | `/jobs/:id/match` | 按岗位 AI 匹配并排名候选人 |
| 候选人管道 | `/pipeline` | 阶段管理（待筛选→AI初筛→业务待反馈→面试中→Offer→已入职/淘汰），支持误推进后的“修正阶段”并保留历史流水 |
| AI 面试 | `/interviews` | 生成定制题目，录入作答，AI 评估报告 |
| 数据看板 | `/bi` | 团队当前阶段分布 + 专员效能 + 渠道质量 + 数据质量提醒（经理/管理员）+ 责任口径解释；当前流程人数不含已入职/已淘汰，招聘专员不能查看别人岗位 BI，面试官不开放 BI |
| BOSS 直聘实验辅助 | `/boss` | 招聘端账号 Cookie 导入、收件箱/推荐候选人查看、简历下载和批量导入；不属于 HR 试点主流程必测项，开放前必须确认 `FIELD_ENCRYPTION_KEY`、boss CLI 来源和 Cookie 使用边界 |

---

## 10. 常见问题

### Q：简历上传失败，提示 EOF marker not found？

A：已修复（2026-06-14）。确保运行的是最新代码。`.docx` 和 PDF 均已支持，旧版 `.doc` 格式请另存为 `.docx` 后上传。

### Q：简历上传失败，接口返回 500？

A：先检查后端日志。如果出现 `Permission denied: '/app/backend/uploads'`，说明容器内上传目录不可写。当前后端默认使用 `/tmp/zhipin_uploads`，生产如需持久化简历文件，必须显式配置 `UPLOAD_FOLDER` 到可写挂载目录，并保证运行用户有写权限。

### Q：AI 功能不可用，提示 LLM 调用失败？

A：检查 `backend/.env` 中的 API Key 是否填写正确，网络是否能访问 LLM API 端点。

### Q：前端页面空白？

A：
1. 开发模式确认后端已启动（`http://localhost:5001` 可访问）；生产模式确认 `http://localhost:5000` 可访问
2. 生产模式：确认已运行 `npm run build` 生成 `frontend/dist/`
3. 开发模式：确认 `npm run dev` 在 PowerShell 中运行（不是 Git Bash）

### Q：数据库如何重置？

A：仅本地开发/演示库可以删除 `backend/hireinsight.db`，重启后端（自动重建），再运行 `python seed_dev.py`。真实 HR 试点库、公司测试库和生产库禁止用 `seed_dev.py` 重置；需要清演示数据时，先备份，再按 `cleanup_demo_data.py --dry-run` / `--confirm` 执行。

### Q：端口冲突怎么办？

A：开发联调优先固定 `PORT=5001` 和前端 `5173`。如果必须改后端端口，前端 `vite.config.ts` 中的 proxy 也需同步修改。

### Q：Windows 下 npm 命令找不到？

A：必须在 **PowerShell** 中运行 npm 命令，不要在 Git Bash 中运行。

---

## 快速验证清单

### 本地开发/演示验证

```bash
# 1. 后端启动验证
cd backend
python -c "from app import create_app; app=create_app(); print('后端 OK')"

# 2. 本地演示数据（只适用于本地演示库）
python seed_dev.py

# 3. 前端构建验证（PowerShell）
cd ../frontend
npm run typecheck
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

# 3. 前端构建验证
cd ../frontend
npm run typecheck
npm run build

# 4. 未登录接口验证
curl -i http://localhost:5000/api/jobs   # → 401/403 未登录，正常
```

---

*智聘·招聘管理系统 © 2026 — AI 驱动的企业招聘管理平台*
