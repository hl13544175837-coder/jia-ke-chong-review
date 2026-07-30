# 08 · Libra / SIT 发布路线

> 适用场景：用户说“发布到 test”“发布到 SIT”“test-zhipin 没变化”“公司服务器 test 没更新”时，先按本文执行，不要重新猜发布链路。

> **2026-07-22 当前状态**：本地 Codex 功能候选 `codex/readdy-test-product` 基于远端 `test` `5e251a2`，功能候选 SHA `5ef064a`。当前未 push、未进入 Libra 构建/部署、未在 SIT 生效；本地候选不等于 SIT 已部署。实际环境状态仍以 CFPD ref、Libra CommitID/镜像、部署日志、schema revision、测试站资产和受控 API 为准。
>
> **2026-07-11 历史状态**：`codex/premerge-p0-closeout-20260711` 当时已形成基于 CFPD `test` 的代码候选。即使代码 fast-forward 推到 CFPD `test`，也只代表发布平台可读取该代码，不代表已触发 Libra 构建或 SIT 部署。SIT 演示数据允许清空或重建。

> **当前 RC 运行口径**：SIT 是项目负责人单人使用的可丢弃数据测试环境。RC server 镜像会显式跳过生产启动配置门禁，关闭应用安全头/限流，开放注册与 CORS，同时保持 `FLASK_DEBUG=false`。这不改变 CFPD ref、Libra 部署证据、schema 和业务冒烟的验收要求，也不授权导入真实候选人数据。

## 一句话结论

智聘测试站 `https://test-zhipin.yimidida.com/` 的有效发布路线是：

1. 代码必须在 CFPD 仓库 `git@git.ymdd.tech:cfpd/zhipin-mvp.git`。
2. 发布代码源是 CFPD `test`；推送前后都核对 ref，默认只做 fast-forward，不强推无关历史。
3. 进入 Libra 执行 pipeline 页，用 `test` 同批构建前后端；“自动部署”勾选只表示请求意图，不是部署证据。
4. 构建后先查两模块当批 RC 的部署日志；已有记录就等待，没有记录才进入持续发布/K8S 核对可绑定版本。
5. 以部署记录、schema/受控 API 和测试站资产共同验收，不只看通知或绿色对勾。

`demand_id` 版本还必须加上：同引擎备份恢复、单次 migration Owner、schema revision、audit/backfill/verify 报告、cutover marker 和兄弟 Demand 业务冒烟。没有这些证据时，只能判定“镜像/静态资产已发布”，不能判定“demand-scoped 切换完成”。

历史上的“发布到SIT”按钮、持续发布绑定和 pipeline 自动部署是不同通道。先看本批次部署日志决定下一步，禁止对同一个 RC 重复发起发布；只有 CommitID、部署记录、应用健康与测试站证据全部对齐时才算成功。

## 固定信息

| 项 | 值 |
|---|---|
| 测试站 | `https://test-zhipin.yimidida.com/` |
| Libra | `https://libra.ymdd.tech` / `https://libra.yimidida.com` |
| Libra 执行 pipeline | `https://libra.yimidida.com/#/cicd/ci/pipelineexec/2994/4334,4335` |
| GitLab 项目 | `git@git.ymdd.tech:cfpd/zhipin-mvp.git` |
| GitLab project_id | `2994` |
| 后端模块 | `4334` / `zhipin-server` |
| 前端模块 | `4335` / `zhipin-frontend` |
| SIT env_id | `8` |
| 有效构建分支 | `test` |

## 标准发布步骤

### 1. 确认代码源

不要只看本地默认 `origin` 名字，必须核对 CFPD 仓库：

```bash
git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test
```

如果本次修复来自 ARC、GitHub 或别的分支，先从 CFPD `test` 拉一个干净临时工作区，最小化移植本次改动：

```bash
git fetch git@git.ymdd.tech:cfpd/zhipin-mvp.git '+refs/heads/*:refs/remotes/cfpd/*' --prune
git worktree add -B codex/cfpd-<fix-name> /tmp/zhipin-cfpd-<fix-name> cfpd/test
cd /tmp/zhipin-cfpd-<fix-name>
```

### 2. 本地验证

前端改动至少跑：

```bash
(cd frontend && npm ci && npm test && npm run typecheck && npm run build)
```

发布链路或 Docker/CI 改动还要检查：

```bash
git diff --check
make -n buildfrontend PKG_TAG= PKG_VERSION=
```

`make -n` 输出里不应出现 `zhipin-frontend:` 或 `zhipin-server:` 这种空镜像标签。

### 3. 推送 CFPD

