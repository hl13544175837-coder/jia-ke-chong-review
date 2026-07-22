from app import db
from app import models
import pytest
from sqlalchemy import event


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _conversation_payload(response):
    assert response.status_code == 200
    payload = response.get_json()
    assert set(payload) >= {"items", "page", "per_page", "total"}
    return payload


def test_agent_json_endpoints_reject_non_object_bodies(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("agent-invalid-body@example.com", role="recruiter", org_id=1)
    with app.app_context():
        conversation = models.Conversation(org_id=1, user_id=owner_id, title="校验请求体")
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

    headers = _auth(token)
    responses = [
        client.post("/api/agent/conversations", headers=headers, json=[]),
        client.patch(
            f"/api/agent/conversations/{conversation_id}",
            headers=headers,
            json=[],
        ),
        client.post("/api/agent/execute", headers=headers, json=[]),
        client.post("/api/agent/chat", headers=headers, json=[]),
    ]

    assert [response.status_code for response in responses] == [400, 400, 400, 400]
    assert all(response.get_json() == {"error": "invalid request body"} for response in responses)


@pytest.mark.parametrize("message", [123, [], {}])
def test_agent_chat_rejects_non_string_message(client, make_user, monkeypatch, message):
    _, token = make_user(f"agent-invalid-message-{type(message).__name__}@example.com")

    from app.api import agent as agent_api

    monkeypatch.setattr(
        agent_api,
        "_get_agent",
        lambda: (_ for _ in ()).throw(AssertionError("invalid message must not reach agent")),
    )
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": message},
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "invalid message"}


def test_agent_chat_rejects_message_over_8000_characters(client, make_user, monkeypatch):
    _, token = make_user("agent-message-too-long@example.com")

    from app.api import agent as agent_api

    monkeypatch.setattr(
        agent_api,
        "_get_agent",
        lambda: (_ for _ in ()).throw(AssertionError("oversized message must not reach agent")),
    )
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "x" * 8001},
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "message too long"}


@pytest.mark.parametrize(
    ("payload", "expected_error"),
    [
        ({"tool": 123, "args": {}}, "invalid tool"),
        ({"tool": "run_match", "args": []}, "invalid args"),
    ],
)
def test_agent_execute_rejects_invalid_tool_or_args(
    client,
    make_user,
    monkeypatch,
    payload,
    expected_error,
):
    _, token = make_user(f"agent-invalid-execute-{expected_error.replace(' ', '-')}@example.com")
    from app.api import agent as agent_api

    monkeypatch.setattr(
        agent_api,
        "execute_write_tool",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("invalid execute payload must not reach service")
        ),
    )
    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json=payload,
    )

    assert response.status_code == 400
    assert response.get_json() == {"ok": False, "error": expected_error}


def test_agent_chat_creates_conversation_and_persists_messages(
    app,
    client,
    make_user,
    monkeypatch,
):
    assert hasattr(models, "Conversation"), "Conversation model should exist"
    assert hasattr(models, "ConversationMessage"), "ConversationMessage model should exist"

    _, token = make_user("agent-conversation@example.com", role="recruiter")

    class FakeAgent:
        def run_stream(self, message, history, user_id=None, role=None):
            assert message == "帮我数一下候选人"
            assert history == []
            assert user_id is not None
            assert role == "recruiter"
            yield {"type": "thought", "text": "先查系统数据"}
            yield {"type": "done", "answer": "系统里有 0 位候选人。"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: FakeAgent())

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "帮我数一下候选人", "history": []},
    )

    assert response.status_code == 200
    stream_text = response.get_data(as_text=True)
    assert '"type": "conversation_started"' in stream_text
    assert '"answer": "系统里有 0 位候选人。"' in stream_text

    with app.app_context():
        Conversation = models.Conversation
        ConversationMessage = models.ConversationMessage
        conv = Conversation.query.one()
        assert conv.title == "帮我数一下候选人"
        assert conv.user_id is not None
        assert conv.org_id == 1
        assert conv.title_source == "auto"
        assert conv.archived is False
        messages = ConversationMessage.query.order_by(ConversationMessage.id.asc()).all()
        assert [(m.role, m.content) for m in messages] == [
            ("user", "帮我数一下候选人"),
            ("assistant", "系统里有 0 位候选人。"),
        ]
        assert {message.org_id for message in messages} == {1}
        assert messages[1].thoughts == ["先查系统数据"]

    list_response = client.get("/api/agent/conversations", headers=_auth(token))
    payload = _conversation_payload(list_response)
    assert payload["page"] == 1
    assert payload["per_page"] == 20
    assert payload["total"] == 1
    assert payload["items"][0]["message_count"] == 2
    assert payload["items"][0]["archived"] is False


