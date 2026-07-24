# 智聘独立整合版 Codex 完整接手上下文

更新时间：`2026-07-24 11:23 +0800`

这份文档是新 Codex 窗口的第一入口。它记录本次任务的用户决定、代码来源、当前运行状态、验收结果、安全边界和后续接手顺序。若旧文档与这里冲突，本次独立整合版以本文和当前代码为准。

> **重要鉴权修正**：`5190` 已删除 Readdy 定时器假登录和假角色切换，接回公司 MD5 密码、网关 OAuth、Bearer Token、profile 工号、`/auth/me`、`X-Emp-Code`、`clientId=zhipin` 权限和真实角色守卫。公司原登录、Token、Apollo 和三方 Token 文件已做哈希冻结。完整证据见 `docs/evidence/2026-07-24-company-auth/README.md`。

## 1. 用户要的最终产品

这是一个给少量公司同事在内网电脑上使用的招聘管理演示产品。

- 以前端 Readdy 成品的页面、布局、按钮、弹窗、筛选和交互为视觉及操作基准。
- 吸收公司现有招聘系统的业务结构、角色权限、后端和接口版能力。
- 吸收 GitHub 最新图片简历版本，支持图片和 ZIP 简历。
- 正式业务接口暂不开发，只保留清晰接口位置和数据格式，后续由研发接入。
- 登录鉴权是例外：必须沿用公司现有真实协议，不能使用演示账号、假 Token 或页面角色切换。
- 当前允许使用演示数据和浏览器内状态，但点击后必须有真实可见的打开、筛选、切换、提交、下载或状态更新。
- 所有可见按钮必须可交互；当前状态不能执行的按钮必须明确禁用，不能出现点击无反应。
- 只做电脑端，不做手机端专项适配。重点尺寸是 `1366x768`、`1440x900`、`1920x1080`。
- 默认浏览器是 Tabbit，不要擅自改用 Google Chrome。
- 用户是编程新手，技术词先用一句大白话解释。
- 整个产品必须完全隔离，不污染其他项目；收到明确删除指令时必须按精确边界删除干净。

## 2. 当前唯一工作目录

隔离根目录：

`/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724`

应用仓库：

`/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app`

目录职责：

| 路径 | 用途 |
| --- | --- |
| `app/readdy-frontend` | 最终验收主产品，完整 Readdy ZIP 前端，端口 `5190` |
| `app/frontend` | 公司业务接口与图片简历版前端，端口 `5192` |
| `app/backend` | 独立 Flask 后端，端口 `5010` |
| `app/base_agent` | LLM、简历解析、图片简历解析和匹配能力 |
| `app/scripts` | 本隔离产品的启动、检查和停止脚本 |
| `app/docs` | 设计、产品交互、验收和本交接文档 |
| `runtime` | 独立 SQLite、上传文件、日志和 PID |
| `references/readdy-export.zip` | Readdy 原始 ZIP 的固定副本 |
| `references/readdy-export` | Readdy ZIP 解压参考源码 |
| `references/github-image-resume` | GitHub 图片简历分支的固定参考仓库 |

整个隔离根目录当前约 `1.2 GB`。不要把 `runtime` 或 `references` 移到其他产品目录。

## 3. Git 状态与来源关系

当前应用仓库：

- 当前分支：`codex/readdy-resume-ui-merge`
- 完整功能基线提交：`044e9db feat: add complete Readdy parity product`
- 功能基线提交时间：`2026-07-24 10:05:10 +0800`
- 工作区在交接文档编写前是干净的。
- 当前分支没有 upstream，没有推送到 GitLab 或 GitHub，也没有合并到公司分支。
- 本轮功能提交从公司候选提交 `d18812e` 之后开始，共有设计、交互补齐、图片简历、独立运行和 ZIP 完整迁移等本地提交。

Git 远端：

