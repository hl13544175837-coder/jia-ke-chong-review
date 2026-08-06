# 招聘系统安全加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变人力总监业务权限和 6 位密码规则的前提下，修复已确认的登录限流、下载令牌、AI 出网、并发幂等、AI 面试输入、CSV 公式和错误泄露问题。

**Architecture:** 保持现有 Flask + React/Vite 模块化单体架构，不引入 Redis 或新数据库表。安全规则放在后端确定性代码中：角色显式授权、受信代理解析、请求前幂等占位、AI 出网开关与敏感信息拦截、统一 CSV 单元格保护、统一对外错误文案。

**Tech Stack:** Python 3.12/Flask/SQLAlchemy/Pytest，TypeScript/React/Vite，现有 `apiBlob` 下载客户端。

---

## 文件结构与职责

- `backend/app/services/access_policy.py`：候选人角色权限白名单。
- `backend/app/middleware/rate_limit.py`：受信代理 IP 解析和有界内存限流桶。
- `backend/app/config.py`：代理跳数、限流桶上限、AI 搜索开关、AI 面试限额。
- `backend/app/api/boss.py`：BOSS 下载统一使用请求头鉴权。
- `backend/app/services/agent_service.py`：AI 外部搜索开关、敏感查询阻断、对外错误收口。
- `backend/app/__init__.py`：幂等请求执行前占位和执行后收口。
- `backend/app/api/interview.py`：AI 面试输入验证和接口限流。
- `backend/app/services/csv_security.py`：新建，唯一职责是安全转换 CSV 单元格。
- `backend/app/api/candidate_admin.py`、`backend/app/services/analytics_service.py`：调用统一 CSV 安全函数。
- `backend/app/services/public_errors.py`：新建，唯一职责是生成稳定的公开错误文案。
- `backend/app/api/jobs.py`、`backend/app/services/resume_service.py`、`backend/app/services/resumes/parse_service.py`、`backend/app/services/resumes/version_service.py`、`backend/app/services/candidate_library_read_service.py`：记录详细错误但只公开稳定文案。
- `backend/tests/test_security_candidate_scope.py`：角色显式授权回归测试。
- `backend/tests/test_rate_limit_security.py`：代理 IP 和有界桶测试。
- `backend/tests/test_boss_query_token_security.py`：下载请求头鉴权测试。
- `backend/tests/test_agent_egress_security.py`：AI 出网控制测试。
- `backend/tests/test_idempotency_keys.py`：处理中占位和重放测试。
- `backend/tests/test_interview_loop.py`：在现有真实流程夹具上增加 AI 面试输入边界测试。
- `backend/tests/test_csv_export_security.py`：两个 CSV 出口测试。
- `backend/tests/test_public_error_security.py`：原始异常不出现在响应中的测试。
- `backend/.env.example`、`backend/lightweight-pilot.env.example`、`backend/sit-team-trial.env.example`：新增配置示例，不修改密码规则。

### Task 1: 候选人权限显式授权

**Files:**
- Create: `backend/tests/test_security_candidate_scope.py`
- Modify: `backend/app/services/access_policy.py:67-80`

- [ ] **Step 1: 写失败测试，证明未知角色当前会看到候选人**

```python
from app import db
from app.models import Candidate
from app.services.access_policy import visible_candidate_query


def test_unknown_role_cannot_see_candidate_library(app, make_user):
    unknown_id, _ = make_user("unknown-scope@example.com", role="auditor", org_id=1)
    with app.app_context():
        db.session.add(Candidate(org_id=1, name_masked="不应可见"))
        db.session.commit()
        assert visible_candidate_query(unknown_id, "auditor").count() == 0


def test_hr_director_explicitly_sees_same_org_candidates(app, make_user):
    director_id, _ = make_user("director-scope@example.com", role="hr_director", org_id=1)
    with app.app_context():
        db.session.add_all([
            Candidate(org_id=1, name_masked="本组织候选人"),
            Candidate(org_id=2, name_masked="其他组织候选人"),
        ])
        db.session.commit()
        names = {row.name_masked for row in visible_candidate_query(director_id, "hr_director").all()}
        assert names == {"本组织候选人"}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cd backend && pytest -q tests/test_security_candidate_scope.py`

