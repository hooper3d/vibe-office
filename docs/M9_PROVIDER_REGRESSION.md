# M9 Provider Regression Matrix

This check exercises real provider connections through the Vibe Office local trusted layer.

It does not store API keys in source, docs, or logs. Prefer existing local trusted agent IDs when the agents are already registered in Vibe Office. Use shell environment keys only for temporary regression agents.

## Prerequisite

Start the local app:

```bash
npm run dev -- --host 127.0.0.1 --port 5180
```

Then run the provider matrix from another terminal:

```bash
npm run regression:providers
```

To inspect safe local trusted agent IDs without printing keys:

```bash
npm run regression:providers:list
```

The list also prints M9 readiness for Hermes, DeepSeek OpenAI-compatible, and MiniMax Anthropic-compatible:

- `READY`: this target has a usable local trusted agent id.
- `MISSING_KEY`: the provider record exists, but its API key is not in the local trusted registry.
- `PROVIDER_MISMATCH`: a likely provider record exists, but its provider type does not match the M9 target. For example, MiniMax Anthropic-compatible must be registered as `anthropic`, not `openai`.
- `NOT_FOUND`: no likely local trusted agent exists yet, or the configured `VIBE_M9_*_AGENT_ID` does not exist.

Readiness lines include an `action=` hint:

- `edit-agent-save-api-key`: open the agent, paste the API key, test or save, then run the list again.
- `edit-agent-switch-to-anthropic-compatible-and-save`: open the agent, set Provider type to Anthropic-compatible, use the Anthropic-compatible endpoint, save, then run the list again.
- `edit-agent-switch-to-openai-compatible-and-save`: open the agent, set Provider type to OpenAI-compatible, use an OpenAI-compatible `/v1` endpoint, save, then run the list again.
- `add-openai-compatible-agent` / `add-anthropic-compatible-agent`: add a matching provider-backed agent before running the M9 matrix.

## Providers

The script runs any provider whose existing agent ID, ready local trusted registry match, or endpoint/model variables are present.
When no `VIBE_M9_*_AGENT_ID` is supplied, it can auto-select a ready local trusted agent by provider hints without printing keys.

Existing registered agents:

```bash
VIBE_M9_HERMES_AGENT_ID=agent-lucy
VIBE_M9_DEEPSEEK_AGENT_ID=agent-deepseek
VIBE_M9_MINIMAX_AGENT_ID=agent-minimax
```

With existing agent IDs, credentials stay in the local trusted credential store and are not copied into the shell.

Auto-selection:

- Hermes can use either a native Hermes record or a Hermes-compatible OpenAI-style record when the endpoint/model matches Hermes hints.
- DeepSeek requires an OpenAI-compatible record with a key in the local trusted credential store.
- MiniMax requires an Anthropic-compatible record with a key in the local trusted credential store.

Hermes-compatible:

```bash
VIBE_M9_HERMES_BASE_URL=http://127.0.0.1:8642/v1
VIBE_M9_HERMES_MODEL=hermes-model
VIBE_M9_HERMES_API_KEY=
```

DeepSeek OpenAI-compatible:

```bash
VIBE_M9_DEEPSEEK_BASE_URL=https://api.deepseek.com
VIBE_M9_DEEPSEEK_MODEL=deepseek-v4-flash
VIBE_M9_DEEPSEEK_API_KEY=...
```

MiniMax Anthropic-compatible:

```bash
VIBE_M9_MINIMAX_BASE_URL=https://api.minimax.io/anthropic
VIBE_M9_MINIMAX_MODEL=MiniMax-M3
VIBE_M9_MINIMAX_API_KEY=...
```

Optional:

```bash
VIBE_OFFICE_URL=http://127.0.0.1:5180
VIBE_M9_REQUEST_TIMEOUT_MS=45000
VIBE_M9_FORCED_TIMEOUT_MS=1
```

## Checks

Each configured provider must pass:

- connection: one short provider response
- free-chat: one free chat style turn
- project-chat: one project-scoped turn with a system/project instruction
- timeout-failure: client-side forced timeout handling
- retry-after-timeout: successful request after a forced timeout
- chinese-context: Chinese context continuity with prior messages included

## Notes

- The script upserts temporary `m9-*` agents into the local trusted registry.
- If `VIBE_M9_*_AGENT_ID` is set, the script reuses that registered agent instead of upserting a temporary one.
- The script calls `/agent-local/command`, not remote providers directly.
- Do not commit shell scripts, screenshots, logs, or docs containing real keys.
- A skipped provider means neither an existing agent ID nor required endpoint/model variables were set.
- On 2026-06-19, Hermes auto-selection passed the full matrix against local trusted agent `agent-1781701191359`.
- DeepSeek and MiniMax are not considered complete until their local trusted records report `READY` in `npm run regression:providers:list`.
