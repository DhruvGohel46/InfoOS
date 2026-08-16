"""Static Model Pricing & Cost Estimation Module.

Provides standard published pricing per 1M tokens (USD) for major LLM providers.
Used to compute live estimated cost per call without external API dependencies.
"""

# Pricing in USD per 1 Million tokens: (input_price_per_1M, output_price_per_1M)
MODEL_PRICING = {
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "o1-mini": (3.00, 12.00),
    "o1-preview": (15.00, 60.00),
    # Anthropic
    "claude-3-5-sonnet-20241022": (3.00, 15.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-5-haiku-20241022": (0.80, 4.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "claude-3-opus-20240229": (15.00, 75.00),
    # Google Gemini
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-2.0-flash": (0.10, 0.40),
    # DeepSeek / Groq / OpenRouter / Local
    "deepseek-chat": (0.14, 0.28),
    "deepseek-reasoner": (0.55, 2.19),
    "llama-3.3-70b-versatile": (0.59, 0.79),
    "llama-3.1-8b-instant": (0.05, 0.08),
    "mixtral-8x7b-32768": (0.24, 0.24),
}

DEFAULT_FALLBACK_PRICING = (0.50, 1.50)  # Moderate baseline


def calculate_cost(provider: str, model_name: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate estimated cost in USD based on model name and token counts."""
    if not model_name:
        model_name = "gpt-4o-mini"

    # Normalize model name for lookup
    normalized_name = model_name.lower().strip()

    rates = None
    # Exact match
    if normalized_name in MODEL_PRICING:
        rates = MODEL_PRICING[normalized_name]
    else:
        # Partial match
        for key, price_tuple in MODEL_PRICING.items():
            if key in normalized_name or normalized_name in key:
                rates = price_tuple
                break

    if not rates:
        rates = DEFAULT_FALLBACK_PRICING

    input_cost = (input_tokens / 1_000_000.0) * rates[0]
    output_cost = (output_tokens / 1_000_000.0) * rates[1]

    total = input_cost + output_cost
    return round(total, 6)
