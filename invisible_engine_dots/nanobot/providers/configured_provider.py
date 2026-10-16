"""Chat Completions endpoints with operator-supplied limits and budget rates."""
from dataclasses import replace
from typing import Any

from nanobot.providers.base import ModelLimits, LLMResponse, LLMUsage
from nanobot.providers.openai_compat_provider import OpenAICompatProvider


class ConfiguredProvider(OpenAICompatProvider):
    def __init__(self, key: str, model: str, settings: tuple[str, int, int, float, float]):
        base, context, output, self.input_rate, self.output_rate = settings
        super().__init__(api_key=key, api_base=base, default_model=model, provider_name="openai_compatible")
        self.limits = ModelLimits(context_tokens=context, answer_tokens=output)

    async def model_limits(self, model: str) -> ModelLimits:
        if model != self.default_model:
            raise ValueError("No limits or rates configured for this model")
        return self.limits

    @classmethod
    def _extract_usage(cls, response: Any) -> LLMUsage | None:
        usage = cls._usage_object(response)
        # Both counts must actually be reported; the base parser treats absent fields as zero.
        for name in ("prompt_tokens", "completion_tokens"):
            value = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                return None
        return super()._extract_usage(response)

    async def chat_stream(self, *args: Any, **kwargs: Any) -> LLMResponse:
        response = await super().chat_stream(*args, **kwargs)
        usage = response.usage
        # A missing usage report remains unpriced, so the existing spending gate fails closed.
        if response.cost_usd is None and usage is not None and usage.estimated_tokens == 0 and usage.reported_tokens > 0:
            cost = (usage.input_tokens * self.input_rate + usage.output_tokens * self.output_rate) / 1_000_000
            response = replace(response, cost_usd=cost)
        return response
