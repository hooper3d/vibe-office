# Vibe Office Handoff - Stability / M9 Provider Matrix

Date: 2026-06-19
Project root: `C:\Users\hooper\Documents\VibeOffice`
Current local app: `http://127.0.0.1:5180/`
Developer agent: Ray

## User Direction

- Development reports to the user should be in Chinese.
- Product UI remains English.
- Do not expose API keys in source, docs, logs, or replies.
- Ray is the code/development agent for this repo.
- Before frontend UI work, read:
  - `docs/DESIGN.md`
  - `docs/UI_COMPONENTS.md`
  - `docs/UI_REVIEW_CHECKLIST.md`
- The product direction has been reset toward the user's original skeleton:
  - left list area: agents and projects/free chat
  - center conversation area: talk to clear, role-specific agents
  - right output area: outputs grouped by agent and type
- A2A should be background infrastructure, not front-and-center UI.
- Provider onboarding should feel like adding an LLM provider: provider type, base URL, model/agent ID, key, plus optional instance location / host IP notes.

## Active Goal

Continue the full M7-M9 plan. Do not mark the goal complete until each part is verified against current code and runtime behavior.

### M7-1 Structure Slimming

- Split large `App.tsx` responsibilities.
- `WorkspaceFiles`, `ProjectArtifacts`, `ProjectTasks`, `SetupWizard` should live in component files.
- Keep `App.tsx` mostly as state orchestration.

### M7-2 Provider Adapter Layering

- Provider adapters are split:
  - `src/services/openaiProvider.ts`
  - `src/services/anthropicProvider.ts`
  - `src/services/nativeA2AProvider.ts`
- `HermesA2AAdapter` should be the unified entry and capability mapping layer.
- Avoid letting browser code handle credentials directly.

### M7-3 Output Area Reorganization

- Output area should follow the original product idea:
  - group by agent
  - then by artifact / task / browser preview type
- Avoid scattering run/task/artifact into unclear semantic locations.

### M8 Local Trusted Layer Upgrade

- Provider requests, workspace file reads, and credential management should move progressively into the local trusted layer.
- Frontend should send commands and render state, not hold provider secrets or provider protocol details.

### M9 Real Provider Regression Matrix

Must cover:

- Hermes
- DeepSeek OpenAI-compatible
- MiniMax Anthropic-compatible

Each provider should verify:

- connection test
- free chat
- project chat
- timeout failure
- retry
- Chinese context continuity

## Current Git State

Current head at handoff time:

```txt
0d9ed92 Show local trusted home in M9 readiness
0467d8d Never prefill saved provider keys
0e724d1 Limit artifact downloads to trusted media
8e4a30d Show M9 provider readiness candidates
37136df Clarify provider credential save status
eeb77f7 Guard provider credential persistence on test failure
1ca6f80 Keep unowned previews out of agent outputs
6f0ef7c Remove stale directory picker app type
```

Worktree was clean before this handoff document was created.

## Current Verified Status

Latest commands already run:

```powershell
npm test
npm run build
npm run smoke:browser
npm run regression:providers -- --target hermes
npm run regression:providers:list
```

Results:

- `npm test`: 97/97 passed.
- `npm run build`: passed. Vite emitted only the existing chunk-size warning.
- `npm run smoke:browser`: passed.
- Hermes provider regression: passed.
  - connection: pass
  - free-chat: pass
  - project-chat: pass
  - timeout-failure: pass
  - retry-after-timeout: pass
  - chinese-context: pass, remembered `海盐柠檬`

## Important Current Finding

The user reported that the key had dropped, then re-entered it. After verification:

```txt
Local trusted home: C:\Users\hooper\.vibe-office
```

Current provider readiness:

```txt
Hermes: READY agent-1781701191359
DeepSeek OpenAI-compatible: MISSING_KEY agent-1781765240218
MiniMax Anthropic-compatible: MISSING_KEY agent-1781771100927
```

Current registered agents from local trusted registry:

```txt
agent-1781701191359 | Lucy | provider=openai | model=hermes-agent | hasKey=true | endpoint=http://127.0.0.1:8642/v1
agent-1781716094988 | Tiger | provider=hermes | model=hermes-agent | hasKey=false | endpoint=https://hooper.ink/v1
agent-1781765240218 | DeepSeeek | provider=openai | model=deepseek-v4-flash | hasKey=false | endpoint=https://api.deepseek.com
agent-1781771100927 | MiniMax | provider=anthropic | model=MiniMax-M3 | hasKey=false | endpoint=https://api.minimaxi.com/anthropic
agent-1781797961180 | Lucy | provider=openai | model=hermes-agent | hasKey=true | endpoint=http://127.0.0.1:8642/v1
```