Expected: `test_unknown_role_cannot_see_candidate_library` 失败，因为当前默认返回全组织查询。

- [ ] **Step 3: 写最小实现，显式允许高权限角色，其余默认空结果**

```python
def visible_candidate_query(user_id, role):
    org_id = actor_org_id(user_id)
    query = active_candidate_query().filter(Candidate.org_id == org_id)
    if role in {"admin", "manager", "hr_director"}:
        return query
    if role == "recruiter":
        return query.filter(
            db.or_(Candidate.owner_hr_id == user_id, Candidate.owner_hr_id.is_(None))
        )
    if role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(user_id)
        return query.filter(Candidate.id.in_(assigned_ids or [-1]))
    return query.filter(db.false())
```

- [ ] **Step 4: 运行目标测试和候选人权限相关测试**

Run: `cd backend && pytest -q tests/test_security_candidate_scope.py tests/test_demand_scope_permissions.py tests/test_production_org_access_hardening.py`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/access_policy.py backend/tests/test_security_candidate_scope.py
git commit -m "fix: make candidate scope roles explicit"
```

### Task 2: 登录限流使用受信代理并限制内存

**Files:**
- Create: `backend/tests/test_rate_limit_security.py`
- Modify: `backend/app/middleware/rate_limit.py:1-55`
- Modify: `backend/app/config.py:87-94`
- Modify: `backend/.env.example`
- Modify: `backend/lightweight-pilot.env.example`
- Modify: `backend/sit-team-trial.env.example`

- [ ] **Step 1: 写失败测试**

```python
from app.middleware import rate_limit as limiter


def test_forwarded_for_is_ignored_without_trusted_proxy(app):
    app.config["TRUST_PROXY_HOPS"] = 0
    with app.test_request_context(
        "/", headers={"X-Forwarded-For": "198.51.100.9"},
        environ_base={"REMOTE_ADDR": "203.0.113.20"},
    ):
        assert limiter._client_ip() == "203.0.113.20"


def test_one_trusted_proxy_resolves_client_from_right(app):
    app.config["TRUST_PROXY_HOPS"] = 1
    with app.test_request_context(
        "/", headers={"X-Forwarded-For": "198.51.100.9"},
        environ_base={"REMOTE_ADDR": "10.0.0.10"},
    ):
        assert limiter._client_ip() == "198.51.100.9"


def test_bucket_store_never_exceeds_configured_limit(app):
    limiter._reset_rate_limit_state()
    app.config.update(RATE_LIMIT_BUCKET_MAX=2, TRUST_PROXY_HOPS=0)
    for address in ("203.0.113.1", "203.0.113.2", "203.0.113.3"):
        with app.test_request_context("/", environ_base={"REMOTE_ADDR": address}):
            limiter._record_attempt("auth.login", now=1.0, limit=10, window=60)
    assert limiter._bucket_count() == 2
```

- [ ] **Step 2: 运行并确认 RED**

Run: `cd backend && pytest -q tests/test_rate_limit_security.py`

Expected: 代理头测试失败，状态辅助函数不存在。

- [ ] **Step 3: 实现有界、加锁的限流状态**

```python
from collections import OrderedDict, deque
from threading import Lock

_buckets = OrderedDict()
_bucket_lock = Lock()


def _client_ip():
    remote = request.remote_addr or "unknown"
    hops = max(0, int(current_app.config.get("TRUST_PROXY_HOPS", 0) or 0))
    if hops == 0:
        return remote
    forwarded = [item.strip() for item in request.headers.get("X-Forwarded-For", "").split(",") if item.strip()]
    chain = forwarded + [remote]
    return chain[-(hops + 1)] if len(chain) > hops else remote


