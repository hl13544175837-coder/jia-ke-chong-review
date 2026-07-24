# 新 Codex 窗口提示词

```text
请接手这个已完成并正在运行的独立智聘项目：/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app。第一步完整阅读 docs/CODEX_HANDOFF_CONTEXT.md、docs/evidence/2026-07-24-company-auth/README.md、docs/PRODUCT_INTERACTION_GUIDE.md 和 docs/ISOLATED_CLEANUP.md；只允许操作 /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724，不得影响其他项目。先运行 git status --short --branch 和 ./scripts/check-isolated-demo.sh；若服务已健康就不要重启，若未启动才运行 ./scripts/start-isolated-demo.sh。最终验收主产品是 http://127.0.0.1:5190，必须使用公司账号和密码走公司网关 OAuth；接口与图片简历参考版是 http://127.0.0.1:5192。默认使用 Tabbit，不要打开 Google Chrome。公司原 LoginPage、gatewayAuth、auth、api、permissions、Apollo 和三方 Token 文件是冻结区，frontend/tests/readdy_company_security_contract.test.mjs 保存其哈希，禁止静默修改；5190 已接回 MD5 密码、Bearer Token、X-Emp-Code、/auth/me、clientId=zhipin 和真实角色守卫。原 Readdy ZIP 的 718 个控件仍全部覆盖，只有 5 个不安全的假登录/假角色标签被真实鉴权控件替换。其他业务 API 暂保留接入位置；除非我明确要求，不要自行接生产接口、改密钥、push、merge、部署或删除。完成检查后先用大白话向我报告当前状态，再等待新任务。
```
