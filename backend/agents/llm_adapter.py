import json
import logging
import urllib.request
import urllib.error
import ssl
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from agents.pricing import calculate_cost

_log = logging.getLogger(__name__)


@dataclass
class ToolCall:
    id: str
    name: str
    args: Dict[str, Any]


@dataclass
class AgentResponse:
    content: Optional[str] = None
    tool_calls: List[ToolCall] = field(default_factory=list)
    finish_reason: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost: float = 0.0
    raw: Optional[Dict[str, Any]] = None


class LLMAdapterError(Exception):
    """Raised when an outbound LLM request fails or times out."""

    pass


def _log_raw_llm_request(provider: str, model: str, payload: Dict[str, Any]):
    try:
        _log.info(
            "RAW LLM REQUEST [%s - %s]: %s", provider, model, json.dumps(payload, default=str)
        )
    except Exception as e:
        _log.warning("Failed to log raw LLM request: %s", e)


def _log_raw_llm_response(provider: str, model: str, res_data: Dict[str, Any]):
    try:
        _log.info(
            "RAW LLM RESPONSE [%s - %s]: %s", provider, model, json.dumps(res_data, default=str)
        )
    except Exception as e:
        _log.warning("Failed to log raw LLM response: %s", e)


def _clean_llm_content(content: Optional[str]) -> Optional[str]:
    if not content or not isinstance(content, str):
        return content
    import re

    cleaned = content.strip()
    # Strip <thought>...</thought> tags from reasoning models (e.g. DeepSeek-R1)
    cleaned = re.sub(r"<thought>[\s\S]*?</thought>", "", cleaned, flags=re.DOTALL).strip()
    # Strip thought{ or thought\n{ prefixes
    if cleaned.startswith("thought{"):
        cleaned = "{" + cleaned[8:].lstrip()
    elif cleaned.startswith("thought\n{") or cleaned.startswith("thought:\n{"):
        cleaned = "{" + cleaned.split("{", 1)[1]
    elif cleaned.lower().startswith("thought:") or cleaned.lower().startswith("thought\n"):
        cleaned = cleaned.split("\n", 1)[1].strip()
    return cleaned