Current credential file contains keys only for the Lucy/Hermes-compatible agents:

```txt
agent-1781701191359
agent-1781797961180
```

No key values were inspected or copied into this document.

Interpretation:

- Lucy/Hermes recovered and works.
- DeepSeek and MiniMax still have no saved key in `C:\Users\hooper\.vibe-office\agent-credentials.local.json`.
- If the user re-entered only Lucy's key, this is expected.
- If the user re-entered DeepSeek or MiniMax keys, the save path is still broken or saving to a different trusted home.

## Recently Added Diagnostic

Commit `0d9ed92` updates `scripts/run-provider-regression.mjs` so `npm run regression:providers:list` prints:

```txt
Local trusted home: C:\Users\hooper\.vibe-office
```

This is important because previous key-drop debugging was ambiguous: UI and scripts may have been reading different trusted directories. The list output now makes that visible.

The related test assertion was added in `src/__tests__/stability.test.ts`.

## Files Likely Relevant Next

Credential and local trusted layer:

- `localTrusted/credentialStore.ts`
- `localTrusted/providerRequests.ts`
- `scripts/update-local-agent-credential.mjs`
- `scripts/run-provider-regression.mjs`
- `src/services/localTrustedAgentRegistry.ts`
- `src/services/agentSetupController.ts`
- `src/services/agentConnectionTestState.ts`
- `src/components/AgentProviderSettings.tsx`
- `src/components/SetupWizard.tsx`
- `src/__tests__/stability.test.ts`

Provider routing:

- `src/services/providerRouter.ts`
- `src/services/openaiProvider.ts`
- `src/services/anthropicProvider.ts`
- `src/services/nativeA2AProvider.ts`
- `src/services/hermesA2AAdapter.ts`

UI / output area:

- `src/App.tsx`
- `src/components/ConversationWorkspace.tsx`
- `src/components/ConversationViews.tsx`
- `src/components/OutputWorkspace.tsx`
- `src/components/WorkspaceFiles.tsx`
- `src/components/ProjectArtifacts.tsx`
- `src/components/ProjectTasks.tsx`
- `src/styles.css`

Docs:

- `docs/DEVELOPMENT.md`
- `docs/M9_PROVIDER_REGRESSION.md`
- `docs/M7_M9_COMPLETION_AUDIT_2026-06-19.md`
- `docs/STABILITY_SMOKE.md`
- `docs/CODE_REVIEW_HEALTH_2026-06-18.md`

## Recommended Next Steps

1. Start with credential persistence, not new UI.
   - Reproduce saving a DeepSeek or MiniMax key through the Add/Edit Agent dialog.
   - Confirm whether `agent-credentials.local.json` changes.
   - Confirm whether local trusted status refreshes after save.
   - Do not print or log the key.

2. If UI save does not persist keys:
   - inspect `agentSetupController.saveAgent`
   - inspect `persistLocalTrustedAgent`
   - inspect local trusted middleware/route handling
   - add or tighten tests around editing an existing provider and saving a new key.

3. After fixing, run:

```powershell
npm test
npm run build
npm run smoke:browser
npm run regression:providers:list
```

4. If DeepSeek / MiniMax keys are actually present and ready, run targeted regressions:

```powershell
npm run regression:providers -- --target deepseek
npm run regression:providers -- --target minimax
```

5. Only after credential stability is proven, continue with output-area cleanup and local trusted layer migration.

## Do Not Repeat These Mistakes

- Do not add heavy prompt presets or artificial context that makes agents slower or confused.
- Do not force every provider into A2A concepts in the UI.
- Do not put API keys back into browser localStorage.
- Do not prefill saved API keys into the form.
- Do not let artifact download fetch arbitrary external media as if it were trusted.
- Do not use system messages scattered in chat as the primary error UX.
- Do not claim M9 complete until Hermes, DeepSeek, and MiniMax are all verified or explicitly blocked by missing external keys.

## Suggested Prompt For New Thread

```txt
Ray，请继续 Vibe Office 当前目标。先读：

C:\Users\hooper\Documents\VibeOffice\docs\CODEX_HANDOFF_2026-06-19_STABILITY_M9.md

当前重点不是新增功能，而是把平台稳定性打牢：优先查 DeepSeek/MiniMax provider key 在 UI 保存后为什么没有落到 C:\Users\hooper\.vibe-office\agent-credentials.local.json。不要泄露 key。修复后补测试并跑 npm test、npm run build、npm run smoke:browser、npm run regression:providers:list。后续再继续 M7-M9。
```