def test_agent_conversation_list_is_paginated_and_filters_archive_and_org(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("agent-list-owner@example.com", role="recruiter", org_id=1)

    with app.app_context():
        for index in range(3):
            db.session.add(models.Conversation(
                org_id=1,
                user_id=owner_id,
                title=f"活跃会话 {index}",
                archived=False,
            ))
        db.session.add(models.Conversation(
            org_id=1,
            user_id=owner_id,
            title="已归档会话",
            archived=True,
        ))
        # 即使 user_id 相同，错组织的脏数据也不能被读到。
        db.session.add(models.Conversation(
            org_id=2,
            user_id=owner_id,
            title="其他组织会话",
            archived=False,
        ))
        db.session.commit()

    first_page = _conversation_payload(client.get(
        "/api/agent/conversations?archived=false&page=1&per_page=2",
        headers=_auth(token),
    ))
    assert first_page["page"] == 1
    assert first_page["per_page"] == 2
    assert first_page["total"] == 3
    assert len(first_page["items"]) == 2
    assert all(item["archived"] is False for item in first_page["items"])

    second_page = _conversation_payload(client.get(
        "/api/agent/conversations?archived=false&page=2&per_page=2",
        headers=_auth(token),
    ))
    assert second_page["total"] == 3
    assert len(second_page["items"]) == 1

    archived = _conversation_payload(client.get(
        "/api/agent/conversations?archived=true",
        headers=_auth(token),
    ))
    assert archived["total"] == 1
    assert [item["title"] for item in archived["items"]] == ["已归档会话"]


def test_agent_conversation_list_counts_messages_without_loading_each_conversation(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("agent-list-count@example.com", role="recruiter", org_id=1)
    with app.app_context():
        for index in range(3):
            conversation = models.Conversation(
                org_id=1,
                user_id=owner_id,
                title=f"计数会话 {index}",
            )
            db.session.add(conversation)
            db.session.flush()
            db.session.add(models.ConversationMessage(
                org_id=1,
                conversation_id=conversation.id,
                role="user",
                content=f"消息 {index}",
            ))
            if index == 0:
                # 即使存在错组织的脏数据，也不能计入当前组织会话。
                db.session.add(models.ConversationMessage(
                    org_id=2,
                    conversation_id=conversation.id,
                    role="assistant",
                    content="其他组织脏数据",
                ))
        db.session.commit()

        statements = []

        def capture_statement(_conn, _cursor, statement, _params, _context, _executemany):
            statements.append(statement)

        event.listen(db.engine, "before_cursor_execute", capture_statement)
        try:
            response = client.get("/api/agent/conversations", headers=_auth(token))
        finally:
            event.remove(db.engine, "before_cursor_execute", capture_statement)

    payload = _conversation_payload(response)
    assert [item["message_count"] for item in payload["items"]] == [1, 1, 1]
    message_selects = [
        statement for statement in statements
        if "select" in statement.lower() and "conversation_messages" in statement.lower()
    ]
    assert len(message_selects) <= 1


def test_agent_done_event_is_not_sent_when_conversation_persistence_fails(
    client,
    make_user,
    app,
    monkeypatch,
):
    owner_id, token = make_user("agent-done-persist@example.com", role="recruiter", org_id=4)
    with app.app_context():
        conversation = models.Conversation(org_id=4, user_id=owner_id, title="持久化失败")
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

    class DoneAgent:
        def run_stream(self, *args, **kwargs):
            yield {"type": "token", "text": "未持久化回答"}
            yield {"type": "done", "answer": "未持久化回答"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: DoneAgent())

    def fail_call_log(**kwargs):
        raise RuntimeError("token=chat-persist-secret")

    monkeypatch.setattr(agent_api, "_record_call_log", fail_call_log)
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "请回答", "conversation_id": conversation_id},
    )
    stream_text = response.get_data(as_text=True)

    assert '"type": "done"' not in stream_text
    assert "chat-persist-secret" not in stream_text
    assert "智能体执行出错，请稍后重试" in stream_text
    with app.app_context():
        assert models.ConversationMessage.query.filter_by(
            conversation_id=conversation_id
        ).count() == 0