- 公司 GitLab：`https://git.ymdd.tech/cfpd/zhipin-mvp.git`
- 公司正确的正式协作基准分支是 `test`。
- `2026-07-24 10:14 +0800` 远端 `test` 指向 `5e251a295cc12a0e3f0f8eb893684b4fe71cc083`。
- 本地 `origin/HEAD` 目前仍指向旧候选 `origin/codex/readdy-test-product`，这只是当时克隆状态，不能据此替代用户明确指定的 `test`。
- 当前隔离分支是产品实验交付，不代表已经进入 `test`、SIT 或生产。
- 没有用户新的明确授权，不要 push、merge、rebase 公司分支或部署。

如未来用户明确要求并入公司仓库，先重新获取 `origin/test`，比较差异，创建新的 `codex/` 工作分支并做迁移方案；不要直接把两个前端目录粗暴覆盖到 `test`。

## 4. 三份产品来源

### 4.1 Readdy 视觉与交互基准

- 在线成品：`https://dzaymv.readdy.co`
- Readdy 编辑器项目：`https://readdy.ai/project/966ed920-ff68-42f2-a5ef-ceee67b409f23`
- 用户导出文件名：`project-12214982 (1).zip`
- 固定副本：`references/readdy-export.zip`
- SHA-256：`627a59d6d023479d50d11a1b17ba978f350ca7fa3170e4a9895b7801e181096e`

以下三个 ZIP 已核对为同一文件、同一 SHA-256：

- `/Users/yenns/Downloads/project-12214982 (1).zip`
- `/Users/yenns/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_nzme97a9dpox22_69e0/temp/drag/project-12214982 (1).zip`
- `/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/references/readdy-export.zip`

“与 ZIP 一致”的验收含义是：原 ZIP 的页面、路由和全部交互控件一个不少，并在此基础上补齐空按钮和占位操作；不是要求源码逐字节不变。

### 4.2 GitHub 图片简历来源

- GitHub：`https://github.com/hl13544175837-coder/jia-ke-chong-review`
- 分支：`codex/target-mode-stage1-modules`
- 提交：`760593a64e20577820de45dfe7f6de470f288afc`
- 时间：`2026-07-23 19:12:23 +0800`
- 提交说明：合并 PR #24，支持图片简历视觉识别并进入候选人库。
- 固定参考：`references/github-image-resume`

图片简历核心实现参考：

- `base_agent/image_resume_parser.py`
- `backend/app/api/resume.py`
- `readdy-frontend/src/components/feature/resumeUploadContract.ts`

### 4.3 公司业务底座

- 远端：`https://git.ymdd.tech/cfpd/zhipin-mvp.git`
- 本轮隔离开发起点：`d18812e2034977a9a3142f36e76c3d6d496e37e7`
- 正确公司协作基准：远端 `test`，不要把旧候选分支误当成已部署版本。
- `frontend`、`backend` 和 `base_agent` 保留公司的业务、权限与接口实现，供后续研发接真实服务。

## 5. 当前实际架构

当前不是“一个前端已经全部接上真实后端”，而是两个用途明确的前端同时保留：

| 服务 | 端口 | 定位 | 数据状态 |
| --- | ---: | --- | --- |
| `readdy-frontend` | `5190` | 最终验收主产品，页面和按钮以 ZIP 为准 | 公司真实鉴权；业务数据为浏览器演示状态 |
| `frontend` | `5192` | 公司业务接口与图片简历实现参考 | 连接本隔离 Flask 和 SQLite |
| `backend` | `5010` | 独立 Flask API | `runtime/zhipin-demo.db` |
| OAuth 登录桥 | `5110` | 服务于 `5192` 和自动化鉴权实验 | 仅本地验收映射，正式 `5190` 不使用 |

后续接真实接口时，以 `5190` 的页面和交互作为不能退化的产品外壳，以 `5192 + backend + base_agent` 作为业务逻辑和接口参考，逐模块接入。不要为了接接口把 `5190` 的完整按钮和交互删掉。

主产品简历上传预留契约：

```text
POST /api/resumes/upload
Content-Type: multipart/form-data
字段：files
格式：PDF、DOC、DOCX、JPG、JPEG、PNG、WebP、GIF、ZIP
```

