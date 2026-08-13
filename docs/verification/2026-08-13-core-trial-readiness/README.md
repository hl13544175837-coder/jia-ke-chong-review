# 核心招聘流程小范围试用验证记录

## 范围

- 分支：`codex/core-trial-readiness-20260813`
- 基线：公司 `test` 的 `22b37e8`
- 核心链路：招聘需求、简历入库、候选人流程、面试、Offer、看板
- 数据边界：只使用隔离测试数据库和临时附件；本轮验证未连接公司真实数据库
- 非放行项：AI 简历解析、AI 助手、BOSS、OA、外部通知、外部日历

## 基线结果

### 后端与 Agent

命令：

```bash
.venv/bin/python -m pytest backend/tests base_agent/tests -q
```

首次结果：`853 passed, 1 failed, 5 warnings`。唯一失败是
`test_dev_gateway_account_prefix_treats_like_wildcards_as_literal_text`：测试使用默认
`FLASK_DEBUG=false` 的配置，导致本地开发登录桥未注册并返回 405。

分类：P0（本地/隔离试用登录测试阻塞）。生产代码只允许 debug 注册登录桥的设计正确，
因此修复测试配置，使该回归显式使用 `FLASK_DEBUG=true`，未放宽生产 mock 边界。

相关回归：认证、网关角色与注入测试 `23 passed`。

修复后全量结果：`854 passed, 5 warnings`，耗时约 4 分 53 秒。5 条 warning 来自第三方
SWIG 类型的弃用提示，未影响六条核心链路，分类为 P2。

### 前端

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run lint
npm run build
```

结果：契约测试 `35/35` 通过；TypeScript 通过；Lint 0 warning；Vite 生产构建成功。

### 数据库与构建

- Alembic 唯一 head：`20260811_18`
- `git diff --check`：通过
- `make -n build PKG_TAG=RC PKG_VERSION=core-trial-baseline`：前后端 RC 镜像命令均可生成

## 当前问题清单

- P0：0（基线发现的本地登录桥测试配置问题已修复）
- P1：0（待新增六模块闭环和浏览器冒烟继续验证）
- P2：第三方 SWIG 弃用 warning 5 条，不属于本轮核心链路阻塞项

## 后续证据

本文件将在新增 `internal-trial` 门禁、六模块 API 闭环、五角色浏览器冒烟和最终全量门禁后继续更新。
