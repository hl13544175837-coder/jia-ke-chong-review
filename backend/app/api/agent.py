import json
import re
import time
from flask import Blueprint, request, Response, jsonify, g, current_app, stream_with_context
from sqlalchemy import and_
from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from .. import db
from ..models import AgentCallLog, Conversation, ConversationMessage
from ..time_utils import utc_now
from ..services.agent_service import (
    RecruitingAgent,
    TOOLS as AGENT_TOOLS,
    WRITE_TOOLS as AGENT_WRITE_TOOLS,
    execute_write_tool,
)

bp = Blueprint("agent", __name__)

# 单例：编译一次 LangGraph，复用
_agent_instance = None


def _get_agent() -> RecruitingAgent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = RecruitingAgent()
    return _agent_instance


@bp.get("/agent/tools")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_tools():
    """返回 AI 的只读工具与用户确认后可运行的匹配工具。"""
    return jsonify({"tools": AGENT_TOOLS, "write_tools": AGENT_WRITE_TOOLS})


@bp.get("/agent/conversations")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_conversations():
    page = _positive_int_arg("page", 1)
    per_page = _positive_int_arg("per_page", 20, max_value=100)
    archived = _boolean_arg("archived", False)
    if archived is None:
        return jsonify({"error": "invalid archived"}), 400

    filters = (
        Conversation.user_id == g.user_id,
        Conversation.org_id == g.org_id,
        Conversation.archived == archived,
    )
    total = Conversation.query.filter(*filters).count()
    rows = (
        db.session.query(
            Conversation,
            db.func.count(ConversationMessage.id).label("message_count"),
        )
        .outerjoin(
            ConversationMessage,
            and_(
                ConversationMessage.conversation_id == Conversation.id,
                ConversationMessage.org_id == Conversation.org_id,
            ),
        )
        .filter(*filters)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return jsonify({
        "items": [
            _conversation_summary(conversation, message_count)
            for conversation, message_count in rows
        ],
        "page": page,
        "per_page": per_page,
        "total": total,
    })


@bp.post("/agent/conversations")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_conversation():
    data = _request_json_object()
    if data is None:
        return jsonify({"error": "invalid request body"}), 400
    raw_title = data.get("title")
    if raw_title is not None and not isinstance(raw_title, str):
        return jsonify({"error": "invalid title"}), 400
    title = (raw_title or "").strip()
    if raw_title is not None and not title:
        return jsonify({"error": "title required"}), 400
    conversation = Conversation(
        org_id=g.org_id,
        user_id=g.user_id,
        title=title[:200] if title else "新对话",
        title_source="manual" if title else "default",
        archived=False,
    )
    db.session.add(conversation)
    db.session.commit()
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
    }), 201


@bp.get("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def get_conversation(conversation_id):
    conversation, error = _owned_conversation(conversation_id)
    if error is not None:
        return error
    messages = (
        ConversationMessage.query
        .filter_by(conversation_id=conversation.id, org_id=conversation.org_id)
        .order_by(ConversationMessage.id.asc())
        .all()
    )
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "messages": [{
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "tool_calls": message.tool_calls,
            "thoughts": message.thoughts,
            "created_at": message.created_at.isoformat() if message.created_at else None,
        } for message in messages],
    })