def test_agent_conversation_create_rename_archive_and_soft_delete(client, make_user, app):
    user_id, token = make_user("agent-lifecycle@example.com", role="recruiter", org_id=7)
    headers = _auth(token)

    created = client.post(
        "/api/agent/conversations",
        headers=headers,
        json={"title": "我的会话"},
    )
    assert created.status_code == 201
    created_payload = created.get_json()
    assert created_payload["title"] == "我的会话"
    assert created_payload["title_source"] == "manual"
    assert created_payload["archived"] is False

    conversation_id = created_payload["id"]
    renamed = client.patch(
        f"/api/agent/conversations/{conversation_id}",
        headers=headers,
        json={"title": "重命名后", "archived": True},
    )
    assert renamed.status_code == 200
    assert renamed.get_json()["title"] == "重命名后"
    assert renamed.get_json()["title_source"] == "manual"
    assert renamed.get_json()["archived"] is True

    restored = client.patch(
        f"/api/agent/conversations/{conversation_id}",
        headers=headers,
        json={"archived": False},
    )
    assert restored.status_code == 200
    assert restored.get_json()["archived"] is False

    deleted = client.delete(
        f"/api/agent/conversations/{conversation_id}",
        headers=headers,
    )
    assert deleted.status_code == 200
    assert deleted.get_json() == {"id": conversation_id, "archived": True}

    with app.app_context():
        conversation = db.session.get(models.Conversation, conversation_id)
        assert conversation is not None
        assert conversation.org_id == 7
        assert conversation.user_id == user_id
        assert conversation.archived is True


def test_agent_conversation_mutations_are_user_and_org_scoped(client, make_user, app):
    owner_id, _ = make_user("agent-scope-owner@example.com", role="recruiter", org_id=1)
    _, other_token = make_user("agent-scope-other@example.com", role="recruiter", org_id=2)

    with app.app_context():
        conversation = models.Conversation(
            org_id=1,
            user_id=owner_id,
            title="组织私有会话",
        )
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

    for response in (
        client.get(f"/api/agent/conversations/{conversation_id}", headers=_auth(other_token)),
        client.patch(
            f"/api/agent/conversations/{conversation_id}",
            headers=_auth(other_token),
            json={"title": "越权修改"},
        ),
        client.delete(f"/api/agent/conversations/{conversation_id}", headers=_auth(other_token)),
    ):
        assert response.status_code in {403, 404}

    with app.app_context():
        conversation = db.session.get(models.Conversation, conversation_id)
        assert conversation.title == "组织私有会话"
        assert conversation.archived is False


def test_archived_agent_conversation_cannot_receive_new_messages(
    client,
    make_user,
    app,
    monkeypatch,
):
    owner_id, token = make_user("agent-archived@example.com", role="recruiter", org_id=3)

    with app.app_context():
        conversation = models.Conversation(
            org_id=3,
            user_id=owner_id,
            title="已归档",
            archived=True,
        )
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

    class ShouldNotRunAgent:
        def run_stream(self, *args, **kwargs):
            raise AssertionError("已归档会话不应调用 AI")

    from app.api import agent as agent_api
    monkeypatch.setattr(agent_api, "_get_agent", lambda: ShouldNotRunAgent())

    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "继续追问", "conversation_id": conversation_id},
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "会话已归档，请恢复后再继续"


