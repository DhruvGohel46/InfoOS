"""Unit and integration tests for Multi-Provider LLM Adapters, Grok/xAI integration,
Silent Localhost Fallback Prevention, Key Isolation on Provider Switch, and Centralized
Error Normalization.
"""

import pytest
from unittest.mock import patch, MagicMock
from agents.llm_adapter import (
    get_adapter,
    OpenAIAdapter,
    OpenAICompatibleAdapter,
    AnthropicAdapter,
    GoogleAdapter,
    LLMAdapterError,
    DEFAULT_USER_AGENT,
)
from agents.error_normalizer import classify_llm_error, NormalizedLLMError
from agents.pricing import calculate_cost
from agents.crypto_utils import encrypt_api_key, decrypt_api_key, mask_api_key, _get_key_file_path
from config import Config
from models import db, AgentConfig


@pytest.fixture
def app_client(app):
    with app.app_context():
        db.create_all()
        yield app.test_client()


# =============================================================================
# 1. Grok (xAI) & Provider Factory Tests
# =============================================================================


def test_get_adapter_xai_and_grok():
    """Verify xai and grok map to OpenAICompatibleAdapter with default endpoint."""
    adapter_xai = get_adapter(provider="xai", api_key="xai-test-key-123")
    assert isinstance(adapter_xai, OpenAICompatibleAdapter)
    assert adapter_xai.base_url == "https://api.x.ai/v1"
    assert adapter_xai.api_key == "xai-test-key-123"
    assert adapter_xai.provider == "xai"

    adapter_grok = get_adapter(provider="grok", api_key="xai-test-key-456")
    assert isinstance(adapter_grok, OpenAICompatibleAdapter)
    assert adapter_grok.base_url == "https://api.x.ai/v1"
    assert adapter_grok.provider == "xai"

    # Custom base_url override still respected
    adapter_custom = get_adapter(
        provider="xai", api_key="xai-key", base_url="https://custom.xai.endpoint/v1"
    )
    assert adapter_custom.base_url == "https://custom.xai.endpoint/v1"


def test_pricing_for_grok_models():
    """Verify token pricing table includes Grok models."""
    cost_latest = calculate_cost("xai", "grok-2-latest", 1_000_000, 1_000_000)
    assert cost_latest == pytest.approx(12.00, rel=1e-3)

    cost_beta = calculate_cost("xai", "grok-beta", 1_000_000, 1_000_000)
    assert cost_beta == pytest.approx(20.00, rel=1e-3)


# =============================================================================
# 2. Silent Localhost Fallback Prevention
# =============================================================================


def test_custom_openai_requires_base_url():
    """Custom OpenAI provider must NOT silently default to localhost:11434."""
    with pytest.raises(LLMAdapterError) as exc_info:
        get_adapter(provider="custom_openai", api_key="sk-custom-key", base_url=None)
    assert "Base URL is required" in str(exc_info.value)

    with pytest.raises(LLMAdapterError) as exc_info2:
        get_adapter(provider="custom", api_key="sk-custom-key", base_url="")
    assert "Base URL is required" in str(exc_info2.value)


def test_ollama_defaults_to_localhost():
    """Ollama/local explicitly defaults to localhost:11434."""
    adapter = get_adapter(provider="ollama", api_key=None, base_url=None)
    assert adapter.base_url == "http://localhost:11434/v1"
    assert adapter.provider == "ollama"


# =============================================================================
# 3. User-Agent Headers (Cloudflare Bot Protection Bypass)
# =============================================================================