@bp.get("/agent/call-logs")
@require_auth
@require_role("admin")
def list_call_logs():
    page = _positive_int_arg("page", 1)
    per_page = _positive_int_arg("per_page", 20, max_value=100)
    query = AgentCallLog.query.filter_by(org_id=g.org_id)

    for field in ("status", "kind"):
        value = (request.args.get(field) or "").strip()
        if value:
            query = query.filter(getattr(AgentCallLog, field) == value)
    for field in ("conversation_id", "user_id"):
        raw_value = request.args.get(field)
        if raw_value not in (None, ""):
            try:
                value = int(raw_value)
            except (TypeError, ValueError):
                return jsonify({"error": f"invalid {field}"}), 400
            query = query.filter(getattr(AgentCallLog, field) == value)

    total = query.count()
    logs = (
        query
        .order_by(AgentCallLog.created_at.desc(), AgentCallLog.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return jsonify({
        "items": [_call_log_payload(log) for log in logs],
        "page": page,
        "per_page": per_page,
        "total": total,
    })


@bp.get("/agent/call-logs/<int:log_id>")
@require_auth
@require_role("admin")
def get_call_log(log_id):
    log = AgentCallLog.query.filter_by(id=log_id, org_id=g.org_id).first()
    if log is None:
        return jsonify({"error": "调用日志不存在"}), 404
    return jsonify(_call_log_payload(log))


@bp.patch("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_conversation(conversation_id):
    conversation, error = _owned_conversation(conversation_id)
    if error is not None:
        return error
    data = _request_json_object()
    if data is None:
        return jsonify({"error": "invalid request body"}), 400
    if "title" in data:
        if not isinstance(data["title"], str) or not data["title"].strip():
            return jsonify({"error": "title required"}), 400
        conversation.title = data["title"].strip()[:200]
        conversation.title_source = "manual"
    if "archived" in data:
        if not isinstance(data["archived"], bool):
            return jsonify({"error": "invalid archived"}), 400
        conversation.archived = data["archived"]
    conversation.updated_at = utc_now()
    db.session.commit()
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    })


@bp.delete("/agent/conversations/<int:conversation_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def delete_conversation(conversation_id):
    conversation, error = _owned_conversation(conversation_id)
    if error is not None:
        return error
    conversation.archived = True
    conversation.updated_at = utc_now()
    db.session.commit()
    return jsonify({"id": conversation.id, "archived": True})


@bp.post("/agent/execute")
@require_auth
@require_role("recruiter", "manager", "admin")
def execute():
    """执行 AI 助手提议的匹配操作（用户确认后调用）。
    在正常请求上下文内运行，g.user_id / g.role 有效，做 RBAC 校验。
    请求体：{"tool": "写工具名", "args": {...}}
    """
    data = _request_json_object()
    if data is None:
        return jsonify({"error": "invalid request body"}), 400
    raw_tool = data.get("tool")
    if raw_tool is not None and not isinstance(raw_tool, str):
        return jsonify({"ok": False, "error": "invalid tool"}), 400
    tool = (raw_tool or "").strip()
    if tool and not _SAFE_TOOL_NAME_PATTERN.fullmatch(tool):
        return jsonify({"ok": False, "error": "invalid tool"}), 400
    args = data.get("args", {})
    if not isinstance(args, dict):
        return jsonify({"ok": False, "error": "invalid args"}), 400
    started_at = time.perf_counter()
    if not tool:
        result = {"ok": False, "error": "tool required"}
        try:
            _record_call_log(
                org_id=g.org_id,
                user_id=g.user_id,
                role=g.role,
                kind="tool_write",
                status="error",
                duration_ms=_elapsed_ms(started_at),
                error_msg=result["error"],
                tool_calls=[{"tool": tool or None, "args": args, "result": result}],
            )
            db.session.commit()
            return jsonify(result), 400
        except Exception as error:
            db.session.rollback()
            _log_internal_error("agent execute validation audit failed", error)
            return jsonify(_generic_execute_error()), 500
    try:
        result = execute_write_tool(
            tool,
            args,
            user_id=g.user_id,
            role=g.role,
            commit=False,
        )
        ok = bool(result.get("ok"))
        _record_call_log(
            org_id=g.org_id,
            user_id=g.user_id,
            role=g.role,
            kind="tool_write",
            status="ok" if ok else "error",
            duration_ms=_elapsed_ms(started_at),
            error_msg=None if ok else result.get("error"),
            tool_calls=[{"tool": tool, "args": args, "result": result}],
        )
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        _log_internal_error("agent execute transaction failed", error)
        try:
            _record_call_log(
                org_id=g.org_id,
                user_id=g.user_id,
                role=g.role,
                kind="tool_write",
                status="error",
                duration_ms=_elapsed_ms(started_at),
                error_msg=_internal_error_marker(error),
                tool_calls=[{"tool": tool, "args": args, "result": {"ok": False}}],
            )
            db.session.commit()
        except Exception as audit_error:
            db.session.rollback()
            _log_internal_error("agent execute failure audit failed", audit_error)
        return jsonify(_generic_execute_error()), 500
    status = 200 if result.get("ok") else 400
    return jsonify(result), status


@bp.post("/agent/chat")
@require_auth
@require_role("recruiter", "manager", "admin")
@rate_limit("agent.chat")
def chat():
    """
    智能体对话 SSE 流式端点。
    请求体：{"message": "用户问题", "conversation_id": 可选会话ID}
    续聊历史只从服务端会话库加载，客户端 history 字段不作为信任数据源。
    响应：text/event-stream，每个事件一行 `data: {json}\n\n`，
          事件类型 thought / tool_call / tool_result / token / done / error。
    """
    data = _request_json_object()
    if data is None:
        return jsonify({"error": "invalid request body"}), 400
    raw_message = data.get("message")
    if raw_message is not None and not isinstance(raw_message, str):
        return jsonify({"error": "invalid message"}), 400
    message = (raw_message or "").strip()
    conversation_id = data.get("conversation_id")
    if not message:
        return jsonify({"error": "message required"}), 400
    if len(message) > _AGENT_MESSAGE_LIMIT:
        return jsonify({"error": "message too long"}), 400

    if conversation_id:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid conversation_id"}), 400
        conversation, error = _owned_conversation(conversation_id)
        if error is not None:
            return error
        if conversation.archived:
            return jsonify({"error": "会话已归档，请恢复后再继续"}), 409
        history = _server_conversation_history(conversation)
    else:
        conversation = Conversation(
            org_id=g.org_id,
            user_id=g.user_id,
            title=_conversation_title(message),
            title_source="auto",
            archived=False,
        )
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id
        history = []

    # 在请求上下文内捕获需要的应用对象（生成器执行时 g 已不可用）
    app = current_app._get_current_object()
    agent = _get_agent()
    model_name = _agent_model(agent)
    user_id = g.user_id
    role = g.role
    org_id = g.org_id
    store_conversation_id = conversation_id

    stream_state = {"terminal": False}

    def generate_events():
        # 生成器运行在 app context 内（工具要查 DB）
        with app.app_context():
            started_at = time.perf_counter()
            thoughts = []
            tool_calls = []
            answer_parts = []
            final_answer = ""
            success = False
            pending_done = None
            yield f"data: {json.dumps({'type': 'conversation_started', 'id': store_conversation_id}, ensure_ascii=False)}\n\n"
            try:
                for ev in agent.run_stream(message, history, user_id=user_id, role=role):
                    ev_type = ev.get("type")
                    if ev_type == "thought":
                        thoughts.append(ev.get("text", ""))
                    elif ev_type == "tool_call":
                        tool_calls.append({
                            "tool": ev.get("tool"),
                            "args": ev.get("args") or {},
                        })
                    elif ev_type == "tool_result":
                        for call in reversed(tool_calls):
                            if call.get("tool") == ev.get("tool") and "result" not in call:
                                call["result"] = ev.get("result")
                                break
                    elif ev_type == "token":
                        answer_parts.append(ev.get("text", ""))
                    elif ev_type == "done":
                        final_answer = ev.get("answer") or "".join(answer_parts)
                        success = True
                        pending_done = ev
                        continue
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            except Exception as e:
                db.session.rollback()
                _persist_chat_failure_log(
                    org_id=org_id,
                    user_id=user_id,
                    role=role,
                    model_name=model_name,
                    conversation_id=store_conversation_id,
                    started_at=started_at,
                    error=e,
                    tool_calls=tool_calls,
                )
                stream_state["terminal"] = True
                yield _generic_chat_error_event()
                return

            if not success:
                _persist_chat_failure_log(
                    org_id=org_id,
                    user_id=user_id,
                    role=role,
                    model_name=model_name,
                    conversation_id=store_conversation_id,
                    started_at=started_at,
                    error="AI stream ended without a completion event",
                    tool_calls=tool_calls,
                )
                stream_state["terminal"] = True
                yield _generic_chat_error_event()
                return

            try:
                conversation = (
                    Conversation.query
                    .filter_by(
                        id=store_conversation_id,
                        user_id=user_id,
                        org_id=org_id,
                        archived=False,
                    )
                    .first()
                )
                if conversation is None:
                    raise RuntimeError("conversation unavailable or archived")
                user_message = ConversationMessage(
                    org_id=org_id,
                    conversation_id=conversation.id,
                    role="user",
                    content=message,
                )
                assistant_message = ConversationMessage(
                    org_id=org_id,
                    conversation_id=conversation.id,
                    role="assistant",
                    content=final_answer or "".join(answer_parts),
                    tool_calls=tool_calls or None,
                    thoughts=thoughts or None,
                )
                db.session.add_all([user_message, assistant_message])
                db.session.flush()
                conversation.updated_at = utc_now()
                _record_call_log(
                    org_id=org_id,
                    user_id=user_id,
                    role=role,
                    kind="chat",
                    status="ok",
                    duration_ms=_elapsed_ms(started_at),
                    model=model_name,
                    conversation_id=conversation.id,
                    message_id=assistant_message.id,
                    tool_calls=tool_calls or None,
                )
                db.session.commit()
            except Exception as error:
                db.session.rollback()
                _log_internal_error("agent chat persistence failed", error)
                _persist_chat_failure_log(
                    org_id=org_id,
                    user_id=user_id,
                    role=role,
                    model_name=model_name,
                    conversation_id=store_conversation_id,
                    started_at=started_at,
                    error=error,
                    tool_calls=tool_calls,
                )
                stream_state["terminal"] = True
                yield _generic_chat_error_event()
                return

            stream_state["terminal"] = True
            yield f"data: {json.dumps(pending_done, ensure_ascii=False)}\n\n"

    @stream_with_context
    def generate():
        try:
            yield from generate_events()
        except GeneratorExit:
            if not stream_state["terminal"]:
                with app.app_context():
                    db.session.rollback()
                    _persist_chat_aborted_log(
                        org_id=org_id,
                        user_id=user_id,
                        role=role,
                        model_name=model_name,
                        conversation_id=store_conversation_id,
                        started_at=time.perf_counter(),
                    )
            raise

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲，保证流式
            "Connection": "keep-alive",
        },
    )