提交前再次确认远端 `test` 没有前进；只做 fast-forward 推送并回读 SHA：

```bash
git push git@git.ymdd.tech:cfpd/zhipin-mvp.git HEAD:test
git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test
```

CFPD `test` 是 Libra 本路线的代码源。`api` 属于另一条历史 CI/包记录路径，不是每次 SIT 发布必须同步的分支；未经本次范围授权不要顺带推送。Git push 成功只证明代码源更新，不会自动证明 pipeline 或部署已发生。

### 4. 在 Libra 执行 pipeline

打开：

```text
https://libra.yimidida.com/#/cicd/ci/pipelineexec/2994/4334,4335
```

页面操作：

1. 分支选择 `test`。
2. 点击“开始构建”。
3. 可勾选“构建完成自动部署到 SIT 环境”，但记录“勾选不等于已经部署”。
4. 提交构建。
5. 构建成功后确认 pipeline 的 `sha` 等于 CFPD `test` 最新提交。
6. 进入“部署日志”，分别查询 `zhipin-server`、`zhipin-frontend` 的本批次 RC：
   - 已有发布记录：等待结果，不再手工绑定或重复发布同一 RC。
   - pipeline 已结束、刷新后仍只有构建版本且没有发布记录：才进入“持续交付 → 持续发布 → k8s应用管理”，按 `Sit(集成)` / `产品一组` / `zhipin-mvp` / 模块筛选并核对可绑定版本。
   - 筛选后仍“暂无数据”：立即停止，不猜测入口，不继续点击发布。
7. 发布前在“综合查询 → 应用系统查询”核对发布时间窗口；字段含义不清时停止并记录待确认项。

#### demand_id 版本的发布顺序

Libra 构建成功不会自动证明 schema 已准备好。当前 RC/SIT server 镜像通过 Makefile 传入 `ALLOW_EMPTY_DATABASE_BOOTSTRAP=true` 和 `AUTO_MIGRATE_DATABASE=true`：entrypoint 先只在真正空库运行显式 bootstrap 并 stamp 当前 head，再在 Gunicorn 前执行 `alembic -c /app/backend/alembic.ini upgrade head`；发现部分 schema 会拒绝继续，不做猜测补表。`GA` 对两个开关都关闭。这条路线只用于数据可丢弃的 SIT 验收环境，发布时不得并发启动多个新 server 副本；生产仍必须使用唯一 migration job 和完整门禁。当前代码候选期望 revision 为 `20260729_11`。

同一个非 `GA` 构建还应在 `make -n PKG_TAG=RC buildserver` 中出现 `ALLOW_INSECURE_SIT_STARTUP=true`、`SECURITY_HEADERS_ENABLED=false`、`RATE_LIMIT_ENABLED=false` 和 `ALLOW_PUBLIC_REGISTRATION=true`；`GA` 干跑必须显示反向严格值。`check_pilot_readiness.py` 会故意拒绝宽松开关，因为它是真实数据试点/GA 工具，不应作为本 SIT 构建成功条件。

干跑还必须分别出现 `--build-arg RELEASE_CHANNEL=RC` 和 `--build-arg RELEASE_CHANNEL=GA`。该值在构建时写入镜像内部文件；GA entrypoint 会在空库 bootstrap 或 Alembic 之前拒绝任何运行时宽松覆盖，因此不能用 K8S env 把 GA 镜像临时变成 RC。

1. 在 SIT 同引擎临时库验证 pre-cutover 备份恢复；MySQL 必须有真实临时库导入与核对证据。
2. RC/SIT 容器启动时由 entrypoint 处理真空库 bootstrap 或已有库 Expand，发布后独立核对 `alembic current == 20260729_11`；`/api/health` 只证明 liveness。
3. 运行 audit/backfill dry-run；歧义 bundle 经业务负责人批准后才允许回填。
4. verify 通过后部署 dual-write 兼容版，做 shadow comparison，不立即 Contract。
5. 新前端、新后端、AI、BI、通知、审计全部对齐且旧 worker/旧资产退出后，由负责人决定是否设置 cutover marker。
6. 一旦开放同 Job 并行多 Demand，不得只回退旧镜像；只能向前修复或停写后整体恢复 pre-cutover 快照。

可用 Libra API 复核 pipeline：

```text
GET https://libra.yimidida.com/api/v1/gitlab/pipelinelist?project_id=2994&branch=test
```

有效成功通知应类似：

```text
发布结束通知
类型：应用发布 (K8S)
环境：Sit(集成)
zhipin-server(RC_<时间戳>|test) - 成功
zhipin-frontend(RC_<时间戳>|test) - 成功
```