def _record_attempt(name, *, now, limit, window):
    key = f"{name}:{_client_ip()}"
    maximum = max(1, int(current_app.config.get("RATE_LIMIT_BUCKET_MAX", 10000)))
    with _bucket_lock:
        bucket = _buckets.get(key)
        if bucket is None:
            while len(_buckets) >= maximum:
                _buckets.popitem(last=False)
            bucket = deque()
            _buckets[key] = bucket
        _buckets.move_to_end(key)
        while bucket and now - bucket[0] >= window:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window - (now - bucket[0])))
            return True, retry_after
        else:
            bucket.append(now)
            return False, 0
```

`rate_limit()` 调用 `_record_attempt`，并根据返回的 `blocked, retry_after` 生成 429。增加只供测试和进程生命周期使用的 `_reset_rate_limit_state()`、`_bucket_count()`。

- [ ] **Step 4: 增加配置**

```python
TRUST_PROXY_HOPS = int(os.environ.get("TRUST_PROXY_HOPS", "0"))
RATE_LIMIT_BUCKET_MAX = int(os.environ.get("RATE_LIMIT_BUCKET_MAX", "10000"))
```

Nginx 部署示例写入 `TRUST_PROXY_HOPS=1`；普通本地开发保持 `0`。

- [ ] **Step 5: 运行限流和部署配置测试**

Run: `cd backend && pytest -q tests/test_rate_limit_security.py tests/test_pilot_hardening.py tests/test_deployment_artifacts.py tests/test_config_validation.py`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add backend/app/middleware/rate_limit.py backend/app/config.py backend/.env.example backend/lightweight-pilot.env.example backend/sit-team-trial.env.example backend/tests/test_rate_limit_security.py
git commit -m "fix: harden application rate limiting"
```

### Task 3: 下载接口移除查询参数令牌

**Files:**
- Modify: `backend/tests/test_boss_query_token_security.py`
- Modify: `backend/app/api/boss.py:28-44,195-214,363-372`

- [ ] **Step 1: 将现有测试改成目标行为并确认失败**

```python
def test_boss_download_rejects_token_in_query(client, make_user):
    _, token = make_user("boss-query-rejected@example.com", role="recruiter")
    response = client.get(f"/api/boss/extension/download?token={token}")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing token"


def test_boss_download_accepts_authorization_header(client, make_user):
    _, token = make_user("boss-header@example.com", role="recruiter", org_id=2)
    response = client.get(
        "/api/boss/extension/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
```

Run: `cd backend && pytest -q tests/test_boss_query_token_security.py`

Expected: 查询参数测试当前返回 200，因此失败；请求头测试当前返回 Missing token，因此失败。

- [ ] **Step 2: 删除 `_require_query_token`，使用现有装饰器**

```python
@bp.get("/boss/candidates/<encrypt_geek_id>/resume/download")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_candidate_resume_download(encrypt_geek_id: str):
    ...


@bp.get("/boss/extension/download")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_extension_download():
    ...
```

删除注释中的 `?token=` 用法。当前仓库没有调用这两个接口的前端页面；后续接入时必须复用 `apiBlob()`，不得恢复 URL 令牌。

- [ ] **Step 3: 运行 BOSS 路由测试**

Run: `cd backend && pytest -q tests/test_boss_query_token_security.py tests/test_boss_route_registration.py tests/test_demand_escape_hatches.py`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/boss.py backend/tests/test_boss_query_token_security.py
git commit -m "fix: remove jwt tokens from boss download urls"
```

### Task 4: AI 外部搜索默认关闭并阻断敏感查询

**Files:**
- Create: `backend/tests/test_agent_egress_security.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/services/agent_service.py:320-372`
- Modify: `backend/.env.example`
- Modify: `backend/lightweight-pilot.env.example`
- Modify: `backend/sit-team-trial.env.example`

- [ ] **Step 1: 写失败测试**

```python
from app.services.agent_service import _tool_web_search


def test_web_search_is_disabled_by_default(app):
    app.config["AGENT_WEB_SEARCH_ENABLED"] = False
    with app.app_context():
        assert _tool_web_search("上海 Java 薪资趋势")["error"] == "联网搜索未启用"


