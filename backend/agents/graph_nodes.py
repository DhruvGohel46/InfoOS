"""
Graph node functions for the AgentGraph execution engine.

Each node is a pure function with the signature:
    (state: AgentState, adapter: LLMAdapter) -> Tuple[Optional[str], AgentState]

Return value:
    (next_node_name, updated_state)
    next_node_name is None when the graph should stop (status drives stopping).

Design:
  - No side-effects outside of PermissionGate.dispatch_tool() (which writes to
    AgentActionLog — intentionally kept as-is for AGENT_ACTION_LOG parity).
  - adapter is passed at call time and never stored in state.
  - Every mutation of state produces a new dict copy so checkpoints are clean.
  - Error handling produces the exact same user-facing message format as the
    current try/except blocks in DomainAgent.run_stream().
"""

import copy
import json
import logging
from typing import Optional, Tuple, List, Dict, Any

from agents.graph_state import AgentState
from agents.llm_adapter import LLMAdapter
from agents.permission_gate import PermissionGate
from agents.status_labels import (
    get_status_label,
    get_step_human_summary,
    SYNTHESIS_LABEL,
    LLM_CALL_LABEL,
)

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_tool_calls(tool_calls) -> List[Dict[str, Any]]:
    """Convert ToolCall dataclass list into JSON-serializable dicts."""
    return [{"id": tc.id, "name": tc.name, "args": tc.args} for tc in tool_calls]


def _build_tool_call_message(content: Optional[str], tool_calls_raw: List[Dict]) -> Dict:
    """Build the assistant stub message that must precede tool results."""
    if content:
        return {"role": "assistant", "content": content}
    first_name = tool_calls_raw[0]["name"] if tool_calls_raw else "tool"
    return {"role": "assistant", "content": f"I am executing the tool {first_name}..."}


# ---------------------------------------------------------------------------
# Node: call_llm
# ---------------------------------------------------------------------------


def node_call_llm(
    state: AgentState,
    adapter: LLMAdapter,
) -> Tuple[Optional[str], AgentState]:
    """
    Calls adapter.chat() with the current message history and accumulates
    token/cost totals into state. Stores the response for the check_tool_calls
    node to inspect.

    On exception: sets status="error" and returns (None, state) — the caller
    saves the checkpoint and surfaces the error to the user.

    Error message format mirrors DomainAgent.run_stream()'s try/except block.
    """
    state = copy.deepcopy(state)

    try:
        res = adapter.chat(
            messages=state["messages"],
            tools=state["tools"] or None,
            model=state["model_name"],
            max_tokens=state["max_tokens"],
        )
    except Exception as e:
        _log.error("LLM call failed for %s agent (graph): %s", state.get("agent_name"), e)
        state["status"] = "error"
        state["error"] = (
            f"I encountered an error connecting to your AI provider: {str(e)}. "
            "Please check your API key and network connection in Settings > AI Agents."
        )
        return (None, state)

    # Accumulate tokens (parity requirement: same arithmetic as run_stream)
    state["total_input_tokens"] += res.input_tokens
    state["total_output_tokens"] += res.output_tokens
    state["total_estimated_cost"] += res.estimated_cost

    # Serialize response into state (no live objects)
    state["last_llm_response_content"] = res.content
    state["tool_calls_pending"] = _serialize_tool_calls(res.tool_calls)

    return ("check_tool_calls", state)


# ---------------------------------------------------------------------------
# Node: check_tool_calls
# ---------------------------------------------------------------------------


def node_check_tool_calls(
    state: AgentState,
    adapter: LLMAdapter,  # noqa: ARG001 — signature contract
) -> Tuple[Optional[str], AgentState]:
    """
    Inspects the pending tool calls from the last LLM response.

    - No tool calls → produce final_response from last_llm_response_content,
      set status="done".
    - max_tool_rounds exceeded → same fallback text as run_stream()'s else branch,
      status="done".
    - Tool calls present and rounds left → route to dispatch_tool.
    """
    state = copy.deepcopy(state)

    tool_calls = state.get("tool_calls_pending") or []
    current_round = state.get("current_round", 0)
    max_rounds = state.get("max_tool_rounds", 3)

    if not tool_calls:
        # No tool calls — synthesize from LLM text
        final_text = state.get("last_llm_response_content") or (
            f"I have prepared the action for your approval: "
            f"{state['pending_actions'][0].get('diff_summary')}"
            if state.get("pending_actions")
            else "I have processed your request."
        )
        state["final_response"] = final_text
        state["status"] = "done"
        return (None, state)

    if current_round >= max_rounds:
        # max_tool_rounds ceiling — same fallback as run_stream()
        pending = state.get("pending_actions") or []
        final_text = state.get("last_llm_response_content") or (
            f"I have prepared the action for your approval: " f"{pending[0].get('diff_summary')}"
            if pending
            else "I have processed your request."
        )
        state["final_response"] = final_text
        state["status"] = "done"
        return (None, state)

    # Tool calls present and rounds available — enter dispatch loop
    return ("dispatch_tool", state)