def test_all_adapters_include_desktop_user_agent():
    """All HTTP requests from adapters must set InfoOS desktop User-Agent."""
    assert DEFAULT_USER_AGENT.startswith("InfoOS-Desktop/")

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"choices": [{"message": {"content": "OK"}}], "usage": {}}'
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        # Test OpenAI / OpenAICompatible
        adapter_xai = get_adapter(provider="xai", api_key="xai-test-key")
        adapter_xai.chat(messages=[{"role": "user", "content": "hi"}], model="grok-2-latest")
        req_xai = mock_urlopen.call_args[0][0]
        assert req_xai.get_header("User-agent") == DEFAULT_USER_AGENT

        # Test Anthropic
        mock_resp.read.return_value = b'{"content": [{"type": "text", "text": "OK"}], "usage": {}}'
        adapter_ant = get_adapter(provider="anthropic", api_key="sk-ant-test")
        adapter_ant.chat(messages=[{"role": "user", "content": "hi"}], model="claude-3-5-sonnet")
        req_ant = mock_urlopen.call_args[0][0]
        assert req_ant.get_header("User-agent") == DEFAULT_USER_AGENT

        # Test Google Gemini
        mock_resp.read.return_value = (
            b'{"candidates": [{"content": {"parts": [{"text": "OK"}]}}], "usageMetadata": {}}'
        )
        adapter_goog = get_adapter(provider="google", api_key="goog-test-key")
        adapter_goog.chat(messages=[{"role": "user", "content": "hi"}], model="gemini-2.0-flash")
        req_goog = mock_urlopen.call_args[0][0]
        assert req_goog.get_header("User-agent") == DEFAULT_USER_AGENT
        assert "models/gemini-2.0-flash:generateContent" in req_goog.full_url


# =============================================================================
# 4. Gemini Model Rewriting Removal
# =============================================================================


def test_google_adapter_preserves_selected_model():
    """GoogleAdapter must NOT coerce models to gemini-3.8-flash."""
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.read.return_value = (
            b'{"candidates": [{"content": {"parts": [{"text": "Hello"}]}}], "usageMetadata": {}}'
        )
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        adapter = GoogleAdapter(api_key="test-key")

        # Test gemini-1.5-flash
        adapter.chat(messages=[{"role": "user", "content": "hi"}], model="gemini-1.5-flash")
        req1 = mock_urlopen.call_args[0][0]
        assert "gemini-1.5-flash" in req1.full_url
        assert "gemini-3.8-flash" not in req1.full_url

        # Test gemini-2.0-flash
        adapter.chat(messages=[{"role": "user", "content": "hi"}], model="gemini-2.0-flash")
        req2 = mock_urlopen.call_args[0][0]
        assert "gemini-2.0-flash" in req2.full_url


# =============================================================================
# 5. Provider-Switch Key Isolation
# =============================================================================


def test_provider_switch_blocks_masked_key_cross_contamination(app_client):
    """When switching provider, sending masked key of previous provider is rejected."""
    # 1. Setup config with google provider and a google key
    config = AgentConfig.query.first()
    if not config:
        config = AgentConfig(provider="google", model_name="gemini-1.5-flash")
        db.session.add(config)
    else:
        config.provider = "google"
        config.model_name = "gemini-1.5-flash"
    config.encrypted_api_key = encrypt_api_key("AIzaSy-google-key-secret")
    db.session.commit()

    # 2. Call test-connection for xai using masked key
    res = app_client.post(
        "/api/agents/test-connection",
        json={
            "provider": "xai",
            "model_name": "grok-2-latest",
            "api_key": "••••••••••••••••",
        },
    )
    assert res.status_code == 400
    data = res.get_json()
    assert data["success"] is False
    assert "stored API key belongs to 'google'" in data["error"]
    assert "Please enter an API key for xai" in data["error"]
    assert data["category"] == "invalid_key"


def test_update_config_provider_switch_clears_stale_key(app_client):
    """Saving a new provider without a new API key clears the old provider's key."""
    config = AgentConfig.query.first()
    config.provider = "google"
    config.encrypted_api_key = encrypt_api_key("old-google-key")
    db.session.commit()

    # Update to xai without providing a new key
    res = app_client.post(
        "/api/agents/config",
        json={
            "provider": "xai",
            "model_name": "grok-2-latest",
            "api_key": "••••••••••••••••",
        },
    )
    assert res.status_code == 200
    db.session.refresh(config)
    assert config.provider == "xai"
    assert config.encrypted_api_key == ""
    assert config.to_dict()["has_api_key"] is False


# =============================================================================
# 6. Centralized Error Normalization Tests
# =============================================================================


