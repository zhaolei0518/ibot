"""Private gateways: validated settings, streaming tools, reported-token budgeting."""
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from openai.types.chat import ChatCompletionChunk
from fakes.dot_config import runtime_config_body

from nanobot.dots.protocol import parse_runtime_config, DotsConfigError
from nanobot.dots.projection import project
from nanobot.dots.provider import OpenRouterProviders
from nanobot.providers.configured_provider import ConfiguredProvider

MODEL = dict(provider="openai_compatible", id="gpt-6.1-sol", base_url="http://127.0.0.1:8317/v1",
             context_tokens=32000, max_output_tokens=1024, input_cost_per_million=2, output_cost_per_million=8)


def test_projection_identity_limits_and_role_guard():
    config = parse_runtime_config(runtime_config_body(model=MODEL))
    settings = project(config, workspace="/tmp", openrouter_base_url="http://wrong.test")
    factory = OpenRouterProviders()
    provider = factory.current(settings, "test-token")
    assert isinstance(provider, ConfiguredProvider)
    assert provider._effective_base == MODEL["base_url"]
    assert "HTTP-Referer" not in provider._default_headers and "X-Title" not in provider._default_headers
    assert factory.current(settings, "test-token") is provider
    changed = replace(settings, compatible=(*settings.compatible[:3], 3, 9))
    assert factory.current(changed, "test-token") is not provider
    with pytest.raises(DotsConfigError):
        parse_runtime_config(runtime_config_body(model=MODEL, models={"summary": "other"}))


@pytest.mark.parametrize("patch", [{"input_cost_per_million": None}, {"base_url": "file:///tmp"},
    {"base_url": "http://user:secret@host/v1"}, {"max_output_tokens": 32000}, {"output_cost_per_million": float('inf')}])
def test_rejects_incomplete_or_invalid_settings(patch):
    with pytest.raises(DotsConfigError):
        parse_runtime_config(runtime_config_body(model={**MODEL, **patch}))


@pytest.mark.parametrize("usage,expected", [(None, None),
    ({"prompt_tokens": 100, "completion_tokens": 10, "total_tokens": 110}, 0.00028),
    ({"prompt_tokens": 100, "completion_tokens": 10, "total_tokens": 110, "cost": .01}, .01)])
async def test_streamed_tools_and_budget_without_metadata_requests(usage, expected):
    provider = ConfiguredProvider("test-token", MODEL['id'], (MODEL['base_url'], 32000, 1024, 2, 8))
    assert (await provider.model_limits(MODEL['id'])).context_tokens == 32000
    # Streaming function arguments arrive in separate chunks, including a usage-only final chunk.
    deltas = [({"tool_calls": [{"index": 0, "id": "call_a", "type": "function", "function": {"name": "echo", "arguments": '{"value":'}}]}, None),
              ({"tool_calls": [{"index": 0, "function": {"arguments": '"OK"}'}}]}, "tool_calls")]
    chunks = [dict(id="x", object="chat.completion.chunk", created=0, model=MODEL['id'],
        choices=[dict(index=0, delta=d, finish_reason=f)]) for d, f in deltas]
    if usage is not None:
        chunks.append(dict(id="x", object="chat.completion.chunk", created=0, model=MODEL['id'], choices=[], usage=usage))
    async def stream():
        for chunk in chunks:
            yield ChatCompletionChunk.model_validate(chunk)
    create = AsyncMock(return_value=stream())
    provider._client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    response = await provider.chat_stream([{"role": "user", "content": "test"}], max_tokens=1024)
    assert response.finish_reason == "tool_calls"
    assert response.tool_calls[0].arguments == {"value": "OK"}
    assert response.cost_usd == pytest.approx(expected) if expected is not None else response.cost_usd is None
    assert create.call_args.kwargs['max_completion_tokens'] == 1024
    assert 'extra_body' not in create.call_args.kwargs


def test_partial_usage_is_not_treated_as_free_output():
    assert ConfiguredProvider._extract_usage({"usage": {"prompt_tokens": 100, "total_tokens": 100}}) is None