公司 OAuth 协议已接入 `5190`；其他正式业务 API、公司数据库、LLM 和视觉模型仍未接入。Apollo Secret、MCP SSO Token 和真实密钥只允许由环境、Apollo 或 CI 注入，禁止写进仓库。

## 6. 当前运行方式

先检查，不要盲目重复启动：

```bash
cd '/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app'
./scripts/check-isolated-demo.sh
```

如四项服务没有运行，使用：

```bash
./scripts/start-isolated-demo.sh
```

本项目的 `.venv`、两个前端的 `node_modules` 和运行数据均已独立准备好；不要给其他项目安装或覆盖依赖。

需要前台持续托管时才使用：

```bash
./scripts/serve-isolated-demo.sh
```

停止本项目：

```bash
./scripts/stop-isolated-demo.sh
```

交接时四项服务正在运行且健康：

- 主产品：`http://127.0.0.1:5190`
- 接口版：`http://127.0.0.1:5192`
- 当前内网主产品：`http://192.168.80.79:5190`
- 当前内网接口版：`http://192.168.80.79:5192`

内网 IP 会随 Wi-Fi 或网线变化，以 `check-isolated-demo.sh` 当次输出为准。

账号：

| 产品 | 账号 | 密码 |
| --- | --- | --- |
| `5190` 主产品 | 公司工号/账号 | 公司密码 |
| `5192` 接口版管理员 | `admin01` | `Zhipin2026` |
| `5192` 其他演示角色 | `manager01`、`hr01`、`interviewer01` | `Zhipin2026` |

浏览器验收请用 Tabbit。

## 7. 已完成的功能

主产品保留 24 条产品路由，覆盖：

- 招聘主管：工作台、招聘管理、简历库、人才地图、进度看板、面试、Offer、入职、周期、KPI、分析、AI 助手、设置等。
- 面试官：工作台、我的面试、候选人进展、参与岗位、待筛选简历。
- 管理层：驾驶舱、招聘进展、人才储备、审批与风险。

重点补齐：

- 岗位编辑和岗位内上传简历。
- 候选人批量分配负责人、添加标签、编辑档案。
- PDF、DOC、DOCX、JPG、JPEG、PNG、WebP、GIF 和 ZIP 导入交互。
- 系统用户新增、编辑、停用、启用。
- 权限保存、部门增删改、招聘流程阶段排序。
- 看板月份切换及可见结果提示。
- 原 ZIP 的空按钮和“功能开发中”占位操作全部清零。
- 修复嵌套按钮、React 渲染期状态更新和路由兼容告警。
- 接回公司登录鉴权，移除 Readdy 假登录和假角色切换；支持 Token、工号、权限菜单、四角色守卫、会话失效和退出清理。

所有真实后端尚不能完成的主产品操作使用明确演示状态和提示，不伪装成生产数据写入。

## 8. 已完成验收

ZIP 控件核对：

- 原 ZIP：718 个交互控件，479 个原生按钮。
- 整合主产品：758 个交互控件，502 个原生按钮。
- 原 ZIP 控件覆盖：718/718；5 个不安全的假鉴权标签由公司真实鉴权控件替换，其他缺失 0。
- 没有处理逻辑的按钮：0。
- “功能开发中”占位操作：0。

桌面验收：

- 24 页分别在 `1366x768`、`1440x900`、`1920x1080` 验收，共 72 次。
- 页面失败 0，整页横向溢出 0，按钮文字裁切 0。
- 全新标签页控制台错误 0、警告 0。
- 已实际点击月份、负责人、标签、候选人编辑、PNG/ZIP 导入、岗位编辑、岗位图片简历、用户停用和流程排序，均产生可见状态变化。
- 公司鉴权本地全链路通过，四角色守卫失败 0，Token 不进入 URL，退出后会话字段全部清除；公司网关现场仍需在可访问内网的环境验证。

代码验收：

- `node frontend/tests/readdy_zip_exact_parity.test.mjs`：通过，718 个原控件全部覆盖，仅 5 个假鉴权标签按安全清单替换。
- `cd readdy-frontend && npm run type-check`：通过。
- `cd readdy-frontend && npm run lint`：通过。
- `cd readdy-frontend && npm run build`：通过。
- `cd frontend && npm test`：通过。
- `cd frontend && npm run audit:interactions`：通过。
- `./.venv/bin/pytest backend/tests -q`：505 项通过。
- 生产构建只有“大分包”性能提醒，不影响本次功能和运行。