def test_web_search_blocks_candidate_pii_when_enabled(app):
    app.config["AGENT_WEB_SEARCH_ENABLED"] = True
    with app.app_context():
        result = _tool_web_search("候选人张三 手机号 13800138000")
    assert result["error"] == "搜索内容包含招聘隐私信息，已阻止发送到外部服务"
```

Run: `cd backend && pytest -q tests/test_agent_egress_security.py`

Expected: 第一个测试会继续查找 CLI，第二个测试不会阻止敏感查询。

- [ ] **Step 2: 增加配置和确定性拦截函数**

```python
AGENT_WEB_SEARCH_ENABLED = os.environ.get(
    "AGENT_WEB_SEARCH_ENABLED", "false"
).lower() == "true"
```

```python
_SEARCH_PII_PATTERNS = (
    re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
    re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)"),
    re.compile(r"\b(?:token|jwt|cookie|password|secret)\s*[:=]", re.I),
)
_RECRUITING_PRIVATE_MARKERS = ("候选人", "简历原文", "面试评价", "身份证", "手机号", "私人邮箱")


def _web_search_is_sensitive(query):
    return any(pattern.search(query) for pattern in _SEARCH_PII_PATTERNS) or any(
        marker in query for marker in _RECRUITING_PRIVATE_MARKERS
    )
```

`_tool_web_search` 在任何子进程执行前先检查开关和敏感信息，返回固定错误。

- [ ] **Step 3: 运行 AI 对话和调用日志测试**

Run: `cd backend && pytest -q tests/test_agent_egress_security.py tests/test_agent_conversations.py tests/test_agent_call_logs.py`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/config.py backend/app/services/agent_service.py backend/.env.example backend/lightweight-pilot.env.example backend/sit-team-trial.env.example backend/tests/test_agent_egress_security.py
git commit -m "fix: gate external ai search egress"
```

### Task 5: 用请求前占位修复幂等并发时间差

**Files:**
- Modify: `backend/tests/test_idempotency_keys.py`
- Modify: `backend/app/__init__.py:185-278`

- [ ] **Step 1: 写处理中占位测试**

```python
import hashlib


def test_pending_idempotency_record_blocks_duplicate(client, make_user, app):
    user_id, token = make_user("idem-pending@example.com", role="admin")
    key = "create-user:pending"
    body = b'{"email":"pending@example.com","name":"Pending","password":"pw123456","role":"recruiter"}'
    scope_key = hashlib.sha256(f"user:{user_id}:POST:/api/admin/users:{key}".encode()).hexdigest()
    with app.app_context():
        from app import db
        from app.models import IdempotencyRecord
        db.session.add(IdempotencyRecord(
            scope_key=scope_key, idempotency_key=key, actor_scope=f"user:{user_id}",
            method="POST", path="/api/admin/users", body_hash=hashlib.sha256(body).hexdigest(),
            status_code=102, response_json={"status": "processing"},
        ))
        db.session.commit()
    response = client.post(
        "/api/admin/users", data=body, content_type="application/json",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": key},
    )
    assert response.status_code == 409
    assert response.get_json()["code"] == "idempotency_in_progress"
```

Run: `cd backend && pytest -q tests/test_idempotency_keys.py::test_pending_idempotency_record_blocks_duplicate`

Expected: 当前把占位内容当成最终响应并返回 102，因此失败。

- [ ] **Step 2: 在业务执行前原子创建占位记录**

在 `before_request` 中：

```python
if record is not None:
    if record.status_code == 102:
        return jsonify({"error": "相同请求正在处理中", "code": "idempotency_in_progress"}), 409
    ...  # 保留现有重放逻辑

reservation = IdempotencyRecord(
    **g.idempotency_context,
    status_code=102,
    response_json={"status": "processing"},
)
try:
    db.session.add(reservation)
    db.session.commit()
    g.idempotency_reserved = True
except IntegrityError:
    db.session.rollback()
    return jsonify({"error": "相同请求正在处理中", "code": "idempotency_in_progress"}), 409
```

构造 `IdempotencyRecord` 时只传模型真实字段，不把 `scope_key` 之外的临时键直接展开。

