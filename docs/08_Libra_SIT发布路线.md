# 08 · Libra / SIT 发布路线

> 适用场景：用户说“发布到 test”“发布到 SIT”“test-zhipin 没变化”“公司服务器 test 没更新”时，先按本文执行，不要重新猜发布链路。

## 一句话结论

智聘测试站 `https://test-zhipin.yimidida.com/` 的有效发布路线是：

1. 代码必须在 CFPD 仓库 `git@git.ymdd.tech:cfpd/zhipin-mvp.git`。
2. CFPD `test` 和 `api` 最好保持同一个目标提交。
3. 进入 Libra 的执行 pipeline 页，选择 `test` 分支构建，并勾选“构建完成自动部署到 SIT 环境”。
4. 以测试站 HTML 资产哈希变化作为最终验收，不只看通知或绿色对勾。

历史上也可能通过构建成功行的“发布到SIT”按钮完成发布。现在不要把它当作首选路线；只有确认该行 `CommitID` 等于 CFPD `test` 最新提交，且最终测试站资产确实变化时，才算发布成功。

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
git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test refs/heads/api
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
cd frontend
npm test
npm run typecheck
npm run build
```

发布链路或 Docker/CI 改动还要检查：

```bash
git diff --check
make -n buildfrontend PKG_TAG= PKG_VERSION=
```

`make -n` 输出里不应出现 `zhipin-frontend:` 或 `zhipin-server:` 这种空镜像标签。

### 3. 推送 CFPD

提交后同时推到 `test` 和 `api`：

```bash
git push git@git.ymdd.tech:cfpd/zhipin-mvp.git HEAD:test
git push git@git.ymdd.tech:cfpd/zhipin-mvp.git HEAD:api
git ls-remote git@git.ymdd.tech:cfpd/zhipin-mvp.git refs/heads/test refs/heads/api
```

`test` 和 `api` 最好显示同一个提交。若只推 `api`，Libra 页面上的 `test` 构建不会拿到新代码；若只推 `test`，普通 GitLab CI 只在 `api` 分支自动跑，容易缺包记录。

### 4. 在 Libra 执行 pipeline

打开：

```text
https://libra.yimidida.com/#/cicd/ci/pipelineexec/2994/4334,4335
```

页面操作：

1. 分支选择 `test`。
2. 点击“开始构建”。
3. 确认勾选“构建完成自动部署到 SIT 环境”。
4. 提交构建。
5. 构建成功后确认 pipeline 的 `sha` 等于 CFPD `test` 最新提交。

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

## 常见坑

### 1. 为什么不要把 `api` 构建通知当成最终成功

`api` 分支可以打出包记录和镜像，但测试站最终要看 `test` 分支执行 pipeline 后自动部署 SIT。若通知里是：

```text
zhipin-frontend(RC_<时间戳>) - 失败 Unknown
```

且没有 `|test`，通常是之前用 `api` 包试探发布造成的失败通知，不代表最终 `test` 发布失败。最终以 `RC_<时间戳>|test - 成功` 和测试站资产哈希为准。

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

这是 Libra 传统发布通道的主机绑定缺失，不代表代码构建失败。智聘当前推荐路线是执行 pipeline 页的 `test` 分支自动部署 SIT；不要卡在普通发布按钮上。若公司后续要求恢复普通发布按钮，再让运维确认模块与 SIT 主机/实例绑定。

### 5. K8S SearchAppModuleInfo 返回空

如果：

```text
/k8s/Deployment/SearchAppModuleInfo?env=8&app_module_id=4334
/k8s/Deployment/SearchAppModuleInfo?env=8&app_module_id=4335
```

返回空，说明 K8S 应用管理页没有直接可操作的 deployment 记录。仍按执行 pipeline 页自动部署路线走。

## 本次已验证过的成功样例

2026-07-08 的候选人详情发布：

- CFPD 最新提交：`71152e6559f59af51eaee5fa0246b9bac4f620db`
- Libra `api` pipeline：`713866`
- Libra `test` pipeline：`713867`
- 成功发布版本：`RC_202607081252|test`
- 测试站新前端主包：`/assets/index-DCx3s8UI.js`
- 候选人详情 chunk：`/assets/CandidateProfilePage-RlmuqnXF.js`