class LLMAdapter:
    """Base abstract adapter for BYO-Key LLM providers."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: int = 35):
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AgentResponse:
        raise NotImplementedError


class OpenAIAdapter(LLMAdapter):
    """Adapter for OpenAI (and OpenAI-compatible) endpoints with function calling."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: int = 35):
        super().__init__(api_key, base_url or "https://api.openai.com/v1", timeout)

    def _normalize_tools(
        self, tools: Optional[List[Dict[str, Any]]]
    ) -> Optional[List[Dict[str, Any]]]:
        if not tools:
            return None
        formatted = []
        for t in tools:
            if "type" in t and t["type"] == "function":
                formatted.append(t)
            else:
                formatted.append(
                    {
                        "type": "function",
                        "function": {
                            "name": t.get("name"),
                            "description": t.get("description", ""),
                            "parameters": t.get("parameters", {"type": "object", "properties": {}}),
                        },
                    }
                )
        return formatted

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AgentResponse:
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        use_model = model or "gpt-4o-mini"

        payload = {
            "model": use_model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        norm_tools = self._normalize_tools(tools)
        if norm_tools:
            payload["tools"] = norm_tools
            payload["tool_choice"] = "auto"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            _log_raw_llm_request("openai", use_model, payload)
            req = urllib.request.Request(
                endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
            )
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                res_data = json.loads(response.read().decode("utf-8"))
            _log_raw_llm_response("openai", use_model, res_data)

            choice = res_data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            content = msg.get("content")
            raw_tool_calls = msg.get("tool_calls", [])

            # Extract token usage
            usage = res_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            cost = calculate_cost("openai", use_model, input_tokens, output_tokens)

            tool_calls = []
            for tc in raw_tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    parsed_args = {}
                tool_calls.append(ToolCall(id=tc.get("id", name), name=name, args=parsed_args))

            return AgentResponse(
                content=_clean_llm_content(content),
                tool_calls=tool_calls,
                finish_reason=choice.get("finish_reason"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost=cost,
                raw=res_data,
            )
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            _log.error("OpenAI API HTTPError %s: %s", e.code, err_body)
            raise LLMAdapterError(f"OpenAI API Error ({e.code}): {err_body}")
        except Exception as e:
            _log.error("OpenAI request failed: %s", e)
            raise LLMAdapterError(f"OpenAI request failed: {str(e)}")


class OpenAICompatibleAdapter(OpenAIAdapter):
    """Adapter for self-hosted / local or 3rd party OpenAI-compatible endpoints."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: int = 35):
        clean_url = (base_url or "http://localhost:11434/v1").rstrip("/")
        super().__init__(api_key or "sk-local", clean_url, timeout)


class AnthropicAdapter(LLMAdapter):
    """Adapter for Anthropic Claude messages API with native tool_use."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: int = 35):
        super().__init__(api_key, base_url or "https://api.anthropic.com/v1", timeout)

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AgentResponse:
        endpoint = f"{self.base_url.rstrip('/')}/messages"
        use_model = model or "claude-3-5-sonnet-20241022"

        # Separate system message if present
        system_prompt = None
        filtered_messages = []
        for m in messages:
            if m.get("role") == "system":
                system_prompt = m.get("content")
            else:
                filtered_messages.append(m)

        # Convert tool format for Anthropic
        anthropic_tools = None
        if tools:
            anthropic_tools = []
            for t in tools:
                if "function" in t:
                    fn = t["function"]
                    anthropic_tools.append(
                        {
                            "name": fn.get("name"),
                            "description": fn.get("description", ""),
                            "input_schema": fn.get(
                                "parameters", {"type": "object", "properties": {}}
                            ),
                        }
                    )
                else:
                    anthropic_tools.append(
                        {
                            "name": t.get("name"),
                            "description": t.get("description", ""),
                            "input_schema": t.get(
                                "parameters", {"type": "object", "properties": {}}
                            ),
                        }
                    )

        payload = {
            "model": use_model,
            "max_tokens": max_tokens or 1024,
            "messages": filtered_messages,
            "temperature": temperature,
        }
        if system_prompt:
            payload["system"] = system_prompt
        if anthropic_tools:
            payload["tools"] = anthropic_tools

        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }

        try:
            _log_raw_llm_request("anthropic", use_model, payload)
            req = urllib.request.Request(
                endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
            )
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                res_data = json.loads(response.read().decode("utf-8"))
            _log_raw_llm_response("anthropic", use_model, res_data)

            content_blocks = res_data.get("content", [])
            text_pieces = []
            tool_calls = []

            for block in content_blocks:
                b_type = block.get("type")
                if b_type == "text":
                    text_pieces.append(block.get("text", ""))
                elif b_type == "tool_use":
                    tool_calls.append(
                        ToolCall(
                            id=block.get("id", block.get("name")),
                            name=block.get("name"),
                            args=block.get("input", {}),
                        )
                    )

            usage = res_data.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            cost = calculate_cost("anthropic", use_model, input_tokens, output_tokens)

            content_str = "\n".join(text_pieces) if text_pieces else None
            return AgentResponse(
                content=_clean_llm_content(content_str),
                tool_calls=tool_calls,
                finish_reason=res_data.get("stop_reason"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost=cost,
                raw=res_data,
            )
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            _log.error("Anthropic API HTTPError %s: %s", e.code, err_body)
            raise LLMAdapterError(f"Anthropic API Error ({e.code}): {err_body}")
        except Exception as e:
            _log.error("Anthropic request failed: %s", e)
            raise LLMAdapterError(f"Anthropic request failed: {str(e)}")


class GoogleAdapter(LLMAdapter):
    """Adapter for Google Gemini API."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: int = 35):
        super().__init__(
            api_key, base_url or "https://generativelanguage.googleapis.com/v1beta", timeout
        )

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
    ) -> AgentResponse:
        import time
        import re

        use_model = model or "gemini-3.8-flash"
        # Auto-migrate deprecated models to supported production model
        if use_model in [
            "gemini-1.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
            "gemini-2.0-pro",
        ]:
            use_model = "gemini-3.8-flash"

        endpoint = (
            f"{self.base_url.rstrip('/')}/models/{use_model}:generateContent?key={self.api_key}"
        )

        contents = []
        system_instruction = None

        for m in messages:
            role = m.get("role")
            text = m.get("content") or ""
            if role == "system":
                system_instruction = {"parts": [{"text": text}]}
            elif role in ["user", "human"]:
                contents.append({"role": "user", "parts": [{"text": text}]})
            elif role in ["assistant", "model"]:
                contents.append({"role": "model", "parts": [{"text": text}]})

        # Ensure adequate tokens for structured JSON cards (at least 2048)
        output_tokens_limit = max(max_tokens or 2048, 2048)

        gen_config: Dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": output_tokens_limit,
            # Turn off internal thoughts so thinking tokens do not consume response token budget
            "thinkingConfig": {"thinkingBudget": 0},
        }

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": gen_config,
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        # Function declarations
        if tools:
            declarations = []
            for t in tools:
                fn = t.get("function", t)
                declarations.append(
                    {
                        "name": fn.get("name"),
                        "description": fn.get("description", ""),
                        "parameters": fn.get("parameters", {"type": "OBJECT", "properties": {}}),
                    }
                )
            payload["tools"] = [{"functionDeclarations": declarations}]

        headers = {"Content-Type": "application/json"}
        ctx = ssl.create_default_context()

        last_err = None
        for attempt in range(2):
            try:
                _log_raw_llm_request("google", use_model, payload)
                req = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                _log_raw_llm_response("google", use_model, res_data)

                candidates = res_data.get("candidates", [{}])
                if not candidates:
                    return AgentResponse(content="No response received from Google Gemini.")

                candidate = candidates[0]
                content_obj = candidate.get("content", {})
                parts = content_obj.get("parts", [])

                text_pieces = []
                tool_calls = []

                for p in parts:
                    if "text" in p:
                        # Skip thinking/reasoning parts to prevent leaking thought tokens
                        if p.get("thought"):
                            continue
                        text_pieces.append(p["text"])
                    elif "functionCall" in p:
                        fc = p["functionCall"]
                        name = fc.get("name")
                        args = fc.get("args", {})
                        tool_calls.append(ToolCall(id=name, name=name, args=args))

                usage_meta = res_data.get("usageMetadata", {})
                input_tokens = usage_meta.get("promptTokenCount", 0)
                output_tokens = usage_meta.get("candidatesTokenCount", 0)
                cost = calculate_cost("google", use_model, input_tokens, output_tokens)

                content_str = "\n".join(text_pieces) if text_pieces else None
                if content_str:
                    # Strip any internal thought wrappers
                    content_str = re.sub(
                        r"<thought>[\s\S]*?</thought>", "", content_str, flags=re.DOTALL
                    ).strip()
                    if content_str.startswith("thought{"):
                        content_str = "{" + content_str[8:].lstrip()
                    elif content_str.startswith("thought\n{") or content_str.startswith("thought:\n{"):
                        content_str = "{" + content_str.split("{", 1)[1]
                    elif content_str.lower().startswith("thought:") or content_str.lower().startswith("thought\n"):
                        content_str = content_str.split("\n", 1)[1].strip()

                return AgentResponse(
                    content=content_str,
                    tool_calls=tool_calls,
                    finish_reason=candidate.get("finishReason"),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost=cost,
                    raw=res_data,
                )
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                _log.error("Google Gemini API HTTPError %s: %s (attempt %d/2)", e.code, err_body, attempt + 1)
                last_err = f"Google Gemini API Error ({e.code}): {err_body}"
                # If thinkingConfig was rejected with 400, retry without thinkingConfig
                if e.code == 400 and "thinkingConfig" in err_body and "thinkingConfig" in payload.get("generationConfig", {}):
                    payload["generationConfig"].pop("thinkingConfig", None)
                    continue
                # Retry once on 503 Service Unavailable or 429
                if attempt == 0 and e.code in [503, 429]:
                    time.sleep(1.0)
                    continue
                raise LLMAdapterError(last_err)
            except Exception as e:
                _log.error("Google Gemini request failed: %s", e)
                last_err = f"Google Gemini request failed: {str(e)}"
                if attempt == 0:
                    time.sleep(1.0)
                    continue
                raise LLMAdapterError(last_err)

        raise LLMAdapterError(last_err or "Google Gemini call failed.")


def get_adapter(provider: str, api_key: str, base_url: Optional[str] = None) -> LLMAdapter:
    """Factory to obtain the configured provider adapter."""
    p = (provider or "openai").lower().strip()
    if p in ["openai", "gpt"]:
        return OpenAIAdapter(api_key=api_key, base_url=base_url)
    elif p in ["anthropic", "claude"]:
        return AnthropicAdapter(api_key=api_key, base_url=base_url)
    elif p in ["google", "gemini"]:
        return GoogleAdapter(api_key=api_key, base_url=base_url)
    elif p in ["custom", "custom_openai", "local", "ollama", "groq", "deepseek"]:
        return OpenAICompatibleAdapter(api_key=api_key, base_url=base_url)
    else:
        # Default fallback to OpenAICompatibleAdapter
        return OpenAICompatibleAdapter(api_key=api_key, base_url=base_url)