## 验收方式

只凭 Libra 通知不够，必须用测试站静态资产确认：

```bash
curl -sS -L -D /tmp/test-zhipin.headers https://test-zhipin.yimidida.com/ -o /tmp/test-zhipin.html
sed -n '1,16p' /tmp/test-zhipin.headers
perl -ne 'while(m#(/assets/[^"<> ]+)#g){print "$1\n"}' /tmp/test-zhipin.html | sort -u
```

前端页面类修复还要确认新 chunk 和关键文案在线可访问。例如候选人详情三栏阅读版：

```bash
curl -sS -L https://test-zhipin.yimidida.com/assets/CandidateProfilePage-RlmuqnXF.js -o /tmp/CandidateProfilePage-RlmuqnXF.js
rg '完整简历|阅读区可独立滚动|当前操作岗位|淘汰原因' /tmp/CandidateProfilePage-RlmuqnXF.js
```

后端至少验证健康、未登录权限和本次变更对应的受控 API。`/api/health` 只能证明进程存活，不能单独证明 schema、backfill、数据库、uploads 或外部依赖正确：

```bash
curl -sS -i https://test-zhipin.yimidida.com/api/health
curl -sS -i https://test-zhipin.yimidida.com/api/jobs   # 未登录应为 401/403
```

demand-scoped P0 最终证据集：

`CFPD test SHA + Libra pipeline/CommitID + 前端资产哈希 + 后端版本/受控 API + schema revision + audit/backfill/verify 报告 + 同引擎备份恢复证据 + cutover marker 状态 + 同 Job 双 Demand 冒烟 + 验证人/时间`。

缺任一项只能判定为部分验证，不能说 demand-scoped P0 已在 SIT 完成切换。

## 常见坑

### 1. 为什么不要把 `api` 构建通知当成最终成功

`api` 分支可能打出包记录和镜像，但本路线的代码源与构建分支是 `test`。若通知里是：

```text
zhipin-frontend(RC_<时间戳>) - 失败 Unknown
```

且没有 `|test`，它不能证明本次 `test` 发布成功或失败。最终以当批 `test` CommitID、两模块部署记录、运行健康和测试站资产为准。

### 2. `zhipin-frontend:` 空镜像标签

失败日志类似：

```text
invalid tag "registry-sit.uce.cn/system-zhipin-mvp/zhipin-frontend:": invalid reference format
```

原因是 `PKG_VERSION` 为空。当前 `.gitlab-ci.yml` 和 `Makefile` 已做兜底；如果又出现，先检查这两处有没有被回退。

### 3. `package.py` 写不出 `RC_<时间戳>` 包记录

如果 pipeline 成功但 Libra 版本列表没有新版本，检查 `.gitlab-ci.yml` 里 `package.py` 是否使用同一组 `PKG_TAG` / `PKG_VERSION`。

### 4. 普通“发布到 SIT”接口报无主机

如果接口返回：

```text
zhipin-server 该模块在当前环境无主机
zhipin-frontend 该模块在当前环境无主机
```

这只能判定 Libra 传统主机发布通道没有主机绑定，不能推导代码构建失败、K8S 不可用或自动部署已发生。回到本批次部署日志核对；若没有记录，再按上面的持续发布/K8S 分支判断。

若部署日志出现“异常”、`Ready 0/1` 或 `CrashLoopBackOff`，说明发布已经到 K8S 但应用未健康。停止重复发布同一 RC，先取容器日志定位根因。部署历史、当前可绑定版本和 K8S 可回滚版本是三类数据，不得相互代替。

### 5. K8S SearchAppModuleInfo 返回空

如果：

```text
/k8s/Deployment/SearchAppModuleInfo?env=8&app_module_id=4334
/k8s/Deployment/SearchAppModuleInfo?env=8&app_module_id=4335
```

返回空，说明当前筛选下没有可操作的 deployment 记录。立即停止，不继续点发布、不猜测其他入口；记录筛选条件并核对部署日志或请平台 Owner 解释。

## 历史成功样例（只用于识别证据形态）

2026-07-08 的候选人详情发布：

- 当时 CFPD `test` 提交：`71152e6559f59af51eaee5fa0246b9bac4f620db`
- Libra `api` pipeline：`713866`
- Libra `test` pipeline：`713867`
- 成功发布版本：`RC_202607081252|test`
- 测试站新前端主包：`/assets/index-DCx3s8UI.js`
- 候选人详情 chunk：`/assets/CandidateProfilePage-RlmuqnXF.js`