# ---------------------------------------------------------------------------
# Node: dispatch_tool
# ---------------------------------------------------------------------------


def node_dispatch_tool(
    state: AgentState,
    adapter: LLMAdapter,  # noqa: ARG001
) -> Tuple[Optional[str], AgentState]:
    """
    Pops one tool call from tool_calls_pending and dispatches it through
    PermissionGate.

    Two outcomes:
      - status "proposed" → pause graph, set status="waiting_approval",
        store dispatch_res in pending_tool_call, current_node="dispatch_tool"
        so resume re-enters here for the next remaining tool call.
      - status "executed" / read-only result → append to executed_actions /
        steps, add result to messages via the next node.

    After dispatching, if tool_calls_pending is now empty, advance to
    append_tool_result. Otherwise loop back to dispatch_tool for the next call.

    This faithfully replicates the `for tc in res.tool_calls:` loop in
    run_stream() while making each dispatch a discrete checkpointable unit.
    """
    state = copy.deepcopy(state)

    tool_calls = state.get("tool_calls_pending") or []
    if not tool_calls:
        # Shouldn't happen — safety exit
        return ("append_tool_result", state)

    # Pop the first pending tool call
    tc = tool_calls[0]
    remaining = tool_calls[1:]
    state["tool_calls_pending"] = remaining

    tool_name = tc["name"]
    tool_args = tc["args"]
    tool_id = tc["id"]

    _log.info(
        "Agent %s dispatching tool %s with args %s (round %s/%s) [graph]",
        state.get("agent_name"),
        tool_name,
        tool_args,
        state.get("current_round", 0) + 1,
        state.get("max_tool_rounds", 3),
    )

    dispatch_res = PermissionGate.dispatch_tool(
        agent_name=state["agent_name"],
        tool_name=tool_name,
        args=tool_args,
        actor_sub=state["actor_sub"],
        user_message=state["user_message"],
    )

    # Build step record (same shape as run_stream())
    step_title, step_desc = get_step_human_summary(tool_name, tool_args)
    step = {
        "title": step_title,
        "details": step_desc,
        "tool": tool_name,
        "status": "completed",
    }
    state["steps"].append(step)

    if dispatch_res.get("status") == "proposed":
        # ── PAUSE POINT ──────────────────────────────────────────────────
        # The action_id from PermissionGate is the stable key for the checkpoint.
        # Set conversation_id now (may be empty on first proposal this turn).
        action_id = dispatch_res.get("action_id")
        if action_id and not state.get("conversation_id"):
            state["conversation_id"] = str(action_id)

        # Store the full dispatch result; the approved/rejected flow will
        # execute or skip it via GRAPH.resume().
        state["pending_actions"].append(dispatch_res)
        state["pending_tool_call"] = {
            **dispatch_res,
            "_tc": tc,  # keep original tc for message reconstruction
        }
        # We also append a tool message NOW so that when the graph resumes,
        # append_tool_result has the correct follow-up context. The content
        # is the raw dispatch_res JSON, exactly as run_stream() does.
        tool_msg = {
            "role": "tool",
            "name": tool_name,
            "tool_call_id": tool_id,
            "content": json.dumps(dispatch_res),
            "_pending": True,  # marker so append_tool_result knows to include proposal notice
        }
        # Store pending tool message separately to be appended on resume
        state["pending_tool_call"]["_tool_message"] = tool_msg

        state["status"] = "waiting_approval"
        state["current_node"] = "dispatch_tool"
        return (None, state)

    elif dispatch_res.get("status") == "executed":
        state["executed_actions"].append(dispatch_res)

    # ── Append tool result message (will be used in append_tool_result) ──
    # We accumulate tool result messages on state["messages"] directly here,
    # so append_tool_result finds them and builds follow_up_messages correctly.
    tool_result_msg = {
        "role": "tool",
        "name": tool_name,
        "tool_call_id": tool_id,
        "content": json.dumps(dispatch_res),
    }
    # We stash pending tool messages in a dedicated key to be flushed by
    # append_tool_result, keeping message history clean.
    pending_msgs = state.get("_pending_tool_messages") or []
    pending_msgs.append(tool_result_msg)
    state["_pending_tool_messages"] = pending_msgs

    if remaining:
        # More tool calls to dispatch — loop back
        return ("dispatch_tool", state)

    return ("append_tool_result", state)