def _conversation_title(first_message: str) -> str:
    clean = first_message.strip().replace("\n", " ")
    return clean[:30] + ("…" if len(clean) > 30 else "")


def _conversation_summary(conversation, message_count=None):
    return {
        "id": conversation.id,
        "title": conversation.title,
        "title_source": conversation.title_source,
        "archived": conversation.archived,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "message_count": (
            int(message_count)
            if message_count is not None
            else len(conversation.messages)
        ),
    }


def _owned_conversation(conversation_id):
    conversation = (
        Conversation.query
        .filter_by(
            id=conversation_id,
            org_id=g.org_id,
        )
        .first()
    )
    if conversation is None:
        return None, (jsonify({"error": "会话不存在"}), 404)
    if conversation.user_id != g.user_id:
        return None, (jsonify({"error": "Forbidden"}), 403)
    return conversation, None


_AGENT_HISTORY_LIMIT = 40
_AGENT_MESSAGE_LIMIT = 8000
_AGENT_HISTORY_CONTENT_LIMIT = 8000
_AGENT_HISTORY_TOTAL_LIMIT = 48000


def _server_conversation_history(conversation):
    """只从已通过 user + org 校验的会话读取最近历史。"""
    recent = (
        ConversationMessage.query
        .filter_by(
            conversation_id=conversation.id,
            org_id=conversation.org_id,
        )
        .filter(ConversationMessage.role.in_(("user", "assistant")))
        .order_by(ConversationMessage.id.desc())
        .limit(_AGENT_HISTORY_LIMIT)
        .all()
    )
    newest_history = []
    total_characters = 0
    for message in recent:
        content = (message.content or "")[:_AGENT_HISTORY_CONTENT_LIMIT]
        if total_characters + len(content) > _AGENT_HISTORY_TOTAL_LIMIT:
            break
        newest_history.append({
            "role": message.role,
            "content": content,
        })
        total_characters += len(content)
    return list(reversed(newest_history))