def test_classify_quota_exhausted_gemini():
    """Google 429 RESOURCE_EXHAUSTED must classify as quota_exhausted."""
    raw_err = (
        'Google Gemini API Error (429): {"error": {"code": 429, '
        "\"message\": \"RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Queries' and limit 'Queries per day'\", "
        '"status": "RESOURCE_EXHAUSTED"}}'
    )
    norm = classify_llm_error(raw_err, provider="google", model_name="gemini-1.5-flash")
    assert norm.category == "quota_exhausted"
    assert norm.title == "AI Usage Quota or Credit Limit Reached"
    assert "Google Gemini" in norm.message
    assert "aistudio.google.com" in norm.action_hint
    assert norm.status_code == 429


def test_classify_quota_exhausted_openai_and_grok():
    """OpenAI / Grok 429 or 403 insufficient_quota must classify as quota_exhausted."""
    raw_err = (
        'OpenAI API Error (429): {"error": {"message": "You exceeded your current quota, please check your plan and billing details.", '
        '"type": "insufficient_quota", "code": "insufficient_quota"}}'
    )
    norm = classify_llm_error(raw_err, provider="xai", model_name="grok-2-latest")
    assert norm.category == "quota_exhausted"
    assert norm.title == "AI Usage Quota or Credit Limit Reached"
    assert "Grok (xAI)" in norm.message
    assert "console.x.ai" in norm.action_hint


def test_classify_rate_limit_temporary():
    """Temporary TPM/RPM rate limit without quota exhaustion keywords."""
    raw_err = "OpenAI API Error (429): Rate limit reached for requests per minute (RPM). Please slow down."
    norm = classify_llm_error(raw_err, provider="openai", model_name="gpt-4o-mini")
    assert norm.category == "rate_limit"
    assert "Rate Limit Reached" in norm.title
    assert "30–60 seconds" in norm.action_hint
    assert norm.status_code == 429


def test_classify_invalid_api_key():
    """HTTP 401 or invalid API key message must classify as invalid_key."""
    raw_err = 'Anthropic API Error (401): {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}'
    norm = classify_llm_error(raw_err, provider="anthropic", model_name="claude-3-5-sonnet")
    assert norm.category == "invalid_key"
    assert "Invalid Claude (Anthropic) API Key" in norm.title
    assert "console.anthropic.com" in norm.action_hint
    assert norm.status_code == 401


def test_classify_server_busy():
    """HTTP 503 or model overloaded must classify as server_busy."""
    raw_err = "Google Gemini API Error (503): The model is overloaded. Please try again later."
    norm = classify_llm_error(raw_err, provider="google", model_name="gemini-1.5-flash")
    assert norm.category == "server_busy"
    assert "Server Currently Busy" in norm.title
    assert "temporary issue" in norm.action_hint
    assert norm.status_code == 503

    # Exact phrase "server busy"
    norm_busy = classify_llm_error("server busy", provider="google")
    assert norm_busy.category == "server_busy"
    assert "Server Currently Busy" in norm_busy.title


def test_classify_google_limit_reached_and_edge_cases():
    """Verify classifications for 'google api limit reached', typos, and daily vs RPM limits."""
    # Google daily quota reached
    err_daily = (
        'Google Gemini API Error (429): {"error": {"code": 429, '
        '"message": "Quota exceeded for quota metric \'GenerateContent requests per day\'", '
        '"status": "RESOURCE_EXHAUSTED"}}'
    )
    norm1 = classify_llm_error(err_daily, provider="google")
    assert norm1.category == "quota_exhausted"
    assert norm1.title == "AI Usage Quota or Credit Limit Reached"
    assert "24 hours" in norm1.action_hint

    # Google per-minute RPM rate limit
    err_rpm = (
        'Google Gemini API Error (429): {"error": {"code": 429, '
        '"message": "Quota exceeded for quota metric \'GenerateContent requests per minute\'", '
        '"status": "RESOURCE_EXHAUSTED"}}'
    )
    norm2 = classify_llm_error(err_rpm, provider="google")
    assert norm2.category == "rate_limit"
    assert "Rate Limit Reached" in norm2.title
    assert "30–60 seconds" in norm2.action_hint

    # User phrasing / typo variants: 'error: goghole aa[pi limit rechech'
    norm3 = classify_llm_error("error: goghole aa[pi limit rechech", provider="google")
    assert norm3.category == "quota_exhausted"
    assert norm3.title == "AI Usage Quota or Credit Limit Reached"

    # User phrasing: 'ai limit over'
    norm4 = classify_llm_error("ai limit over", provider="openai")
    assert norm4.category == "quota_exhausted"
    assert "AI Usage Quota or Credit Limit Reached" in norm4.title

    # User phrasing: 'error 403 ai api key not found'
    norm5 = classify_llm_error("error 403 ai api key not found", provider="google")
    assert norm5.category == "invalid_key"
    assert "Invalid Google Gemini API Key" in norm5.title


