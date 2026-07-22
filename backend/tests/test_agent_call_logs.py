from app import db
from app import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_agent_chat_records_success_and_failure_with_redaction(
    app,
    client,
    make_user,
    monkeypatch,
):
    user_id, token = make_user(
        "agent-log-chat@example.com",
        role="recruiter",
        org_id=9,
    )

    class SuccessAgent:
        answer_route = {"model": "fake-chat-model"}

        def run_stream(self, message, history, user_id=None, role=None):
            yield {"type": "thought", "text": "password=thought-secret"}
            yield {
                "type": "tool_call",
                "tool": "list_candidates",
                "args": {"password": "tool-secret", "query": "safe"},
            }
            yield {
                "type": "tool_result",
                "tool": "list_candidates",
                "result": {"access_token": "result-secret", "count": 1},
            }
            yield {
                "type": "done",
                "answer": "token=output-secret " + ("x" * 5000),
            }

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: SuccessAgent())
    success_response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={
            "message": "Authorization: Bearer input-super-secret " + ("q" * 5000),
            "history": [],
        },
    )
    assert success_response.status_code == 200
    success_response.get_data(as_text=True)

    class FailureAgent:
        answer_route = {"model": "fake-failure-model"}

        def run_stream(self, *args, **kwargs):
            yield {"type": "thought", "text": "before failure"}
            raise RuntimeError(
                '{"api_key":"failure-secret","姓名":"赵六",'
                '"mobile":"13600136000","email":"failure@example.com",'
                '"身份证":"110105194912310033","薪资":"60k"}'
            )

    monkeypatch.setattr(agent_api, "_get_agent", lambda: FailureAgent())
    failure_response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "触发失败", "history": []},
    )
    assert failure_response.status_code == 200
    failure_stream = failure_response.get_data(as_text=True)
    assert "failure-secret" not in failure_stream
    assert "智能体执行出错，请稍后重试" in failure_stream

    with app.app_context():
        logs = models.AgentCallLog.query.order_by(models.AgentCallLog.id.asc()).all()
        assert len(logs) == 2
        success, failure = logs

        assert success.org_id == 9
        assert success.user_id == user_id
        assert success.role == "recruiter"
        assert success.kind == "chat"
        assert success.model == "fake-chat-model"
        assert success.status == "ok"
        assert success.duration_ms is not None and success.duration_ms >= 0
        assert success.prompt_tokens is None
        assert success.completion_tokens is None
        assert success.conversation_id is not None
        assert success.message_id is not None
        assert success.input_text is None
        assert success.output_text is None
        assert success.thoughts is None
        assert "tool-secret" not in str(success.tool_calls)
        assert "result-secret" not in str(success.tool_calls)
        assert success.tool_calls == [{
            "tool": "list_candidates",
            "target_ids": {},
            "count": 1,
            "ok": True,
        }]

        assert failure.org_id == 9
        assert failure.kind == "chat"
        assert failure.model == "fake-failure-model"
        assert failure.status == "error"
        assert failure.duration_ms is not None and failure.duration_ms >= 0
        assert failure.error_msg
        assert failure.input_text is None
        assert failure.output_text is None
        assert failure.thoughts is None
        for private_value in (
            "failure-secret",
            "赵六",
            "13600136000",
            "failure@example.com",
            "110105194912310033",
            "60k",
        ):
            assert private_value not in failure.error_msg
        assert failure.error_msg == "internal:RuntimeError"


