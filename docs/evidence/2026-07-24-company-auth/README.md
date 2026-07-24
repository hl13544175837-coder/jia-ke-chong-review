# 5190 公司登录鉴权修复验收

验收时间：`2026-07-24 11:23 +0800`

## 根因

公司原 `frontend` 的 OAuth、Token、工号、权限、Apollo 和三方 Token 源码没有被删除。真正问题是 `5190` 主产品使用了 Readdy 的定时器假登录和浏览器假角色切换，启动脚本同时强制关闭 Apollo、覆盖 JWT 并清空模型密钥，主入口因此绕过公司已经调好的安全链路。

## 修复范围

- `5190` 登录改为公司既定流程：账号密码前端 MD5、网关 OAuth、Bearer Token、profile 工号、`/auth/me` 真实角色。
- 沿用 `hireinsight_token`、`hireinsight_emp_code`、`X-Emp-Code` 和 `clientId=zhipin`。
- 业务路由增加登录守卫和真实角色守卫。
- 删除 Readdy 假角色切换，账号菜单提供权限重载和真实退出登录。
- `5190` 默认代理公司测试网关；本地 OAuth 桥只用于自动化验收。
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
  -> GET /api/auth/me
  -> 真实用户和角色
  -> POST queryCurrentUserMenu?clientId=zhipin
```

结果：

- 登录前自动进入 `/login`，显示“公司账号”和“工号 / 账号”。
- 管理员登录后 Token 存在、工号为 `admin01`、角色为 `admin`，Token 不出现在 URL。
- 假角色 localStorage 键不存在，“切换角色”入口不存在。
- 退出登录后 Token、工号和角色全部清除并返回 `/login`。
- 管理员可以访问设置。
- 经理访问设置、招聘专员访问管理驾驶舱、面试官访问全量简历库时均显示无权访问。
- 四角色页面控制台错误均为 0。

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

当前执行环境连接 `https://test-pgsgw.yimidida.com` 时 TLS 握手失败，因此不能把本地模拟网关通过表述为公司 SIT 现场通过。代码默认已切回公司测试网关；最终公司账号现场登录需要在可访问公司网关的网络中完成。