验收证据：

- `docs/evidence/2026-07-24-readdy-zip-parity/README.md`
- `docs/evidence/2026-07-24-readdy-zip-parity/acceptance.json`
- `docs/evidence/2026-07-24-readdy-zip-parity/screenshots/`
- `docs/evidence/2026-07-24-company-auth/README.md`
- `docs/evidence/2026-07-24-company-auth/acceptance.json`

## 9. 已知边界与下一阶段

尚未做：

- `5190` 主产品尚未逐模块连接公司真实 API。
- 公司 OAuth 协议已接回，但当前执行环境无法完成公司网关 TLS 握手，尚无 SIT 现场登录证据。
- Apollo、MCP SSO 和三方 Token 源码及注入口完整保留，但没有把真实密钥复制到隔离仓库。
- 没有生产数据库、SIT 或生产发布。
- 没有配置真实 LLM 或视觉模型密钥。
- 没有手机端专项开发。
- 没有把当前隔离分支推送或合并到公司 `test`。

最合理的下一阶段顺序：

1. 先让用户确认 `5190` 的页面和交互是否还要调整。
2. 在公司网络用真实公司账号完成 `5190` 登录、权限菜单和退出现场验收，不记录密码和 Token。
3. 用户明确要求接接口后，按模块建立 `5190 -> 类型化服务层 -> backend`，不要一次性重写全部页面。
4. 优先接简历上传/解析、候选人列表和岗位流程，再接面试、Offer、看板与设置。
5. 每接一个模块都复跑公司安全哈希、ZIP 控件审计和三档电脑尺寸验收。
6. 只有用户明确授权后，才制定向公司 GitLab `test` 迁移或发布的方案。

## 10. 接手安全规则

- 只操作 `/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724`。
- 不修改 `/Users/yenns/Documents/新版招聘/zhipin-mvp` 或“找寻项目”下其他目录。
- 不占用或停止其他产品端口和进程。
- 修改前先运行 `git status --short --branch`，不要覆盖用户新增改动。
- 不执行 `git reset --hard`、模糊 `pkill` 或通配符删除。
- 不 push、不 merge、不部署，除非用户在新窗口明确要求。
- 不把演示账号、演示 JWT 或演示状态描述成生产可用方案。
- 不接收或写入真实候选人数据和真实 API Key。
- 不静默修改 `frontend/tests/readdy_company_security_contract.test.mjs` 锁定的公司登录、Token、Apollo 和三方 Token 文件；确需变更必须先解释原因并获得用户确认。
- 所有新增可见按钮继续遵守：可操作、明确禁用或有清晰提示，绝不允许无响应。

## 11. 删除边界

用户多次强调稍后删除时必须彻底且不能污染其他产品。只有收到用户明确“现在删除”的指令后，才按 `docs/ISOLATED_CLEANUP.md` 操作。

顺序必须是：

1. 运行 `app/scripts/stop-isolated-demo.sh`。
2. 确认 `5010`、`5110`、`5190`、`5192` 均无本项目监听。
3. 只删除精确根目录 `/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724`。
4. 验证目录不存在且四个端口无监听。

不得提前删除，也不得扩大删除范围。

## 12. 新 Codex 第一轮动作

1. 打开应用目录并阅读本文、`docs/evidence/2026-07-24-company-auth/README.md`、`docs/PRODUCT_INTERACTION_GUIDE.md`、`docs/ISOLATED_CLEANUP.md`。
2. 运行 `git status --short --branch`，确认所在分支和是否出现新改动。
3. 运行 `./scripts/check-isolated-demo.sh`；服务健康就不要重启。
4. 用 Tabbit 打开 `http://127.0.0.1:5190`，确认主产品可访问。
5. 向用户简短报告接手状态，再只执行用户在新窗口提出的新任务。