def test_agent_call_log_redacts_json_strings_and_recruiting_pii(
    app,
    client,
    make_user,
    monkeypatch,
):
    _, token = make_user("agent-log-pii@example.com", role="recruiter", org_id=8)
    json_pii = (
        '{"password":"json-secret","name":"张三","phone":"13800138000",'
        '"email":"alice@example.com","id_card":"11010519491231002X",'
        '"salary":"30k"}'
    )

    class PiiAgent:
        def run_stream(self, message, history, user_id=None, role=None):
            yield {"type": "thought", "text": json_pii}
            yield {
                "type": "tool_call",
                "tool": "姓名张三<script>",
                "args": {
                    "姓名": "李四",
                    "mobile": "13900139000",
                    "compensation": "50k",
                },
            }
            yield {
                "type": "done",
                "answer": (
                    "姓名：王五 手机号：13700137000 邮箱：bob@example.com "
                    "身份证：110105194912310011 薪酬：40k"
                ),
            }

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: PiiAgent())
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": json_pii},
    )
    assert response.status_code == 200
    response.get_data(as_text=True)

    with app.app_context():
        log = models.AgentCallLog.query.one()
        combined = " ".join(
            str(value)
            for value in (
                log.input_text,
                log.output_text,
                log.error_msg,
                log.tool_calls,
                log.thoughts,
            )
        )
        for private_value in (
            "json-secret",
            "张三",
            "13800138000",
            "alice@example.com",
            "11010519491231002X",
            "30k",
            "李四",
            "13900139000",
            "50k",
            "王五",
            "13700137000",
            "bob@example.com",
            "110105194912310011",
            "40k",
        ):
            assert private_value not in combined
        assert "姓名张三<script>" not in combined
        assert log.tool_calls == [{"tool": "unknown", "target_ids": {}}]


def test_agent_execute_records_success_failure_and_validation_errors(
    app,
    client,
    make_user,
    monkeypatch,
):
    user_id, token = make_user(
        "agent-log-execute@example.com",
        role="manager",
        org_id=4,
    )
    from app.api import agent as agent_api

    monkeypatch.setattr(
        agent_api,
        "execute_write_tool",
        lambda tool, args, user_id, role, commit=False: {
            "ok": True,
            "result": {"access_token": "response-secret", "saved": True},
        },
    )
    success_response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={
            "tool": "run_match",
            "args": {"password": "request-secret", "job_id": 12},
        },
    )
    assert success_response.status_code == 200

    monkeypatch.setattr(
        agent_api,
        "execute_write_tool",
        lambda tool, args, user_id, role, commit=False: {
            "ok": False,
            "error": "token=failure-response-secret",
        },
    )
    failure_response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "run_match", "args": {"api_key": "failure-request-secret"}},
    )
    assert failure_response.status_code == 400

    validation_response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"args": {"refresh_token": "validation-secret"}},
    )
    assert validation_response.status_code == 400

    with app.app_context():
        logs = models.AgentCallLog.query.order_by(models.AgentCallLog.id.asc()).all()
        assert [log.status for log in logs] == ["ok", "error", "error"]
        assert all(log.org_id == 4 for log in logs)
        assert all(log.user_id == user_id for log in logs)
        assert all(log.role == "manager" for log in logs)
        assert all(log.kind == "tool_write" for log in logs)
        assert all(log.duration_ms is not None for log in logs)
        assert all(log.input_text is None for log in logs)
        assert all(log.output_text is None for log in logs)
        assert all(log.thoughts is None for log in logs)
        combined = " ".join(
            str(value)
            for log in logs
            for value in (log.input_text, log.output_text, log.error_msg, log.tool_calls)
        )
        for secret in (
            "request-secret",
            "response-secret",
            "failure-request-secret",
            "failure-response-secret",
            "validation-secret",
        ):
            assert secret not in combined
        assert "[REDACTED]" in combined


def test_agent_execute_rolls_back_business_write_when_call_log_flush_fails(
    app,
    client,
    make_user,
    monkeypatch,
):
    owner_id, token = make_user("agent-log-atomic@example.com", role="recruiter", org_id=1)

    with app.app_context():
        candidate = models.Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="原子性候选人",
            resume_json={},
        )
        job = models.Job(
            org_id=1,
            owner_hr_id=owner_id,
            title="原子性岗位",
            jd_text="Python",
            jd_structured={"skill_tags_raw": "Python,5,BE"},
        )
        db.session.add_all([candidate, job])
        db.session.commit()
        job_id = job.id

    from app.api import agent as agent_api

    original_record_call_log = agent_api._record_call_log

    def fail_after_call_log_flush(**kwargs):
        original_record_call_log(**kwargs)
        db.session.flush()
        raise RuntimeError("agent-call-log-flush-secret")

    monkeypatch.setattr(agent_api, "_record_call_log", fail_after_call_log_flush)
    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "run_match", "args": {"job_id": job_id}},
    )

    assert response.status_code == 500
    assert response.get_json() == {"ok": False, "error": "执行失败，请稍后重试"}
    assert "agent-call-log-flush-secret" not in response.get_data(as_text=True)
    with app.app_context():
        assert models.Match.query.filter_by(job_id=job_id).count() == 0
        assert models.Event.query.filter(
            models.Event.action.in_(["match.run", "agent.write"])
        ).count() == 0
        assert models.AgentCallLog.query.count() == 0


