"""Centralized AI Error Normalization Module for InfoOS Desktop.

Transforms raw, cryptic, or provider-specific LLM exceptions and HTTP status codes
(e.g., Cloudflare 403s, Google 429 RESOURCE_EXHAUSTED, 503 high-demand spikes,
urllib WinError 10061 connection refused) into structured, user-friendly
NormalizedLLMError objects with actionable recovery hints.
"""

import re
import json
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

_log = logging.getLogger(__name__)

PROVIDER_DISPLAY_NAMES = {
    "openai": "OpenAI",
    "gpt": "OpenAI",
    "anthropic": "Claude (Anthropic)",
    "claude": "Claude (Anthropic)",
    "google": "Google Gemini",
    "gemini": "Google Gemini",
    "xai": "Grok (xAI)",
    "grok": "Grok (xAI)",
    "groq": "Groq",
    "deepseek": "DeepSeek",
    "ollama": "Ollama (Local)",
    "local": "Local Endpoint",
    "custom_openai": "Custom OpenAI-Compatible",
    "custom": "Custom Provider",
}

PROVIDER_CONSOLE_URLS = {
    "openai": "https://platform.openai.com/account/billing",
    "anthropic": "https://console.anthropic.com/settings/plans",
    "google": "https://aistudio.google.com",
    "gemini": "https://aistudio.google.com",
    "xai": "https://console.x.ai",
    "grok": "https://console.x.ai",
    "groq": "https://console.groq.com",
    "deepseek": "https://platform.deepseek.com",
}

SUGGESTED_MODELS = {
    "openai": "gpt-4o-mini, gpt-4o",
    "anthropic": "claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022",
    "google": "gemini-1.5-flash, gemini-2.0-flash",
    "gemini": "gemini-1.5-flash, gemini-2.0-flash",
    "xai": "grok-2-latest, grok-beta",
    "grok": "grok-2-latest, grok-beta",
    "groq": "llama-3.3-70b-versatile, llama-3.1-8b-instant",
    "deepseek": "deepseek-chat, deepseek-reasoner",
    "ollama": "llama3, mistral, phi3",
}


@dataclass
class NormalizedLLMError:
    """Normalized structured error representation for outbound AI calls."""

    category: str
    title: str
    message: str
    action_hint: str
    status_code: int = 400
    provider: Optional[str] = None
    model_name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "title": self.title,
            "message": self.message,
            "action_hint": self.action_hint,
            "status_code": self.status_code,
            "provider": self.provider,
            "model_name": self.model_name,
        }

    def format_user_message(self) -> str:
        """User-facing markdown representation suitable for chat streaming or dialogs."""
        return f"⚠️ **{self.title}**\n\n{self.message}\n\n💡 **Action:** {self.action_hint}"


def _extract_status_code(error: Any) -> Optional[int]:
    """Extract HTTP status code from exception or string representation."""
    if hasattr(error, "code") and isinstance(error.code, int):
        return error.code
    if hasattr(error, "status_code") and isinstance(error.status_code, int):
        return error.status_code

    err_str = str(error)
    match = re.search(r"\b(400|401|402|403|404|408|429|500|502|503|504|529)\b", err_str)
    if match:
        return int(match.group(1))
    return None


def _clean_error_text(err_str: str) -> str:
    """Extract meaningful message from raw JSON error wrappers or HTML."""
    if not err_str:
        return ""

    # Check for embedded JSON payload in error string
    json_match = re.search(r"(\{.*\})", err_str, flags=re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group(1))
            if isinstance(parsed, dict):
                # OpenAI / Anthropic format: {"error": {"message": "..."}}
                err_dict = parsed.get("error")
                if isinstance(err_dict, dict):
                    msg = err_dict.get("message") or err_dict.get("status")
                    if msg:
                        return str(msg).strip()
                elif isinstance(err_dict, str):
                    return err_dict.strip()
                elif "message" in parsed:
                    return str(parsed["message"]).strip()
        except Exception:
            pass

    # Strip HTML tags if HTML page was returned (e.g. Cloudflare)
    stripped = re.sub(r"<[^>]+>", " ", err_str)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    return stripped[:400]