def _positive_int_arg(name, default, max_value=None):
    value = request.args.get(name, default=default, type=int)
    if value is None or value < 1:
        value = default
    if max_value is not None:
        value = min(value, max_value)
    return value


def _boolean_arg(name, default):
    raw = request.args.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes"}:
        return True
    if value in {"0", "false", "no"}:
        return False
    return None


_LOG_TEXT_LIMIT = 4000
_LOG_VALUE_LIMIT = 1000
_SAFE_TOOL_NAME_PATTERN = re.compile(r"[a-z][a-z0-9_]{0,63}")
_KNOWN_AGENT_TOOL_NAMES = {
    tool["name"]
    for tool in (*AGENT_TOOLS, *AGENT_WRITE_TOOLS)
}
_SENSITIVE_KEY = re.compile(
    r"(?:authorization|cookie|password|passwd|pwd|secret|token|api[_-]?key|credential)",
    re.IGNORECASE,
)
_PII_KEY = re.compile(
    r"(?:^|[_\-\s])(?:name|phone|mobile|email|id_?card|salary|compensation)"
    r"(?:$|[_\-\s])|姓名|手机号?|邮箱|身份证|薪资|薪酬",
    re.IGNORECASE,
)
_SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;}\]]+"),
    re.compile(r"(?i)(bearer\s+)[^\s,;}\]]+"),
    re.compile(
        r"(?i)((?:password|passwd|pwd|secret|token|api[_-]?key|credential)\s*[\"']?\s*[:=]\s*)"
        r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}\]]+)"
    ),
    re.compile(r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])", re.IGNORECASE),
    re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    re.compile(r"(?<!\d)(?:\d{17}[0-9Xx]|\d{15})(?!\d)"),
    re.compile(
        r"(?i)((?:name|phone|mobile|email|id_?card|salary|compensation|"
        r"姓名|手机号?|邮箱|身份证|薪资|薪酬)\s*[:=：]\s*)"
        r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}。，]+)"
    ),
)