def test_agent_execute_returns_generic_error_and_only_logs_redacted_detail(
    app,
    client,
    make_user,
    monkeypatch,
):
    _, token = make_user("agent-log-exception@example.com", role="manager", org_id=3)
    from app.api import agent as agent_api

    def fail_write_tool(*args, **kwargs):
        raise RuntimeError("token=execute-super-secret")

    monkeypatch.setattr(agent_api, "execute_write_tool", fail_write_tool)
    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "run_match", "args": {"job_id": 99}},
    )

    assert response.status_code == 500
    assert response.get_json() == {"ok": False, "error": "执行失败，请稍后重试"}
    assert "execute-super-secret" not in response.get_data(as_text=True)
    with app.app_context():
        log = models.AgentCallLog.query.one()
        assert log.status == "error"
        assert "execute-super-secret" not in log.error_msg
        assert log.error_msg == "internal:RuntimeError"
        assert log.input_text is None
        assert log.output_text is None


def test_agent_call_logs_are_admin_only_paginated_filtered_and_org_scoped(
    app,
    client,
    make_user,
):
    admin_id, admin_token = make_user(
        "agent-log-admin@example.com",
        role="admin",
        org_id=1,
    )
    _, other_admin_token = make_user(
        "agent-log-other-admin@example.com",
        role="admin",
        org_id=2,
    )
    _, recruiter_token = make_user(
        "agent-log-recruiter@example.com",
        role="recruiter",
        org_id=1,
    )

    with app.app_context():
        own_chat = models.AgentCallLog(
            org_id=1,
            user_id=admin_id,
            role="admin",
            kind="chat",
            model="model-a",
            status="ok",
            input_text="safe input",
        )
        own_error = models.AgentCallLog(
            org_id=1,
            user_id=admin_id,
            role="admin",
            kind="tool_write",
            status="error",
            error_msg="safe error",
        )
        other_org = models.AgentCallLog(
            org_id=2,
            user_id=admin_id,
            role="admin",
            kind="chat",
            status="ok",
            input_text="other org",
        )
        db.session.add_all([own_chat, own_error, other_org])
        db.session.commit()
        own_chat_id = own_chat.id
        own_error_id = own_error.id
        other_org_id = other_org.id

    forbidden_checks = [
        client.get("/api/agent/call-logs", headers=_auth(recruiter_token)),
        client.get(f"/api/agent/call-logs/{own_chat_id}", headers=_auth(recruiter_token)),
    ]
    assert [response.status_code for response in forbidden_checks] == [403, 403]

    filtered = client.get(
        "/api/agent/call-logs?kind=tool_write&status=error&page=1&per_page=1",
        headers=_auth(admin_token),
    )
    assert filtered.status_code == 200
    filtered_payload = filtered.get_json()
    assert filtered_payload["page"] == 1
    assert filtered_payload["per_page"] == 1
    assert filtered_payload["total"] == 1
    assert [item["id"] for item in filtered_payload["items"]] == [own_error_id]
    assert set(filtered_payload["items"][0]) >= {
        "id",
        "conversation_id",
        "message_id",
        "user_id",
        "role",
        "kind",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "duration_ms",
        "status",
        "error_msg",
        "tool_calls",
        "thoughts",
        "input_text",
        "output_text",
        "created_at",
    }

    own_detail = client.get(
        f"/api/agent/call-logs/{own_chat_id}",
        headers=_auth(admin_token),
    )
    assert own_detail.status_code == 200
    assert own_detail.get_json()["id"] == own_chat_id

    cross_org_detail = client.get(
        f"/api/agent/call-logs/{other_org_id}",
        headers=_auth(admin_token),
    )
    assert cross_org_detail.status_code == 404

    other_org_list = client.get(
        "/api/agent/call-logs",
        headers=_auth(other_admin_token),
    )
    assert other_org_list.status_code == 200
    assert other_org_list.get_json()["total"] == 1
    assert [item["id"] for item in other_org_list.get_json()["items"]] == [other_org_id]
