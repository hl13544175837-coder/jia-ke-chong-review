#!/usr/bin/env bash
# 前端构建链路一键诊断：按序执行各门禁，第一步失败即停止并输出常见原因。
# 用法：bash scripts/diagnose-build.sh
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_DIR/readdy-frontend"

step() { printf '\n[%s]\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
fail() { printf '\n[✗ 中止] %s\n' "$1" >&2; exit 1; }

# ── 1. Node 版本（对照 engines: >=20.19.0 <21 || >=22.12.0）──────────────
step "Node 版本"
command -v node >/dev/null 2>&1 || fail "找不到 node；请先安装 Node（>=20.19.0 或 >=22.12.0）。"
node -v
npm -v
node_ok=0
node -e 'const v = process.version.slice(1); const ok = (v >= "20.19.0" && v < "21.0.0") || v >= "22.12.0"; process.exit(ok ? 0 : 1);' || node_ok=$?
if [[ "$node_ok" -ne 0 ]]; then
  fail "Node $(node -v) 不符合 engines（需要 >=20.19.0 <21 或 >=22.12.0）。常见：nvm 停在 20.18 / 21.x。请切换版本后重试：nvm use 22（或 20.19+）。"
fi
ok "Node $(node -v) 符合 engines"

# ── 2. 依赖目录 ─────────────────────────────────────────────────────────
step "依赖"
[[ -d "$FRONTEND_DIR/node_modules" ]] || fail "readdy-frontend 缺少 node_modules；请先运行：cd readdy-frontend && npm ci"
ok "node_modules 存在"

# ── 3. 类型检查 ─────────────────────────────────────────────────────────
step "type-check（npm run type-check = tsc -p tsconfig.app.json）"
( cd "$FRONTEND_DIR" && npm run type-check ) || fail \
"type-check 失败，上面是具体报错。最常见原因：
  · 写了 enum/namespace/构造参数属性 —— tsconfig 开了 erasableSyntaxOnly，必须改用字符串联合类型（项目规范）。
  · import 了不存在的模块/路径。
  · 注意：vite build 能过不代表 type-check 能过。"
ok "type-check 通过"

# ── 4. Lint ─────────────────────────────────────────────────────────────
step "lint（npm run lint，--max-warnings 0：任何 warning 都算失败）"
( cd "$FRONTEND_DIR" && npm run lint ) || fail \
"lint 失败，上面是具体报错。最常见原因：
  · react-refresh/only-export-components：在 .tsx 组件文件里导出了非组件（工具函数/对象/变量）——把非组件导出挪到 .ts 文件。
  · router/config.tsx：新路由 element 写成组件引用（element: Page）而不是 JSX（element: <Page />）。
  · unused eslint-disable 注释（--report-unused-disable-directives）——删掉不再需要的禁用注释。"
ok "lint 通过"

# ── 5. 正式构建 ─────────────────────────────────────────────────────────
step "build（npm run build = vite build）"
( cd "$FRONTEND_DIR" && npm run build ) || fail \
"vite 构建失败，上面是具体报错。最常见原因：
  · JSX/TS 语法错误、引用了不存在的模块或 CSS 资源。
  · 内存不足（EJS 堆栈报错）时可用：NODE_OPTIONS=--max-old-space-size=4096 npm run build。
  · node_modules 损坏时：rm -rf node_modules && npm ci 后重试。"
ok "build 通过"

# ── 6. 包体积门禁 ───────────────────────────────────────────────────────
step "包体积门禁（入口 ≤360KB / 最大路由分包 ≤130KB）"
node "$SCRIPT_DIR/check-frontend-bundle-budget.mjs" || fail \
"包体积超限。新页面请走 lazy(() => import(...)) 懒加载，重依赖单独分包；不要把大代码塞进 main 入口。"
ok "包体积通过"

# ── 7. 工作区状态提示 ───────────────────────────────────────────────────
step "工作区状态（提示，不阻止）"
if ( cd "$PROJECT_DIR" && ! git diff --quiet ) || ( cd "$PROJECT_DIR" && ! git diff --cached --quiet ); then
  printf '  ⚠  工作区有未提交改动。\n'
  printf '      · 本地 npm run build 不受影响。\n'
  printf '      · 如果你想跑的是发布总门禁 scripts/check-sit-release.sh，它要求工作区干净（改完必须先 git commit），否则必挂。\n'
else
  ok "工作区干净"
fi

printf '\n✅ 构建链路全部通过。\n'
printf '如果这个脚本全部通过但你的构建还是挂，请把报错原文贴回来，我可以直接定位修复。\n'