- [ ] **Step 3: 成功更新占位，失败删除占位**

在 `after_request` 中：成功 JSON 响应更新同一记录的 `status_code` 和 `response_json`；非 2xx 或非 JSON 响应删除当前请求创建的 102 占位并提交。保留原有 body hash 冲突和鉴权优先行为。

- [ ] **Step 4: 运行幂等和核心写操作测试**

Run: `cd backend && pytest -q tests/test_idempotency_keys.py tests/test_demand_p0_contract.py tests/test_offer_lifecycle.py`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add backend/app/__init__.py backend/tests/test_idempotency_keys.py
git commit -m "fix: reserve idempotency keys before writes"
```

### Task 6: AI 面试输入边界和调用频率

**Files:**
- Modify: `backend/tests/test_interview_loop.py`
- Modify: `backend/app/api/interview.py:500-532`
- Modify: `backend/app/config.py:88-94`
- Modify: `backend/.env.example`
- Modify: `backend/lightweight-pilot.env.example`
- Modify: `backend/sit-team-trial.env.example`

- [ ] **Step 1: 写失败测试**

```python
import pytest


@pytest.mark.parametrize("qa_pairs", ["bad", [{}], [{"q": 1, "a": "回答"}]])
def test_interview_submit_rejects_malformed_pairs(client, make_user, app, qa_pairs):
    owner_id, token = make_user("interview-input@example.com", role="recruiter")
    job_id, candidate_id = _seed(app, owner_id)
    response = client.post(
        "/api/interview/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"candidate_id": candidate_id, "job_id": job_id, "qa_pairs": qa_pairs},
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_qa_pairs"


def test_interview_submit_rejects_too_many_pairs(client, make_user, app):
    owner_id, token = make_user("interview-input-many@example.com", role="recruiter")
    job_id, candidate_id = _seed(app, owner_id)
    response = client.post(
        "/api/interview/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={"candidate_id": candidate_id, "job_id": job_id,
              "qa_pairs": [{"q": "问题", "a": "回答"}] * 21},
    )
    assert response.status_code == 400
```

Run: `cd backend && pytest -q tests/test_interview_loop.py -k 'malformed_pairs or too_many_pairs'`

Expected: 字符串输入触发异常或错误处理不一致，超数量输入被接受。

- [ ] **Step 2: 增加验证函数和限流装饰器**

```python
def _validated_qa_pairs(value):
    if not isinstance(value, list) or not value or len(value) > 20:
        raise ValueError("invalid_qa_pairs")
    result = []
    total = 0
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("q"), str) or not isinstance(item.get("a"), str):
            raise ValueError("invalid_qa_pairs")
        question = item["q"].strip()
        answer = item["a"].strip()
        if not question or not answer or len(question) > 1000 or len(answer) > 5000:
            raise ValueError("invalid_qa_pairs")
        total += len(question) + len(answer)
        if total > 30000:
            raise ValueError("invalid_qa_pairs")
        result.append((question, answer))
    return result
```

```python
@bp.post("/interview/submit")
@require_auth
@rate_limit("interview.submit")
def submit_interview():
    ...
```

配置增加 `RATE_LIMIT_INTERVIEW_SUBMIT`，默认每分钟 10 次。

- [ ] **Step 3: 运行面试流程和限流测试**

Run: `cd backend && pytest -q tests/test_interview_loop.py tests/test_demand_interview_rounds.py tests/test_production_org_access_hardening.py`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/interview.py backend/app/config.py backend/.env.example backend/lightweight-pilot.env.example backend/sit-team-trial.env.example backend/tests/test_interview_loop.py
git commit -m "fix: bound ai interview submissions"
```

### Task 7: 两个 CSV 出口统一防公式

**Files:**
- Create: `backend/app/services/csv_security.py`
- Create: `backend/tests/test_csv_export_security.py`
- Modify: `backend/app/api/candidate_admin.py:88-107`
- Modify: `backend/app/services/analytics_service.py:407-416`

- [ ] **Step 1: 写失败的单元测试和出口测试**