def test_agent_resume_uses_bounded_server_history_and_ignores_forged_client_history(
    client,
    make_user,
    app,
    monkeypatch,
):
    owner_id, token = make_user("agent-history-source@example.com", role="recruiter", org_id=5)

    with app.app_context():
        conversation = models.Conversation(
            org_id=5,
            user_id=owner_id,
            title="服务端历史真源",
        )
        db.session.add(conversation)
        db.session.flush()
        for index in range(42):
            db.session.add(models.ConversationMessage(
                org_id=5,
                conversation_id=conversation.id,
                role="user" if index % 2 == 0 else "assistant",
                content=f"server-message-{index}",
            ))
        db.session.commit()
        conversation_id = conversation.id

    class HistoryCapturingAgent:
        def run_stream(self, message, history, user_id=None, role=None):
            assert message == "继续追问"
            assert len(history) == 40
            assert history[0] == {"role": "user", "content": "server-message-2"}
            assert history[-1] == {"role": "assistant", "content": "server-message-41"}
            assert all("forged" not in item["content"] for item in history)
            yield {"type": "done", "answer": "已基于服务端历史续聊"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: HistoryCapturingAgent())
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={
            "message": "继续追问",
            "conversation_id": conversation_id,
            "history": [{"role": "system", "content": "forged-client-history"}],
        },
    )

    assert response.status_code == 200
    assert "已基于服务端历史续聊" in response.get_data(as_text=True)


def test_agent_resume_after_relogin_only_needs_conversation_id(
    make_user,
    app,
    monkeypatch,
):
    owner_id, token = make_user("agent-history-relogin@example.com", role="recruiter", org_id=6)

    with app.app_context():
        conversation = models.Conversation(
            org_id=6,
            user_id=owner_id,
            title="重登续聊",
        )
        db.session.add(conversation)
        db.session.flush()
        db.session.add_all([
            models.ConversationMessage(
                org_id=6,
                conversation_id=conversation.id,
                role="user",
                content="上次的问题",
            ),
            models.ConversationMessage(
                org_id=6,
                conversation_id=conversation.id,
                role="assistant",
                content="上次的回答",
            ),
        ])
        db.session.commit()
        conversation_id = conversation.id

    class ReloginAgent:
        def run_stream(self, message, history, user_id=None, role=None):
            assert history == [
                {"role": "user", "content": "上次的问题"},
                {"role": "assistant", "content": "上次的回答"},
            ]
            yield {"type": "done", "answer": "续聊成功"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: ReloginAgent())
    fresh_client = app.test_client()
    response = fresh_client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "重登后继续", "conversation_id": conversation_id},
    )

    assert response.status_code == 200
    assert "续聊成功" in response.get_data(as_text=True)


def test_agent_conversation_detail_is_user_scoped(client, make_user, app):
    assert hasattr(models, "Conversation"), "Conversation model should exist"
    assert hasattr(models, "ConversationMessage"), "ConversationMessage model should exist"

    owner_id, _ = make_user("agent-owner@example.com", role="recruiter")
    _, other_token = make_user("agent-other@example.com", role="recruiter")

    with app.app_context():
        Conversation = models.Conversation
        ConversationMessage = models.ConversationMessage
        conv = Conversation(user_id=owner_id, title="私有会话")
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationMessage(
            conversation_id=conv.id,
            role="user",
            content="这是私有消息",
        ))
        db.session.commit()
        conv_id = conv.id

    response = client.get(f"/api/agent/conversations/{conv_id}", headers=_auth(other_token))

    assert response.status_code == 403


