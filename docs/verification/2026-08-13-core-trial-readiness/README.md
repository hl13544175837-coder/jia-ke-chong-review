# 核心招聘流程内部试用验证记录

## 交付范围

- 分支：`codex/core-trial-readiness-20260813`
- 公司 `test` 基线：`22b37e8`
- 已验证代码候选：`2b732da`；本文件作为证据提交后，以分支 `HEAD` 为最终交付提交
- 核心链路：招聘需求、简历入库、候选人流程、面试、Offer、看板
- 试用数据：交付配置允许公司内部授权同事使用真实数据；自动化验证使用隔离临时数据库和临时附件，没有连接或改写公司真实数据库
- 本轮非放行项：AI 简历解析、AI 岗位画像、AI 助手、BOSS 自动化、OA 自动审批、外部消息和外部日历

## 已完成的稳定性优化

1. 新增严格的 `internal-trial` 就绪检查和配置模板，要求正式数据库、长期附件与备份目录、安全响应头、限流和正常账号密码登录。
2. 内部试用默认关闭简历 AI 与岗位画像 AI，外部模型不可用时不会拖住创建需求、人工补录简历或候选人推进。
3. 关闭简历 AI 时，上传文件先保留原件并等待人工确认；资料确认成功后才进入上传时选定需求的“待筛选”，避免未确认简历提前进入流程。
4. 新增一条六模块 API 完整闭环，覆盖需求 → 简历 → 流程 → 面试 → Offer → 入职 → 看板，并验证重复操作不会生成重复记录。
5. 浏览器冒烟扩展到招聘需求、简历库、招聘进度、面试、Offer、数据看板，同时保留五角色登录和越权拦截检查。
6. 核心闭环已加入现有 `backendCriticalBusiness` CI 任务；未新增 stage、Runner 或重复依赖安装。

## 最终自动化结果

### 后端、Agent 与核心流程

```bash
.venv/bin/python -m pytest backend/tests base_agent/tests -q
```

- 结果：`871 passed, 5 warnings`
- 耗时：`314.66s`（约 5 分 14 秒，与优化前基线相当）
- Warning：第三方 SWIG 类型弃用提醒，不影响核心业务，分类为 P2

核心相关组合回归：`127 passed`。六模块主闭环单测：`1 passed`。

### 前端

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run lint
npm run build
```

- 合同测试：`35/35` 通过
- TypeScript：通过
- ESLint：0 warning
- Vite 正式构建：成功

### 浏览器

```bash
bash scripts/run-isolated-browser-smoke.sh
```

- 结果：`9 passed`
- 覆盖：五角色入口、招聘专员六个核心工作区、未登录拦截、越权拦截
- 隔离性：临时数据库、临时附件、随机本地端口；结束后临时服务全部退出

### 部署与 GitLab 兼容

```bash
.venv/bin/python -m pytest backend/tests/test_deployment_artifacts.py -q
```

- 结果：`29 passed`
- `.gitlab-ci.yml` 不包含公司旧 GitLab 不支持的 `workflow:` 或 `auto_cancel:`
- 四个 CI job 都有 `interruptible: true` 和明确的 20–45 分钟超时，不会在 Runner 已开始执行后无限挂住
- 前端、后端、浏览器和镜像构建沿用现有 `t_FRONTEND` Runner，不新增排队来源

## 问题分级与边界

- P0：0
- P1：0
- P2：第三方 SWIG 弃用 warning 5 条，不阻塞内部小范围试用
- 公司 Runner 是否排队属于 GitLab 基础设施状态；代码可以限制任务执行时长，但不能替公司平台保证排队时间
- 推送独立分支不会合并或改动 `test`；当前 CI 的 `only` 规则也不会因普通功能分支 push 自动触发公司构建

## 试用结论

代码候选已达到公司内部小范围试用标准。建议先由一名招聘专员用一条 1 HC 真实需求跑通完整闭环，确认备份和页面数据一致后，再逐步增加试用同事。AI 和外部系统保持关闭，不作为本轮核心流程的依赖。