```python
import pytest
import csv
import io
from app.services.csv_security import safe_csv_cell


@pytest.mark.parametrize("value", ["=1+1", "+SUM(A1:A2)", "-1+2", "@cmd"])
def test_safe_csv_cell_neutralizes_formula_markers(value):
    assert safe_csv_cell(value).startswith("'")


def test_safe_csv_cell_keeps_normal_values():
    assert safe_csv_cell("Java 工程师") == "Java 工程师"
    assert safe_csv_cell(12) == 12


def test_candidate_export_neutralizes_formula(client, make_user, app):
    owner_id, token = make_user("csv-owner@example.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate
        candidate = Candidate(org_id=1, owner_hr_id=owner_id, name_masked="=1+1")
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id
    response = client.get(
        f"/api/candidates/{candidate_id}/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    rows = list(csv.reader(io.StringIO(response.get_data(as_text=True))))
    assert rows[1][1] == "'=1+1"


def test_analytics_csv_neutralizes_formula():
    from app.services.analytics_service import analytics_csv
    payload = {"demands": [{
        "request_no": "=1+1", "title": "+SUM(A1:A2)", "department": "@cmd",
        "headcount": 1, "onboarded": 0, "in_progress": 1, "remaining": 0,
    }]}
    rows = list(csv.reader(io.StringIO(analytics_csv(payload))))
    assert rows[1][:3] == ["'=1+1", "'+SUM(A1:A2)", "'@cmd"]
```

Run: `cd backend && pytest -q tests/test_csv_export_security.py`

Expected: 导入模块不存在或出口仍输出原始公式。

- [ ] **Step 2: 实现统一安全函数**

```python
FORMULA_PREFIXES = ("=", "+", "-", "@")


def safe_csv_cell(value):
    if not isinstance(value, str):
        return value
    cleaned = value.lstrip("\t\r\n")
    if cleaned.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value
```

两个 CSV writer 的所有文本字段均先调用 `safe_csv_cell`，数字字段保持数字。

- [ ] **Step 3: 运行 CSV、分析和审计测试**

Run: `cd backend && pytest -q tests/test_csv_export_security.py tests/test_analytics_truth.py tests/test_audit_trail_pilot.py tests/test_business_review_resume_access.py`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add backend/app/services/csv_security.py backend/app/api/candidate_admin.py backend/app/services/analytics_service.py backend/tests/test_csv_export_security.py
git commit -m "fix: neutralize spreadsheet formulas in csv exports"
```

### Task 8: 对外错误信息统一收口

**Files:**
- Create: `backend/app/services/public_errors.py`
- Create: `backend/tests/test_public_error_security.py`
- Modify: `backend/app/api/jobs.py:73-105`
- Modify: `backend/app/services/agent_service.py:368-372,820-828`
- Modify: `backend/app/services/resume_service.py:95-105,129-135,161-179`
- Modify: `backend/app/services/resumes/parse_service.py:220-240`
- Modify: `backend/app/services/resumes/version_service.py:37-43`
- Modify: `backend/app/services/candidate_library_read_service.py:181-187`

- [ ] **Step 1: 写失败测试**

```python
def test_job_clarify_does_not_return_internal_exception(client, make_user, monkeypatch):
    _, token = make_user("error-mask@example.com", role="recruiter")
    monkeypatch.setattr("llm_client.LLMClient.chat", lambda *_: (_ for _ in ()).throw(
        RuntimeError("/srv/private/config token=secret-value")
    ))
    response = client.post(
        "/api/jobs/clarify",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "测试", "jd_text": "测试 JD"},
    )
    assert response.status_code == 200
    assert response.get_json()["warning"] == "澄清生成暂时不可用，可直接保存职位信息"
    assert "secret-value" not in response.get_data(as_text=True)


def test_public_resume_error_hides_raw_parser_detail(app):
    from types import SimpleNamespace
    from app.services.resumes.version_service import _public_parse_error
    candidate = SimpleNamespace(parse_status="failed", parse_error="/srv/private/file.pdf api_key=secret")
    with app.app_context():
        assert _public_parse_error(candidate) == "简历解析失败，请重试或人工补录"
