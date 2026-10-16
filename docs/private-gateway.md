# Private Chat Completions gateway (CPA)

Use the YAML editor or CLI YAML config. Existing OpenRouter configs keep their behavior.
The following limits and rates are **illustrative operator settings, not published model specifications or prices**; replace them with values approved for your deployment:

```yaml
name: private-dot
model:
  provider: openai_compatible
  id: gpt-6.1-sol
  base_url: http://10.19.2.161:8317/v1
  context_tokens: 32000
  max_output_tokens: 1024
  input_cost_per_million: 2
  output_cost_per_million: 8
```

Set the gateway bearer token through the existing encrypted API-key settings (labeled Model API key). Never put keys in YAML. Set a per-Dot key using the existing API/SDK `dot_id` option when mixing providers; a Dot without its own key inherits the global key. Role overrides must use the primary model ID because limits and rates are shared. This deployment defaults new Dots to `https://llm.api.zyuncs.com/v1` with `z-ai/glm-5.3-flash`. The form preserves provider and gateway settings when switching to or from YAML. Edit the YAML to change gateway limits, rates, or the endpoint; credentials stay in the encrypted secret store.

The adapter uses `/chat/completions` with streaming, tool calls and usage reporting. It does not request OpenRouter model endpoints, inject OpenRouter routing, or add OpenRouter prompt cache annotations. Guest network checks target the configured gateway host/port. There is no Responses API fallback; gateways must implement Chat Completions.

When a response reports `usage.cost`, that value is used. Otherwise reported input/output tokens are multiplied by the explicit configured rates for local budget accounting. Cached input is charged at the full input rate; estimates are not billing statements. Missing usage stays unpriced and the existing budget gate blocks further actions. Explicit zero rates are allowed only when deliberately configured. Budget rates/limits must reflect all gateway charges (including any reasoning tokens reported as output).

CPA tested locally: `gpt-6.1-sol` returned an echo tool call, accepted its tool result, and completed a stream with usage. `/models/<id>/endpoints` returns 404, which this adapter does not need. The deployment host must independently have network access to the gateway; this change does not change routing or firewall rules.

After code updates rebuild the CLI/Web and the runtime ISO (`invisible-dots image build`), so newly started VMs load the updated guest engine. Stop existing VMs first; the running VM retains its mounted runtime image.
