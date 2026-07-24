# 5190 公司登录鉴权修复验收

验收时间：`2026-07-24 12:16 +0800`

## 根因

公司原 `frontend` 的 OAuth、Token、工号、权限、Apollo 和三方 Token 源码没有被删除。最初问题是 `5190` 主产品使用了 Readdy 的定时器假登录和浏览器假角色切换，主入口因此绕过公司已经调好的安全链路。

`2026-07-24 11:40` 再次登录失败的直接原因另有一层：启动脚本仍指向已无法解析的 `test-pgsgw.yimidida.com`，Vite 代理连接失败后返回空的 HTTP 500，页面又把空错误错误地显示成“账号或密码错误”。这次请求实际没有到达公司登录服务，所以不能据此判断用户密码错误。

## 修复范围

- `5190` 登录按公司 GitLab `test` 基线 `5e251a2` 执行：账号密码前端 MD5、网关 OAuth、Bearer Token、profile 工号。
- profile 若返回合法角色则使用该角色；否则沿用 `test` 基线的 `VITE_DEFAULT_ROLE=admin` 联调兜底。当前生产网关的 `/zhipin-server/api/auth/me` 未部署，不能把兜底角色描述成正式 RBAC。
- 沿用 `hireinsight_token`、`hireinsight_emp_code`、`X-Emp-Code` 和 `clientId=zhipin`。
- 业务路由保留登录守卫和页面角色守卫。
- 删除 Readdy 假角色切换，账号菜单提供权限重载和真实退出登录。
- `5190` 默认直连当前可访问的公司 OAuth 网关 `https://pgsgw.yimidida.com/pgs/oauth`；本地 OAuth 桥只用于自动化验收。
- 网关无业务错误正文时不再伪装成密码错误，而是明确显示连接失败。
- 启动脚本不再强制设置 `APOLLO_ENABLED=false`，不再覆盖 JWT，也不再清空模型密钥。
- 公司原登录页与默认 Vite 配置恢复原样；隔离联调使用独立 `frontend/vite.isolated.config.ts`。

## 冻结文件核对

以下文件与 `/Users/yenns/Documents/新版招聘/zhipin-mvp` 对应文件逐字一致：

- `frontend/src/pages/LoginPage.tsx`
- `frontend/vite.config.ts`
- `frontend/src/lib/gatewayAuth.ts`
- `frontend/src/lib/auth.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/permissions.tsx`
- `backend/apollo_config.py`
- `backend/app/services/third_party_service.py`
- `backend/app/middleware/auth.py`
- `backend/app/api/auth.py`

`frontend/tests/readdy_company_security_contract.test.mjs` 保存上述文件 SHA-256；以后发生静默修改会直接测试失败。

## 本地完整链路实验

使用本地验收桥模拟公司网关，实际浏览器运行：

```text
公司账号 + 密码
  -> MD5 密码
  -> POST /pgs/oauth/login
  -> Bearer Token
  -> GET /pgs/oauth/api/profile
  -> 工号
  -> profile 角色或 test 基线默认角色
  -> POST queryCurrentUserMenu?clientId=zhipin
```

结果：

- 登录前自动进入 `/login`，显示“公司账号”和“工号 / 账号”。
- 本地验收桥的管理员登录后 Token 存在、工号为 `admin01`、角色为 `admin`，Token 不出现在 URL。
- 假角色 localStorage 键不存在，“切换角色”入口不存在。
- 退出登录后 Token、工号和角色全部清除并返回 `/login`。
- 管理员可以访问设置。
- 经理访问设置、招聘专员访问管理驾驶舱、面试官访问全量简历库时均显示无权访问。
- 四角色页面控制台错误均为 0。
- 真实公司网关连通性和 CORS 预检通过；使用明确伪造的账号探针时，网关返回“用户名错误，请确认”，证明请求已到达真实公司鉴权服务。
- 未收集、未保存用户 `100001` 的密码，因此 Codex 不冒充完成真实账号登录；该账号需用户本人刷新页面后重试。

截图：

- [公司账号登录页](login-company-account.png)
- [管理员鉴权后工作台](admin-authenticated-dashboard.png)

## 门禁结果

- 公司安全合同：通过。
- Readdy 主产品类型检查：通过。
- Readdy 主产品 ESLint：通过。
- Readdy 生产构建：通过。
- ZIP 控件门禁：718 个原控件全部覆盖；5 个不安全的假登录/假角色标签被公司真实鉴权控件替换，其他业务控件缺失 0。
- 前端合同测试：通过。
- 交互按钮审计：通过。

## 现场限制

当前真实公司 OAuth 网关已经可以从本机访问，但这只证明地址、跨域和错误返回链路正常，不等于 `100001` 的账号密码已经验证成功。用户本人重试后，若页面显示公司网关返回的明确账号状态信息，应按真实信息联系 IT；不要再把网络故障统一写成密码错误。

正式业务后端 `/zhipin-server/api` 当前没有部署在该网关地址，因此 `5190` 仍是“真实公司登录 + 浏览器演示业务数据”。Apollo、MCP SSO 和三方 Token 的原源码及注入口保持不变，真实密钥没有复制进本隔离仓库。