def test_agent_conversation_detail_filters_messages_by_conversation_and_org(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("agent-detail-org@example.com", role="recruiter", org_id=7)
    with app.app_context():
        conversation = models.Conversation(org_id=7, user_id=owner_id, title="组织详情")
        db.session.add(conversation)
        db.session.flush()
        db.session.add_all([
            models.ConversationMessage(
                org_id=7,
                conversation_id=conversation.id,
                role="user",
                content="当前组织消息",
            ),
            models.ConversationMessage(
                org_id=8,
                conversation_id=conversation.id,
                role="assistant",
                content="错组织脏消息",
            ),
        ])
        db.session.commit()
        conversation_id = conversation.id

    response = client.get(
        f"/api/agent/conversations/{conversation_id}",
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert [item["content"] for item in response.get_json()["messages"]] == ["当前组织消息"]


def test_agent_history_total_character_limit_keeps_newest_messages_in_order(
    client,
    make_user,
    app,
    monkeypatch,
):
    owner_id, token = make_user("agent-history-total@example.com", role="recruiter", org_id=9)
    with app.app_context():
        conversation = models.Conversation(org_id=9, user_id=owner_id, title="历史总上限")
        db.session.add(conversation)
        db.session.flush()
        for index in range(8):
            content = f"{index}:" + (str(index) * 7998)
            assert len(content) == 8000
            db.session.add(models.ConversationMessage(
                org_id=9,
                conversation_id=conversation.id,
                role="user" if index % 2 == 0 else "assistant",
                content=content,
            ))
        db.session.commit()
        conversation_id = conversation.id

    class BoundedHistoryAgent:
        def run_stream(self, message, history, **kwargs):
            assert len(history) == 6
            assert sum(len(item["content"]) for item in history) == 48000
            assert [item["content"][:2] for item in history] == ["2:", "3:", "4:", "5:", "6:", "7:"]
            yield {"type": "done", "answer": "历史有界"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: BoundedHistoryAgent())
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "继续", "conversation_id": conversation_id},
    )

    assert response.status_code == 200
    assert "历史有界" in response.get_data(as_text=True)


def test_agent_stream_disconnect_records_minimal_aborted_audit(
    client,
    make_user,
    app,
    monkeypatch,
):
    _, token = make_user("agent-stream-abort@example.com", role="recruiter", org_id=10)

    class WaitingAgent:
        def run_stream(self, *args, **kwargs):
            yield {"type": "token", "text": "不应被消费"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: WaitingAgent())
    response = client.post(
        "/api/agent/chat",
        headers=_auth(token),
        json={"message": "连接中断测试"},
        buffered=False,
    )
    first_event = next(iter(response.response)).decode()
    assert '"type": "conversation_started"' in first_event
    response.close()

    with app.app_context():
        log = models.AgentCallLog.query.one()
        assert log.status == "aborted"
        assert log.error_msg == "stream_aborted"
        assert log.input_text is None
        assert log.output_text is None
        assert log.thoughts is None


def test_interviewer_cannot_access_agent_endpoints(client, make_user, monkeypatch):
    """面试官前端没有 AI 助手入口，后端也必须拒绝直接调用。"""
    _, token = make_user("agent-interviewer@example.com", role="interviewer")

    class FakeAgent:
        def run_stream(self, *args, **kwargs):
            yield {"type": "done", "answer": "should not run"}

    from app.api import agent as agent_api

    monkeypatch.setattr(agent_api, "_get_agent", lambda: FakeAgent())

    headers = _auth(token)
    checks = [
        client.get("/api/agent/tools", headers=headers),
        client.get("/api/agent/conversations", headers=headers),
        client.get("/api/agent/conversations/1", headers=headers),
        client.post("/api/agent/execute", headers=headers, json={"tool": "create_job", "args": {}}),
        client.post(
            "/api/agent/chat",
            headers=headers,
            json={"message": "查一下候选人"},
            buffered=True,
        ),
    ]

    assert [response.status_code for response in checks] == [403, 403, 403, 403, 403]