def classify_llm_error(
    error: Any,
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
    base_url: Optional[str] = None,
) -> NormalizedLLMError:
    """Classify and normalize any LLM error into a structured NormalizedLLMError."""
    p_norm = (provider or "openai").lower().strip()
    provider_title = PROVIDER_DISPLAY_NAMES.get(p_norm, provider or "AI Provider")
    console_url = PROVIDER_CONSOLE_URLS.get(p_norm, "your provider's account console")
    model_display = model_name or "default model"
    suggested = SUGGESTED_MODELS.get(p_norm, "standard models for this provider")

    err_str = str(error) if error is not None else "Unknown error"
    status_code = _extract_status_code(error)
    cleaned_msg = _clean_error_text(err_str)
    err_lower = (err_str + " " + cleaned_msg).lower()

    # 1. Base URL missing for custom provider
    if "base url is required" in err_lower or "base_url is required" in err_lower:
        return NormalizedLLMError(
            category="missing_base_url",
            title="Provider Base URL Required",
            message=f"A Base URL endpoint is required to connect to {provider_title}.",
            action_hint="Please enter your provider endpoint (e.g., https://api.together.xyz/v1 or http://localhost:8000/v1) in Settings > AI Agents.",
            status_code=400,
            provider=p_norm,
            model_name=model_name,
        )

    # 2. Cloudflare Bot Protection Block (HTTP 403 with Cloudflare signatures)
    cloudflare_keywords = ["cloudflare", "just a moment...", "cf-ray", "attention required", "challenge-platform"]
    if any(kw in err_lower for kw in cloudflare_keywords) or (status_code == 403 and "cloudflare" in err_lower):
        return NormalizedLLMError(
            category="cloudflare_block",
            title="Request Blocked by Cloudflare Bot Protection",
            message=f"The outbound request to {provider_title} was blocked by Cloudflare security.",
            action_hint="InfoOS Desktop sends standard browser headers. Check that your Base URL is correct or verify your local proxy/VPN settings.",
            status_code=403,
            provider=p_norm,
            model_name=model_name,
        )

    # 3. Rate Limiting (Short-term TPM / RPM throttles: requests/tokens per minute or second)
    rate_limit_keywords = [
        "rate_limit",
        "rate limit",
        "rate-limit",
        "ratelimit",
        "too many requests",
        "requests per minute",
        "requests per second",
        "tokens per minute",
        "queries per minute",
        "per minute",
        "per second",
        "tpm",
        "rpm",
        "qpm",
        "slow down",
        "concurrency limit",
        "concurrent requests",
    ]
    is_rate_limit = (
        (status_code == 429 and any(kw in err_lower for kw in rate_limit_keywords))
        or any(kw in err_lower for kw in ["requests per minute", "tokens per minute", "queries per minute", "rpm", "tpm", "qpm", "slow down"])
    )

    if is_rate_limit:
        return NormalizedLLMError(
            category="rate_limit",
            title=f"{provider_title} Rate Limit Reached",
            message=f"The requests-per-minute (RPM) or token-per-minute limit has been temporarily reached for model '{model_display}'.",
            action_hint="Please wait 30–60 seconds for the rate limit window to reset, or configure a higher-capacity model in Settings > AI Agents.",
            status_code=429,
            provider=p_norm,
            model_name=model_name,
        )

    # 4. Quota / Credits / Billing / Daily Limits Exhausted
    quota_keywords = [
        "insufficient_quota",
        "insufficient quota",
        "resource_exhausted",
        "resource has been exhausted",
        "quota exceeded",
        "quota_exceeded",
        "quota limit",
        "exceeded quota",
        "over quota",
        "check quota",
        "credit balance",
        "credit_balance",
        "credits exhausted",
        "out of credits",
        "insufficient funds",
        "insufficient_funds",
        "insufficient balance",
        "insufficient_balance",
        "billing_disabled",
        "api_key_service_blocked",
        "usage limit",
        "daily limit",
        "requests per day",
        "queries per day",
        "per day",
        "exceeded your current quota",
        "exceeded your budget",
        "budget exceeded",
        "free tier limit",
        "free-tier",
        "plans and billing",
        "billing details",
        "ai limit over",
        "limit over",
        "limit reached",
        "limit exceeded",
        "api limit",
        "google api limit",
        "goghole",
        "billing",
    ]
    is_quota = (
        status_code == 402
        or any(kw in err_lower for kw in quota_keywords)
        or (status_code in [403, 429] and any(kw in err_lower for kw in ["quota", "credit", "balance", "billing", "limit"]))
    )

    if is_quota:
        title = "AI Usage Quota or Credit Limit Reached"
        if p_norm in ["google", "gemini"] or "google" in err_lower or "goghole" in err_lower:
            message = "Your Google Gemini account has exhausted its available token quota, daily request limit, or API credits."
            action_hint = "Free tier daily quotas reset every 24 hours. Check your usage and billing at https://aistudio.google.com, add funds, or switch provider in Settings > AI Agents."
        else:
            message = f"Your {provider_title} account has exhausted its available credits, token quota, or API usage limit."
            action_hint = f"Please check your billing and quota limits at {console_url}, add funds, or switch to another provider in Settings > AI Agents."

        return NormalizedLLMError(
            category="quota_exhausted",
            title=title,
            message=message,
            action_hint=action_hint,
            status_code=429,
            provider=p_norm,
            model_name=model_name,
        )

    # 5. Invalid API Key / Unauthorized (401 or 403 / 400 with invalid key keywords)
    invalid_key_keywords = [
        "invalid_api_key",
        "invalid api key",
        "incorrect api key",
        "incorrect_api_key",
        "api key not valid",
        "api_key_invalid",
        "api_key_not_valid",
        "api key not found",
        "key not found",
        "unauthorized",
        "invalid-argument",
        "invalid argument",
        "authentication failed",
        "authentication_error",
        "permission denied",
        "permission_denied",
        "forbidden",
        "401",
        "key revoked",
        "api key missing",
        "api key is required",
    ]
    is_invalid_key = (
        status_code == 401
        or (status_code in [400, 403] and any(kw in err_lower for kw in invalid_key_keywords))
        or "invalid api key" in err_lower
        or "api key not valid" in err_lower
        or "api key not found" in err_lower
        or "incorrect api key" in err_lower
    )

    if is_invalid_key:
        return NormalizedLLMError(
            category="invalid_key",
            title=f"Invalid {provider_title} API Key",
            message=f"The API key provided for {provider_title} was rejected as invalid, expired, missing, or unauthorized.",
            action_hint=f"Please generate or copy a fresh API key from {console_url} and paste it into Settings > AI Agents.",
            status_code=401,
            provider=p_norm,
            model_name=model_name,
        )

    # 6. Server Busy / Overloaded (HTTP 503, 529, 502, 504)
    server_busy_keywords = [
        "server busy",
        "server is busy",
        "servers are busy",
        "overloaded",
        "high demand",
        "unavailable",
        "the model is overloaded",
        "model is overloaded",
        "model overloaded",
        "service unavailable",
        "service_unavailable",
        "capacity exhausted",
        "capacity error",
        "gateway timeout",
        "bad gateway",
        "temporarily unavailable",
        "internal server error",
    ]
    if status_code in [500, 502, 503, 504, 529] or any(kw in err_lower for kw in server_busy_keywords):
        return NormalizedLLMError(
            category="server_busy",
            title=f"{provider_title} Server Currently Busy",
            message=f"The {provider_title} servers are currently experiencing high demand and could not process your request.",
            action_hint="This is a temporary issue on the provider's servers. Please wait a few moments and retry, or select another provider in Settings.",
            status_code=503,
            provider=p_norm,
            model_name=model_name,
        )

    # 7. Model Not Found / Deprecated (HTTP 404)
    model_not_found_keywords = ["model_not_found", "model not found", "does not exist", "not supported for this endpoint", "unknown model"]
    if status_code == 404 or any(kw in err_lower for kw in model_not_found_keywords):
        return NormalizedLLMError(
            category="model_not_found",
            title=f"AI Model '{model_display}' Not Found",
            message=f"The model identifier '{model_display}' was not recognized or is not available on your {provider_title} account.",
            action_hint=f"Please verify the model name in Settings > AI Agents. Recommended models for {provider_title} include: {suggested}.",
            status_code=404,
            provider=p_norm,
            model_name=model_name,
        )

    # 8. Connection Refused / Host Unreachable
    connection_keywords = [
        "winerror 10061",
        "errno 111",
        "connection refused",
        "failed to establish a new connection",
        "getaddrinfo failed",
        "name or service not known",
        "could not resolve host",
        "target machine actively refused",
        "connection timed out",
        "timed out",
    ]
    if any(kw in err_lower for kw in connection_keywords):
        target = base_url or ("http://localhost:11434" if p_norm in ["ollama", "local"] else provider_title)
        if p_norm in ["ollama", "local"]:
            action = "Make sure Ollama is running on your machine (open a terminal and run 'ollama serve'), and that port 11434 is accessible."
        elif p_norm in ["custom_openai", "custom"]:
            action = f"Verify that your local or remote server at {target} is running and accessible."
        else:
            action = "Please verify your computer's internet connection and proxy/VPN configuration."

        return NormalizedLLMError(
            category="connection_refused",
            title="Cannot Connect to Provider Endpoint",
            message=f"Could not establish a connection to {provider_title} ({target}). Connection was refused or timed out.",
            action_hint=action,
            status_code=502,
            provider=p_norm,
            model_name=model_name,
        )

    # 9. Generic / Unknown Fallback
    fallback_msg = cleaned_msg if cleaned_msg and len(cleaned_msg) < 200 else "The AI provider returned an unexpected error."
    return NormalizedLLMError(
        category="unknown",
        title=f"{provider_title} Request Failed",
        message=fallback_msg,
        action_hint="Check your settings and credentials in Settings > AI Agents, or try again in a few moments.",
        status_code=status_code or 400,
        provider=p_norm,
        model_name=model_name,
    )
