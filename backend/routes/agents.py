import json
import logging
from flask import Blueprint, request, jsonify, current_app, Response, stream_with_context
from functools import wraps
from datetime import datetime, timedelta
from models import db, AgentConfig, AgentPermission, AgentActionLog
from agents.crypto_utils import encrypt_api_key, decrypt_api_key
from agents.llm_adapter import get_adapter
from agents.domain_agents import OrchestratorAgent
from agents.tools import execute_mutating_tool
from agents.permission_gate import HARDCODED_CONFIRMATION_AGENTS

_log = logging.getLogger(__name__)
agents_bp = Blueprint("agents", __name__, url_prefix="/api/agents")


def admin_only_agent_access(f):
    """
    Strict middleware blocking worker role from accessing any agentic AI capabilities.
    Workers are 100% blocked with 403 Forbidden under all configurations.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        # 1. Check if explicitly marked as worker in headers or query
        client_role = request.headers.get("X-User-Role", "").lower()
        if client_role == "worker":
            _log.warning("Blocked worker access attempt to agent endpoint: %s", request.path)
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Access Denied: Agentic AI capabilities are restricted to Admin role only.",
                        "code": "WORKER_ACCESS_FORBIDDEN",
                    }
                ),
                403,
            )

        # 2. Check current active worker session lock
        try:
            from routes.auth import get_current_user_role

            user_role = get_current_user_role()
            if user_role == "worker":
                _log.warning(
                    "Blocked authenticated worker session from agent endpoint: %s", request.path
                )
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "Access Denied: Agentic AI capabilities are restricted to Admin role only.",
                            "code": "WORKER_ACCESS_FORBIDDEN",
                        }
                    ),
                    403,
                )
        except Exception:
            pass

        return f(*args, **kwargs)

    return decorated


# =============================================================================
# CHAT & PROPOSAL EXECUTION ENDPOINTS
# =============================================================================


@agents_bp.route("/chat", methods=["POST"])
@admin_only_agent_access
def agent_chat():
    """Send user message to multi-agent orchestrator with live SSE status streaming or synchronous JSON."""
    data = request.json or {}
    message = data.get("message", "").strip()
    history = data.get("history", [])
    stream_requested = request.headers.get("Accept") == "text/event-stream" or data.get(
        "stream", True
    )

    if not message:
        return jsonify({"success": False, "error": "Message cannot be empty."}), 400

    if stream_requested:

        def generate():
            try:
                for evt_type, payload in OrchestratorAgent.handle_message_stream(
                    user_message=message, history=history, actor_sub="admin"
                ):
                    if evt_type == "status":
                        yield f"event: status\ndata: {json.dumps(payload)}\n\n"
                    elif evt_type == "final":
                        final_obj = {
                            "success": True,
                            "agent": payload.get("agent", "orchestrator"),
                            "response": payload.get("response", ""),
                            "data": payload.get("data"),
                            "steps": payload.get("steps", []),
                            "pending_actions": payload.get("pending_actions", []),
                            "executed_actions": payload.get("executed_actions", []),
                            "input_tokens": payload.get("input_tokens", 0),
                            "output_tokens": payload.get("output_tokens", 0),
                            "estimated_cost": payload.get("estimated_cost", 0.0),
                            "fast_path": payload.get("fast_path", False),
                            "error": payload.get("error"),
                        }
                        yield f"event: final\ndata: {json.dumps(final_obj)}\n\n"
            except Exception as e:
                _log.error("Agent chat stream error: %s", e)
                err_obj = {"success": False, "error": f"Failed to process message: {str(e)}"}
                yield f"event: error\ndata: {json.dumps(err_obj)}\n\n"

        return Response(stream_with_context(generate()), mimetype="text/event-stream")

    try:
        res = OrchestratorAgent.handle_message(
            user_message=message, history=history, actor_sub="admin"
        )
        return (
            jsonify(
                {
                    "success": True,
                    "agent": res.get("agent", "orchestrator"),
                    "response": res.get("response", ""),
                    "data": res.get("data"),
                    "steps": res.get("steps", []),
                    "pending_actions": res.get("pending_actions", []),
                    "executed_actions": res.get("executed_actions", []),
                    "input_tokens": res.get("input_tokens", 0),
                    "output_tokens": res.get("output_tokens", 0),
                    "estimated_cost": res.get("estimated_cost", 0.0),
                    "fast_path": res.get("fast_path", False),
                    "error": res.get("error"),
                }
            ),
            200,
        )
    except Exception as e:
        _log.error("Agent chat error: %s", e)
        return jsonify({"success": False, "error": f"Failed to process message: {str(e)}"}), 500


@agents_bp.route("/actions/<int:action_id>/approve", methods=["POST"])
@admin_only_agent_access
def approve_action(action_id):
    """Execute a previously proposed action directly without re-invoking the LLM."""
    action_log = AgentActionLog.query.get(action_id)
    if not action_log:
        return jsonify({"success": False, "error": f"Action #{action_id} not found."}), 404

    if action_log.status != "proposed":
        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Action #{action_id} has already been {action_log.status}.",
                }
            ),
            400,
        )

    try:
        args = json.loads(action_log.args_json) if action_log.args_json else {}
    except Exception:
        args = {}

    exec_res = execute_mutating_tool(action_log.tool_name, args)

    if exec_res.get("success", False):
        action_log.status = "executed"
        action_log.result_summary = json.dumps(exec_res)
        action_log.updated_at = datetime.now()
        db.session.commit()
        return (
            jsonify(
                {
                    "success": True,
                    "action_id": action_log.id,
                    "status": "executed",
                    "message": f"Action approved and executed: {action_log.diff_summary}",
                    "result": exec_res,
                }
            ),
            200,
        )
    else:
        action_log.status = "failed"
        action_log.error_message = exec_res.get("error", "Execution failed")
        action_log.updated_at = datetime.now()
        db.session.commit()
        return (
            jsonify(
                {
                    "success": False,
                    "action_id": action_log.id,
                    "status": "failed",
                    "error": action_log.error_message,
                }
            ),
            400,
        )


@agents_bp.route("/actions/<int:action_id>/reject", methods=["POST"])
@admin_only_agent_access
def reject_action(action_id):
    """Discard a proposed action."""
    action_log = AgentActionLog.query.get(action_id)
    if not action_log:
        return jsonify({"success": False, "error": f"Action #{action_id} not found."}), 404

    if action_log.status != "proposed":
        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Action #{action_id} has already been {action_log.status}.",
                }
            ),
            400,
        )

    action_log.status = "rejected"
    action_log.updated_at = datetime.now()
    db.session.commit()

    return (
        jsonify(
            {
                "success": True,
                "action_id": action_log.id,
                "status": "rejected",
                "message": f"Action proposal rejected: {action_log.diff_summary}",
            }
        ),
        200,
    )


@agents_bp.route("/actions/<int:action_id>/undo", methods=["POST"])
@admin_only_agent_access
def undo_action(action_id):
    """Restore deleted item(s) from an executed action within the 48-hour recovery window."""
    action_log = AgentActionLog.query.get(action_id)
    if not action_log:
        return jsonify({"success": False, "error": f"Action #{action_id} not found."}), 404

    if action_log.status != "executed":
        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Cannot undo action #{action_id} with status '{action_log.status}'.",
                }
            ),
            400,
        )

    # Check 48-hour recovery window
    if action_log.updated_at:
        elapsed = datetime.now() - action_log.updated_at
        if elapsed > timedelta(hours=48):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "The 48-hour recovery window for this action has expired.",
                    }
                ),
                400,
            )

    try:
        res_data = json.loads(action_log.result_summary) if action_log.result_summary else {}
    except Exception:
        res_data = {}

    from agents.undo_service import UndoService

    if action_log.action_type == "bulk_delete" or "snapshots" in res_data:
        snapshots = res_data.get("snapshots") or []
        if not snapshots:
            return (
                jsonify({"success": False, "error": "No batch snapshots found for this action."}),
                400,
            )
        restore_res = UndoService.restore_batch(snapshots)
    else:
        snapshot = res_data.get("snapshot")
        if not snapshot:
            return (
                jsonify({"success": False, "error": "No snapshot data found for this deletion."}),
                400,
            )
        restore_res = UndoService.restore_snapshot(snapshot)

    if restore_res.get("success"):
        action_log.status = "restored"
        action_log.updated_at = datetime.now()
        db.session.commit()
        return (
            jsonify(
                {
                    "success": True,
                    "action_id": action_log.id,
                    "status": "restored",
                    "message": restore_res.get("message", "Action restored successfully."),
                }
            ),
            200,
        )
    else:
        return (
            jsonify(
                {
                    "success": False,
                    "action_id": action_log.id,
                    "error": restore_res.get("error", "Restoration failed."),
                }
            ),
            400,
        )


# =============================================================================
# CONFIGURATION & USAGE ENDPOINTS
# =============================================================================


@agents_bp.route("/config", methods=["GET"])
@admin_only_agent_access
def get_agent_config():
    """Retrieve LLM provider settings with masked API key and token optimization parameters."""
    config = AgentConfig.query.first()
    if not config:
        config = AgentConfig(
            provider="openai",
            model_name="gpt-4o-mini",
            enabled=True,
            max_tokens_per_response=800,
            max_tool_rounds=3,
            daily_request_limit=100,
        )
        db.session.add(config)
        db.session.commit()

    return jsonify({"success": True, "config": config.to_dict()}), 200


@agents_bp.route("/config", methods=["POST"])
@admin_only_agent_access
def update_agent_config():
    """Update LLM provider, model, base URL, limits, and encrypted API key."""
    data = request.json or {}
    config = AgentConfig.query.first()
    if not config:
        config = AgentConfig()
        db.session.add(config)

    if "provider" in data:
        config.provider = data["provider"]
    if "model_name" in data:
        config.model_name = data["model_name"]
    if "base_url" in data:
        config.base_url = data["base_url"]
    if "enabled" in data:
        config.enabled = bool(data["enabled"])
    if "max_tokens_per_response" in data:
        config.max_tokens_per_response = int(data["max_tokens_per_response"])
    if "max_tool_rounds" in data:
        config.max_tool_rounds = int(data["max_tool_rounds"])
    if "daily_request_limit" in data:
        config.daily_request_limit = int(data["daily_request_limit"])

    # If new API key is provided, encrypt it
    new_key = data.get("api_key")
    if new_key and new_key != "••••••••••••••••":
        config.encrypted_api_key = encrypt_api_key(new_key.strip())

    config.updated_at = datetime.now()
    db.session.commit()

    return (
        jsonify(
            {
                "success": True,
                "message": "AI Agent configuration saved successfully.",
                "config": config.to_dict(),
            }
        ),
        200,
    )


@agents_bp.route("/usage-summary", methods=["GET"])
@admin_only_agent_access
def get_usage_summary():
    """Get live daily request and token usage metrics for the dashboard."""
    config = AgentConfig.query.first()
    daily_limit = config.daily_request_limit if config and config.daily_request_limit else 100
    today_midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    today_logs = AgentActionLog.query.filter(AgentActionLog.created_at >= today_midnight).all()
    today_requests = len(today_logs)
    total_tokens = sum((l.input_tokens or 0) + (l.output_tokens or 0) for l in today_logs)
    total_cost = sum(l.estimated_cost or 0.0 for l in today_logs)

    return (
        jsonify(
            {
                "success": True,
                "today_requests": today_requests,
                "daily_limit": daily_limit,
                "total_tokens_today": total_tokens,
                "total_cost_today": round(total_cost, 6),
            }
        ),
        200,
    )


@agents_bp.route("/test-connection", methods=["POST"])
@admin_only_agent_access
def test_llm_connection():
    """Test connectivity and authentication with the configured LLM provider."""
    data = request.json or {}
    provider = data.get("provider")
    model_name = data.get("model_name")
    base_url = data.get("base_url")
    plain_key = data.get("api_key")

    if not plain_key or plain_key == "••••••••••••••••":
        config = AgentConfig.query.first()
        if config and config.encrypted_api_key:
            plain_key = decrypt_api_key(config.encrypted_api_key)
            if not provider:
                provider = config.provider
            if not model_name:
                model_name = config.model_name
            if not base_url:
                base_url = config.base_url

    if not plain_key:
        return jsonify({"success": False, "error": "API Key is required to test connection."}), 400

    try:
        adapter = get_adapter(provider=provider, api_key=plain_key, base_url=base_url)
        res = adapter.chat(
            messages=[
                {"role": "system", "content": "You are a test helper."},
                {"role": "user", "content": "Respond with 'Connection OK' and nothing else."},
            ],
            model=model_name,
            temperature=0.0,
            max_tokens=15,
        )
        return (
            jsonify(
                {
                    "success": True,
                    "message": f"Connection succeeded! Model '{model_name}' is active and responding.",
                    "provider": provider,
                    "model": model_name,
                    "input_tokens": res.input_tokens,
                    "output_tokens": res.output_tokens,
                    "estimated_cost": res.estimated_cost,
                    "response": res.content,
                }
            ),
            200,
        )
    except Exception as e:
        _log.error("LLM connection test failed: %s", e)
        err_str = str(e)
        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Model '{model_name}' is not responding — check the name with your provider. ({err_str})",
                }
            ),
            400,
        )


@agents_bp.route("/permissions", methods=["GET"])
@admin_only_agent_access
def get_permissions():
    """Get tier permissions for all 7 domain agents."""
    agents = ["billing", "inventory", "product", "worker", "expense", "analytics", "reminder"]
    perms = AgentPermission.query.all()
    perm_map = {p.agent_name: p for p in perms}

    result = []
    for a in agents:
        p = perm_map.get(a)
        default_tier = "full_autonomy" if a in ["analytics", "reminder"] else "suggest_confirm"
        tier = p.tier if p else default_tier
        enabled = p.enabled if p else True

        # Enforce ceiling
        if a in HARDCODED_CONFIRMATION_AGENTS and tier == "full_autonomy":
            tier = "suggest_confirm"

        result.append(
            {
                "agent_name": a,
                "tier": tier,
                "enabled": enabled,
                "is_ceiling_locked": a in HARDCODED_CONFIRMATION_AGENTS,
            }
        )

    return jsonify({"success": True, "permissions": result}), 200


@agents_bp.route("/permissions", methods=["PUT"])
@admin_only_agent_access
def update_permissions():
    """Update permissions matrix for domain agents."""
    data = request.json or {}
    permissions_list = data.get("permissions", [])

    for item in permissions_list:
        agent_name = item.get("agent_name", "").lower().strip()
        tier = item.get("tier", "suggest_confirm")
        enabled = bool(item.get("enabled", True))

        if agent_name in HARDCODED_CONFIRMATION_AGENTS and tier == "full_autonomy":
            tier = "suggest_confirm"

        p = AgentPermission.query.filter_by(agent_name=agent_name).first()
        if not p:
            p = AgentPermission(agent_name=agent_name, tier=tier, enabled=enabled)
            db.session.add(p)
        else:
            p.tier = tier
            p.enabled = enabled
            p.updated_at = datetime.now()

    db.session.commit()
    return jsonify({"success": True, "message": "Agent permissions updated successfully."}), 200


@agents_bp.route("/logs", methods=["GET"])
@admin_only_agent_access
def get_audit_logs():
    """Get searchable, filterable agent audit action logs including token metrics."""
    limit = int(request.args.get("limit", 50))
    agent_filter = request.args.get("agent")
    status_filter = request.args.get("status")

    query = AgentActionLog.query

    if agent_filter:
        query = query.filter_by(agent_name=agent_filter)
    if status_filter:
        query = query.filter_by(status=status_filter)

    logs = query.order_by(AgentActionLog.created_at.desc()).limit(limit).all()

    return jsonify({"success": True, "count": len(logs), "logs": [l.to_dict() for l in logs]}), 200