def _redact_text(value):
    text = str(value)
    stripped = text.lstrip()
    if stripped.startswith(("{", "[")):
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError, json.JSONDecodeError):
            parsed = None
        if isinstance(parsed, (dict, list)):
            text = json.dumps(_sanitize_log_value(parsed), ensure_ascii=False, default=str)
    for pattern in _SENSITIVE_TEXT_PATTERNS:
        if pattern.groups:
            text = pattern.sub(r"\1[REDACTED]", text)
        else:
            text = pattern.sub("[REDACTED]", text)
    return text


def _sanitize_log_value(value, depth=0):
    if depth > 6:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        sanitized = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 50:
                sanitized["__truncated__"] = True
                break
            key_text = str(key)
            sanitized[key_text] = (
                "[REDACTED]"
                if _SENSITIVE_KEY.search(key_text) or _PII_KEY.search(key_text)
                else _sanitize_log_value(item, depth + 1)
            )
        return sanitized
    if isinstance(value, (list, tuple)):
        items = list(value)
        sanitized = [_sanitize_log_value(item, depth + 1) for item in items[:50]]
        if len(items) > 50:
            sanitized.append("[TRUNCATED]")
        return sanitized
    if isinstance(value, str):
        text = _redact_text(value)
        return text[:_LOG_VALUE_LIMIT]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _redact_text(value)[:_LOG_VALUE_LIMIT]


def _log_text(value, limit=_LOG_TEXT_LIMIT):
    if value is None:
        return None
    if isinstance(value, str):
        text = _redact_text(value)
    else:
        text = json.dumps(_sanitize_log_value(value), ensure_ascii=False, default=str)
    return text[:limit]


def _record_call_log(
    *,
    org_id,
    user_id,
    role,
    kind,
    status,
    duration_ms,
    model=None,
    conversation_id=None,
    message_id=None,
    error_msg=None,
    input_value=None,
    output_value=None,
    tool_calls=None,
    thoughts=None,
):
    log = AgentCallLog(
        org_id=org_id,
        conversation_id=conversation_id,
        message_id=message_id,
        user_id=user_id,
        role=role,
        kind=kind,
        model=_log_text(model, 120),
        prompt_tokens=None,
        completion_tokens=None,
        duration_ms=duration_ms,
        status=status,
        error_msg=_log_text(error_msg, 1000),
        tool_calls=_safe_tool_call_metadata(tool_calls),
        thoughts=None,
        input_text=None,
        output_text=None,
    )
    db.session.add(log)
    return log


_TOOL_TARGET_ID_KEYS = (
    "candidate_id",
    "demand_id",
    "job_id",
    "interview_id",
    "feedback_id",
    "user_id",
    "owner_id",
    "org_id",
)