# ---------------------------------------------------------------------------
# Node: append_tool_result
# ---------------------------------------------------------------------------


def node_append_tool_result(
    state: AgentState,
    adapter: LLMAdapter,
) -> Tuple[Optional[str], AgentState]:
    """
    Constructs the follow-up message list and makes the synthesis LLM call,
    exactly replicating run_stream()'s follow_up_messages construction and
    second_res = adapter.chat(...) call.

    On exception: logs the error and breaks out to produce a partial final
    response, mirroring run_stream()'s `except Exception: break` behavior.

    After synthesis:
      - Increments current_round.
      - Puts the synthesis response's tool_calls_pending back into state.
      - Routes to check_tool_calls for the next round.
    """
    state = copy.deepcopy(state)

    has_pending = bool(state.get("pending_actions"))
    pending_tool_msgs = state.get("_pending_tool_messages") or []
    last_content = state.get("last_llm_response_content")
    tool_calls_dispatched_this_round = state.get("tool_calls_pending") or []
    # tool_calls_pending is empty at this point (all dispatched)

    # Build follow_up_messages exactly as run_stream() does
    follow_up_messages = list(state["messages"])

    # Append assistant stub (mirrors run_stream() lines 377-385)
    all_tcs = state.get("_dispatched_tool_calls_this_round") or pending_tool_msgs
    first_name = pending_tool_msgs[0].get("name") if pending_tool_msgs else "tool"
    if last_content:
        follow_up_messages.append({"role": "assistant", "content": last_content})
    else:
        follow_up_messages.append(
            {"role": "assistant", "content": f"I am executing the tool {first_name}..."}
        )

    # Append tool result messages with synthesis instructions (mirrors run_stream() lines 387-411)
    for tm in pending_tool_msgs:
        if has_pending:
            synth_content = (
                f"[Tool Result for '{tm['name']}']:\n{tm['content']}\n\n"
                "CRITICAL INSTRUCTION - ACTION PROPOSAL GENERATED (NOT YET SAVED/EXECUTED):\n"
                "An action proposal has been staged and is waiting for the user's explicit confirmation via the 'Approve & Apply' button.\n"
                "- You MUST NOT claim that the action is completed, recorded, saved, or logged.\n"
                "- State in the insight_block: 'Action proposal prepared. Please review the details and click Approve & Apply below to save changes to the database.'\n"
                "- Synthesize a clean, structured JSON object adhering strictly to the specified schema."
            )
        else:
            synth_content = (
                f"[Tool Result for '{tm['name']}']:\n{tm['content']}\n\n"
                "Please synthesize your answer for the shop owner as a clean, structured JSON object adhering strictly to the specified schema:\n"
                "- No raw markdown, no '###', no '---', no pipe-tables, and no emoji characters. Use typed sections ('metric_list', 'insight_block', 'action_list', 'table') with icon enums.\n"
                "- If no mutating tool was executed, DO NOT claim that any database change was made.\n"
                "- Always include an 'insight_block' with icon 'ai_review' offering intelligent store recommendations."
            )
        follow_up_messages.append({"role": "user", "content": synth_content})

    # Clear flushed pending tool messages
    state["_pending_tool_messages"] = []

    # Make the follow-up / synthesis LLM call (mirrors run_stream() lines 415-425)
    tools_to_pass = (
        None
        if (has_pending or (state.get("current_round", 0) + 1 >= state.get("max_tool_rounds", 3)))
        else (state.get("tools") or None)
    )
    try:
        second_res = adapter.chat(
            messages=follow_up_messages,
            tools=tools_to_pass,
            model=state["model_name"],
            max_tokens=state["max_tokens"],
        )
        state["total_input_tokens"] += second_res.input_tokens
        state["total_output_tokens"] += second_res.output_tokens
        state["total_estimated_cost"] += second_res.estimated_cost

        state["last_llm_response_content"] = second_res.content
        state["tool_calls_pending"] = _serialize_tool_calls(second_res.tool_calls)

        # Update messages to follow-up context for next round
        state["messages"] = follow_up_messages

    except Exception as e:
        _log.error(
            "Follow-up LLM turn failed for %s agent (graph): %s",
            state.get("agent_name"),
            e,
        )
        # Mirror run_stream()'s `except Exception: break` — emit whatever we have
        state["tool_calls_pending"] = []

    # Increment round counter
    state["current_round"] = state.get("current_round", 0) + 1

    # Route back to check_tool_calls for next iteration
    return ("check_tool_calls", state)