```

Run: `cd backend && pytest -q tests/test_public_error_security.py`

Expected: 响应包含原始异常文本。

- [ ] **Step 2: 新增稳定公开文案**

```python
PUBLIC_RESUME_PARSE_ERROR = "简历解析失败，请重试或人工补录"
PUBLIC_AI_TOOL_ERROR = "AI 服务暂时不可用，请稍后重试"


def public_resume_parse_error(status, value):
    raw = str(value or "")
    if status in {"pending", "processing"} and raw.startswith(("queued:", "worker:")):
        return None
    return PUBLIC_RESUME_PARSE_ERROR if raw else None
```

内部捕获异常时使用 `logger.exception(...)` 保存详细堆栈；数据库 `parse_error` 保存稳定错误代码或公开文案，不保存 `str(exception)`。AI 和 SSE 返回固定文案。

- [ ] **Step 3: 更新现有恢复流程测试的预期值**

只调整原本明确断言原始解析异常的测试，使其断言稳定公开文案；队列标记、测试环境禁用 AI 的业务提示继续保留，不全部抹成同一句话。

- [ ] **Step 4: 运行错误、简历恢复和 AI 测试**

Run: `cd backend && pytest -q tests/test_public_error_security.py tests/test_resume_parse_retry.py tests/test_resume_recovery_workflow.py tests/test_async_resume_parsing.py tests/test_resume_ai_disabled_trial.py tests/test_agent_conversations.py tests/test_agent_call_logs.py`

Expected: 全部通过，响应中没有测试注入的内部路径和密钥字样。

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/public_errors.py backend/app/api/jobs.py backend/app/services/agent_service.py backend/app/services/resume_service.py backend/app/services/resumes/parse_service.py backend/app/services/resumes/version_service.py backend/app/services/candidate_library_read_service.py backend/tests/test_public_error_security.py backend/tests/test_resume_parse_retry.py backend/tests/test_resume_recovery_workflow.py
git commit -m "fix: hide internal errors from user responses"
```

### Task 9: 完整验证与交付

**Files:**
- Verify only; do not modify password policy files unless a regression test proves an accidental change.

- [ ] **Step 1: 确认密码规则没有变化**

Run: `git diff a3bd7ab..HEAD -- backend/app/api/admin.py backend/app/api/auth.py readdy-frontend/src/pages/settings/page.tsx`

Expected: 没有密码长度相关改动。

- [ ] **Step 2: 运行本轮新增安全测试**

Run:

```bash
cd backend
pytest -q \
  tests/test_security_candidate_scope.py \
  tests/test_rate_limit_security.py \
  tests/test_boss_query_token_security.py \
  tests/test_agent_egress_security.py \
  tests/test_idempotency_keys.py \
  tests/test_interview_loop.py \
  tests/test_csv_export_security.py \
  tests/test_public_error_security.py
```

Expected: 0 failures。

- [ ] **Step 3: 运行后端完整测试**

Run: `cd backend && pytest -q`

Expected: 0 failures；记录通过数量和耗时。

- [ ] **Step 4: 运行前端测试、类型检查和生产构建**

Run:

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run build
```

Expected: 三条命令退出码均为 0。

- [ ] **Step 5: 运行依赖安全检查**

Run:

```bash
cd backend && python3 -m pip_audit -r requirements.txt
cd ../readdy-frontend && npm audit --omit=dev
```

Expected: Python 无已知漏洞；React Router 的现有 RSC 预警若仍存在，明确记录为未在本轮升级，不能宣称依赖扫描全绿。

- [ ] **Step 6: 检查差异范围**

Run: `git status --short && git diff --check && git diff a3bd7ab..HEAD --stat`

Expected: 没有空白错误；用户原有 `docs/verification/2026-08-04-requirements-summary/` 不进入任何提交。

- [ ] **Step 7: 输出大白话交付报告**

报告逐项说明：人力总监权限仍保留；2–8 项分别改了什么；密码规则未动；实际测试数量；仍存在的 React Router 依赖预警；没有修改用户无关文件。