def test_ollama_local_testing_without_api_key(app_client):
    """Ollama/local connection test and save should succeed without requiring an API key."""
    # Test connection with ollama and empty key
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.read.return_value = (
            b'{"choices": [{"message": {"content": "Connection OK"}}], "usage": {}}'
        )
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = app_client.post(
            "/api/agents/test-connection",
            json={
                "provider": "ollama",
                "model_name": "llama3",
                "api_key": "",
            },
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert data["provider"] == "ollama"


def test_default_model_resolution_for_xai_and_providers():
    """Adapters and endpoints resolve provider-specific default models when not specified."""
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"choices": [{"message": {"content": "OK"}}], "usage": {}}'
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        adapter = get_adapter(provider="xai", api_key="test-key")
        # Call chat without model or model=""
        adapter.chat(messages=[{"role": "user", "content": "hello"}], model=None)
        req = mock_urlopen.call_args[0][0]
        import json

        payload = json.loads(req.data.decode("utf-8"))
        assert payload["model"] == "grok-2-latest"
        assert payload["model"] != "gpt-4o-mini"


def test_classify_cloudflare_block():
    """HTTP 403 Cloudflare bot block."""
    raw_err = "OpenAI API Error (403): <html><title>Just a moment...</title>Cloudflare Ray ID: 8872615</html>"
    norm = classify_llm_error(raw_err, provider="xai", model_name="grok-2-latest")
    assert norm.category == "cloudflare_block"
    assert "Cloudflare" in norm.title
    assert norm.status_code == 403


def test_classify_connection_refused_ollama():
    """WinError 10061 on local Ollama endpoint."""
    raw_err = "<urlopen error [WinError 10061] No connection could be made because the target machine actively refused it>"
    norm = classify_llm_error(raw_err, provider="ollama", model_name="llama3")
    assert norm.category == "connection_refused"
    assert "Cannot Connect to Provider Endpoint" in norm.title
    assert "ollama serve" in norm.action_hint
    assert norm.status_code == 502


def test_classify_model_not_found():
    """HTTP 404 model not found."""
    raw_err = "OpenAI API Error (404): The model `grok-unknown-model` does not exist."
    norm = classify_llm_error(raw_err, provider="xai", model_name="grok-unknown-model")
    assert norm.category == "model_not_found"
    assert "Not Found" in norm.title
    assert "grok-unknown-model" in norm.message
    assert norm.status_code == 404


def test_format_user_message():
    """Verify markdown output format for agent chat panel."""
    norm = NormalizedLLMError(
        category="quota_exhausted",
        title="AI Usage Quota or Credit Limit Reached",
        message="Your Grok (xAI) account has exhausted its token quota.",
        action_hint="Check https://console.x.ai or switch providers in Settings.",
        status_code=429,
    )
    formatted = norm.format_user_message()
    assert formatted.startswith("⚠️ **AI Usage Quota or Credit Limit Reached**")
    assert "Your Grok (xAI) account has exhausted its token quota." in formatted
    assert "💡 **Action:** Check https://console.x.ai" in formatted


# =============================================================================
# 7. Crypto Utils & Config Path Stability
# =============================================================================


def test_crypto_utils_config_path_and_sanitization():
    """Key file path is rooted in Config.DATA_DIR and keys are cleanly stripped."""
    import os

    key_file = _get_key_file_path()
    assert ".agent_secret_key" in key_file
    assert os.path.dirname(key_file) == Config.DATA_DIR

    # Whitespace and newline sanitization
    raw_with_spaces = "  \n sk-clean-me-key-12345678 \r\n "
    encrypted = encrypt_api_key(raw_with_spaces)
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == "sk-clean-me-key-12345678"
    assert "\n" not in decrypted
    assert " " not in decrypted
