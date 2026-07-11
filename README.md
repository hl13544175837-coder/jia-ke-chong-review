<div align="center">

# 智聘 · AI 招聘管理系统

**AI-Powered Recruitment Management System**

用自然语言驱动的企业招聘平台 — 简历解析、智能匹配、AI 面试、数据看板，一站式闭环

[![Backend](https://img.shields.io/badge/backend-Flask%203.1-000000)](https://flask.palletsprojects.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%208-61dafb)](https://react.dev/)
[![AI](https://img.shields.io/badge/AI-LangGraph%20%2B%20DeepSeek-ff6b6b)](https://langchain-ai.github.io/langgraph/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## 接手先读

如果你是下一任接手开发的人，先看 [docs/README.md](docs/README.md) 判断“先读哪份、信哪份”。本页只负责项目总览和快速开始；当前实现细节以 [docs/SDD-智聘招聘系统-v1.0.md](docs/SDD-智聘招聘系统-v1.0.md) 为准，本地运行以 [RUNNING.md](RUNNING.md) 为准，生产/试点部署以 [DEPLOYMENT.md](DEPLOYMENT.md) 和上线检查清单为准。

本 README 里的功能介绍用于了解系统能力，不等于生产上线完成证明。涉及真实 HR 试点、服务器部署、数据清理、LLM 合规或备份恢复时，必须再看 [docs/06_试点上线检查清单.md](docs/06_试点上线检查清单.md) 和 [docs/07_上线部署前关键清单](docs/07_上线部署前关键清单_给AI执行.md)，并由负责人确认后执行。

> **2026-07-11 收口状态口径**：本代码树已完成 `demand_id` P0、数据库生命周期、面试轮次唯一性、Demand 维度 BI、错误态保真、运行配置与可恢复清理的合并前收口，可作为 CFPD `test` 的下一代码候选。Git 推送只改变代码源，不等于 Libra 已构建或 SIT 已部署；环境状态必须分别用 CFPD ref、Libra CommitID/镜像、schema revision、测试站资产和受控 API 证据确认。本轮不引入 OA/Consul、微服务或依赖大版本升级。

## 📖 项目简介

**智聘** 是一套面向 HR、招聘管理者与面试官的招聘管理系统。P0 的主线是让用户找到一次真实招聘需求，看清进度与责任人，下钻候选人并完成当前动作。AI 用于解析、匹配、总结和建议，不替人淘汰、推进、发 Offer、转派或关闭需求。

系统覆盖招聘全闭环：**简历入库 → 岗位发布 → 智能匹配 → AI 面试 → 流程流转 → 数据洞察**，并提供基于角色（RBAC）的差异化视图。

## ✨ 核心特性

### 🤖 AI 智能助手（辅助能力）
- **LangGraph ReAct 智能体** —— 手搓决策↔工具循环，自主规划多步任务
- **P0 工具边界** —— 保留候选人/职位/匹配/流程/BI/系统概览/联网搜索等只读或建议能力；自动淘汰、Offer、转派和流程推进工具从目标工具目录移除
- **人工确认边界** —— AI 结果只是辅助判断，服务端 RBAC、业务校验与审计不得被 prompt 或前端入口绕过
- **联网搜索** —— 集成实时搜索，查询薪资行情、技能趋势等外部信息
- **SSE 流式对话** —— 实时展示「思考 → 调用工具 → 拿到数据 → 流式回答」全过程
- **跨页面会话保留** —— 切换页面对话历史不丢失
- **角色化示例问题** —— 招聘专员、经理/负责人、管理员看到各自权限内的推荐问法，避免点到无权限的团队看板或治理入口

### 📄 简历智能解析
- 支持 **PDF / DOCX** —— pdfplumber + python-docx 双引擎
- LLM 提取结构化信息（姓名/教育/经历）+ 自动技能标签评分
- 批量上传、ZIP 压缩包解压（防 zip 炸弹）
- 上传后统一先保存到简历库，后续在简历库用“目标岗位 / 招聘需求”查看适配候选人，并按“入需求流程状态”筛选后加入该需求流程
- 轻量试点防重：同一用户短时间重复提交同一批简历会复用首次结果，避免网络抖动或连点产生重复候选人
- 旧版 `.doc` 因宏风险会被跳过；误导入可按上传批次撤回，候选人会匿名化并删除原文件
- 候选人来源、内推人/猎头联系人和批次备注默认作为选填信息收起，减少上传主流程干扰
- 候选人详情支持受控导出 CSV；打开详情、导出和删除都会进入审计日志，同一人短时间导出偏多会在管理员审计页标红
- 候选人删除采用软删除 + 匿名化：清空姓名/邮箱/电话/简历 JSON，移除原简历文件，历史流水保留用于审计

### 💼 招聘需求与岗位画像
- `Job` 是可复用的职位/JD 模板，一个 Job 可以被多个 `RecruitmentDemand` 复用；城市、部门、批次、HC、用人负责人和招聘负责人属于 Demand
- `RecruitmentDemand` 是一次真实招聘责任单；候选人流程、面试、Offer、HC、审计和 BI 的目标归属键都是 `demand_id`
- 岗位画像支持 AI 结构化 JD + **澄清追问**（缺失信息主动追问，提升画像准确度）
- 需求暂停、取消、提前关闭和转派需要原因并保留审计；Demand 的关闭/恢复/转派不再同步改写 Job 模板

### 🎯 智能匹配 & AI 面试
- 岗位画像-候选人技能匹配排名（命中/欠缺标签可视化），用人需求卡片和岗位列表都提供“匹配候选人”入口；匹配页支持“AI 推荐 / 全部候选人”两种视角；HR 可在权限范围内按姓名、公司、学校、岗位或技能搜索候选人，AI 没推荐到的人也能人工补找并加入该需求流程
- AI 生成定制面试题 → 录入作答 → AI 评估报告；报告不自动改变候选人流程
- 面试不再作为招聘角色的重复一级工作台；招聘专员从工作台待办或候选人流程进入面试任务，面试官从“我的面试”任务卡点击“填写反馈”后自动定位到对应反馈表
- 候选人一期只允许一条进行中流程；转需求必须在同一事务中将来源记为 `transferred`、目标从 `pending` 开始，并跟随目标 Demand 负责人；`transferred` 不是 `rejected`
- 主流程只保留“面试中”；一面/二面/终面/加面是轮次任务。主面试官反馈只完成本轮，后续推进或淘汰由 HR/经理/管理员确认
- 候选人负责人转派改为选择招聘专员姓名并填写转派原因，不再要求输入用户 ID

### 📊 数据看板
- 按 Demand 查看当前阶段、停滞时长、待补反馈、Offer、HC 和当前责任人，数字可下钻到候选人与业务事实
- BI 只用于进度、卡点和责任协同，不用于个人绩效排名、奖金或历史功劳结算
- AI 助手同样遵守 BI 权限：团队 BI 只允许经理/管理员查看，招聘专员不能通过自然语言绕过看板权限
- BI 页面提供“协同归属”说明：HR 负责候选人推进，推进人只看操作留痕，面试官负责反馈闭环，用人部门按岗位部门聚合

### 🔐 权限与账户
- JWT 认证 + RBAC（admin / manager / recruiter / interviewer）
- 多组织隔离：核心招聘数据带 `org_id`，登录后服务端按当前用户组织过滤岗位、候选人、流程、面试、BI、AI 工具和审计日志
- 公开注册默认关闭，试点账号由管理员创建并分配
- 管理员重置密码或用户自助改密后，旧登录 token 会立刻失效
- 面试官账号只保留工作台和“我的面试”主入口，只能填写分配给自己的面试反馈，不开放全量简历库、候选人流程、AI 助手主入口，也不能直接推进 Offer 或淘汰
- 管理员系统设置按账号管理、审计日志、AI 边界分区；审计日志展示 request_id、操作者角色、目标、来源、结果和失败原因，越权请求会以告警标红
- 个人信息、自助改密


## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  前端 SPA  (React 18 + Vite + TS + Tailwind + GSAP)    │
│  工作台/招聘需求/简历库/流程/面试/BI/AI助手等试点页面 │
│  recharts 图表 · 近黑 Cal.com 设计语言                    │
└──────────────────────────┬──────────────────────────────┘
                           │ /api (Vite 代理 / Flask 同源托管)
┌──────────────────────────▼──────────────────────────────┐
│  后端  Flask 3.1 + SQLAlchemy + JWT/RBAC                 │
│  ┌────────────┬────────────┬──────────────────────────┐  │
│  │ auth       │ resume     │ jobs / match / pipeline   │  │
│  │ interview  │ bi         │ agent (LangGraph SSE)     │  │
│  │ demands    │ talent_maps│ notifications / admin     │  │
│  └────────────┴────────────┴──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ 复用
┌──────────────────────────▼──────────────────────────────┐
│  base_agent/  LLM 客户端(DeepSeek) · 简历解析 · 匹配算法   │
└──────────────────────────────────────────────────────────┘
```

**技术栈**

| 层 | 技术 |
|----|------|
| 前端 | React 18.3 · Vite 8 · TypeScript 5.9 · Tailwind 3.4 · GSAP 3.15 · recharts 3.8 · React Router 6 |
| 后端 | Flask 3.1 · SQLAlchemy 2.0 · SQLite/MySQL/PostgreSQL · PyJWT |
| AI | LangGraph 1.2 · DeepSeek v4 (OpenAI 兼容) · pdfplumber · python-docx |
| 数据 | SQLite（开发）/ MySQL（公司试点）/ PostgreSQL（兼容） |

## 🚀 快速开始

### 环境要求
- Python 3.11–3.13（推荐及容器基线 3.12）· Node.js 20.19–20.x 或 22.12+ · npm 10+

### 1. 后端
```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env          # 填入 LLM API Key
PORT=5001 python run.py       # 开发联调后端：http://localhost:5001
```

本地测试或 `debug + SQLite` 可使用应用兼容建表；RC/SIT/生产不会在 Flask worker 启动时执行 DDL。真正空库必须走显式 bootstrap，已有库必须走 Alembic，部分建表的异常库会拒绝自动补齐。详见 [RUNNING.md](RUNNING.md) 和 [DEPLOYMENT.md](DEPLOYMENT.md)。

### 2. 演示数据（可选，无需 LLM Key）
```bash
cd backend && python seed_dev.py
```

真实 HR 试点前不要带演示数据。先预览清理范围：

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

确认备份和清理范围后，再执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

清理脚本会先生成带 manifest/校验和的可恢复快照，只删除 demo owner 的业务记录和仅被这些记录引用的上传文件；遇到真实 owner、跨范围引用或不支持自动确认的 MySQL 路线会 fail closed，不会把整个上传目录清空。

### 3. 前端
```bash
cd frontend
npm ci
npm run dev                   # http://localhost:5173，代理到 :5001
```

### MVP 内部试用账号（统一密码 `Zhipin2026`）
| 展示角色 | 技术角色 | 邮箱 |
|------|------|------|
| 管理员 | `admin` | admin01@mvp.local |
| 招聘经理 | `manager` | manager01@mvp.local |
| 招聘负责人 | `manager` | lead01@mvp.local |
| 招聘专员 | `recruiter` | hr01@mvp.local |
| 招聘专员 | `recruiter` | hr02@mvp.local |
| 招聘专员 | `recruiter` | hr03@mvp.local |
| 面试官 | `interviewer` | interviewer01@mvp.local |

> 角色口径：权限判断只认 `admin` / `manager` / `recruiter` / `interviewer` 四类技术角色。“招聘负责人”是 `manager` 的业务展示名，不是新的 RBAC 角色。

面试官账号用于查看分配给自己的面试任务、候选人详情和填写反馈；不会显示“推进 Offer/淘汰”等流程按钮，招聘流程推进仍由 HR/经理/管理员完成。

> 完整部署指南（生产/gunicorn/systemd/公网穿透）见 [DEPLOYMENT.md](DEPLOYMENT.md)

## 📁 项目结构

```
.
├── backend/          Flask 后端（app-factory + 蓝图）
│   ├── app/api/      API 蓝图（auth/resume/jobs/demands/match/pipeline/interview/bi/agent/boss/talent_maps/notifications/admin/candidates）
│   ├── app/services/ 业务服务（agent / match / resume / interview / boss）
│   └── run.py        启动入口
├── frontend/         Vite + React 前端
│   └── src/
│       ├── pages/    工作台/招聘需求/简历库/流程/面试/BI/AI助手/系统设置等页面（实验页代码可保留，P0 主导航隐藏）
│       ├── components/ UI 基元 + 业务组件
│       └── lib/      api 客户端 / auth / agent 流式
├── base_agent/       复用的 LLM/解析/匹配模块
├── docs/             需求 / PRD / 设计文档
├── README.md
└── DEPLOYMENT.md     部署文档
```

## 🤖 AI 助手用法示例

```
你：系统里有多少候选人和岗位？
AI：[调用 count_summary] 当前 14 位候选人、8 个岗位…

你：总结需求 #12 当前的卡点和待办责任人
AI：[调用 demand-scoped 只读工具] 返回进度、待补反馈和建议下一步，不直接推进流程

你：联网查一下2025年后端工程师的市场薪资
AI：[调用 web_search] 根据最新数据…
```

AI 助手首页示例会按角色变化：招聘专员优先看到“我负责的候选人卡在哪”，经理/负责人看到“团队招聘漏斗”，管理员看到“审计、权限和 AI 边界”相关问题。

## 📄 许可证

MIT License

---

<div align="center">
<sub>智聘 · AI 招聘管理系统 — 让招聘流程被 AI 理解、被自然语言驱动</sub>
</div>