def _safe_tool_call_metadata(tool_calls):
    """调用日志只保留固定结构，不保留招聘正文、参数或结果。"""
    if not tool_calls:
        return None
    safe_calls = []
    for call in list(tool_calls)[:50]:
        if not isinstance(call, dict):
            continue
        args = call.get("args") if isinstance(call.get("args"), dict) else {}
        result = call.get("result")
        target_ids = {
            key: value
            for key in _TOOL_TARGET_ID_KEYS
            if isinstance((value := args.get(key)), int) and not isinstance(value, bool)
        }
        safe_call = {
            "tool": _safe_tool_name(call.get("tool")),
            "target_ids": target_ids,
        }
        if isinstance(result, dict):
            safe_call["ok"] = bool(result.get("ok", "error" not in result))
            result_payload = result.get("result") if isinstance(result.get("result"), dict) else result
            count = result_payload.get("count") if isinstance(result_payload, dict) else None
            if isinstance(count, int) and not isinstance(count, bool):
                safe_call["count"] = max(0, count)
            elif isinstance(result_payload, dict) and isinstance(result_payload.get("ranking"), list):
                safe_call["count"] = len(result_payload["ranking"])
        safe_calls.append(safe_call)
    return safe_calls or None


def _safe_tool_name(value):
    if (
        isinstance(value, str)
        and _SAFE_TOOL_NAME_PATTERN.fullmatch(value)
        and value in _KNOWN_AGENT_TOOL_NAMES
    ):
        return value
    return "unknown"


def _generic_execute_error():
    return {"ok": False, "error": "执行失败，请稍后重试"}


def _generic_chat_error_event():
    event = {"type": "error", "message": "智能体执行出错，请稍后重试"}
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _log_internal_error(context, error):
    current_app.logger.error("%s: %s", context, _internal_error_marker(error))


def _internal_error_marker(error):
    if isinstance(error, BaseException):
        return f"internal:{type(error).__name__}"
    return "internal:stream_incomplete"


def _persist_chat_failure_log(
    *,
    org_id,
    user_id,
    role,
    model_name,
    conversation_id,
    started_at,
    error,
    tool_calls,
):
    _log_internal_error("agent chat failed", error)
    try:
        _record_call_log(
            org_id=org_id,
            user_id=user_id,
            role=role,
            kind="chat",
            status="error",
            duration_ms=_elapsed_ms(started_at),
            model=model_name,
            conversation_id=conversation_id,
            error_msg=_internal_error_marker(error),
            tool_calls=tool_calls or None,
        )
        db.session.commit()
    except Exception as audit_error:
        db.session.rollback()
        _log_internal_error("agent chat failure audit failed", audit_error)


def _persist_chat_aborted_log(
    *,
    org_id,
    user_id,
    role,
    model_name,
    conversation_id,
    started_at,
):
    try:
        _record_call_log(
            org_id=org_id,
            user_id=user_id,
            role=role,
            kind="chat",
            status="aborted",
            duration_ms=_elapsed_ms(started_at),
            model=model_name,
            conversation_id=conversation_id,
            error_msg="stream_aborted",
        )
        db.session.commit()
    except Exception as audit_error:
        db.session.rollback()
        _log_internal_error("agent chat abort audit failed", audit_error)


def _request_json_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _elapsed_ms(started_at):
    return max(0, int((time.perf_counter() - started_at) * 1000))


def _agent_model(agent):
    for attribute in ("answer_route", "decision_route"):
        route = getattr(agent, attribute, None)
        if isinstance(route, dict) and route.get("model"):
            return str(route["model"])
    model = getattr(agent, "model", None)
    return str(model) if model else None


def _call_log_payload(log):
    return {
        "id": log.id,
        "conversation_id": log.conversation_id,
        "message_id": log.message_id,
        "user_id": log.user_id,
        "role": log.role,
        "kind": log.kind,
        "model": log.model,
        "prompt_tokens": log.prompt_tokens,
        "completion_tokens": log.completion_tokens,
        "duration_ms": log.duration_ms,
        "status": log.status,
        "error_msg": log.error_msg,
        "tool_calls": log.tool_calls,
        "thoughts": log.thoughts,
        "input_text": log.input_text,
        "output_text": log.output_text,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }
