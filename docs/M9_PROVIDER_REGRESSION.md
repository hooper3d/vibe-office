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

## Providers

The script runs any provider whose existing agent ID or endpoint/model variables are present.

Existing registered agents:

```bash
VIBE_M9_HERMES_AGENT_ID=agent-lucy
VIBE_M9_DEEPSEEK_AGENT_ID=agent-deepseek
VIBE_M9_MINIMAX_AGENT_ID=agent-minimax
```

With existing agent IDs, credentials stay in the local trusted registry and are not copied into the shell.

Hermes-compatible:

```bash
VIBE_M9_HERMES_BASE_URL=http://127.0.0.1:8642/v1
VIBE_M9_HERMES_MODEL=hermes-model
VIBE_M9_HERMES_API_KEY=
```

DeepSeek OpenAI-compatible:

```bash
VIBE_M9_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
VIBE_M9_DEEPSEEK_MODEL=deepseek-chat
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
