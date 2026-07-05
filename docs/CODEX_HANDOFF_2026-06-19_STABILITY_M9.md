# Vibe Office Handoff - Stability / M9 Provider Matrix

Date: 2026-06-19
Project root: `<project-root>`
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
npm run ci
npm run release:check
npm test
npm run typecheck:unused
npm run build
npm run smoke:browser
npm run regression:providers -- --target deepseek
npm run regression:providers -- --target minimax
npm run regression:providers -- --target hermes
npm run regression:providers:list
npm run regression:providers
```

Results:

- `npm test`: 108/108 passed.
- `npm run typecheck:unused`: passed.
- `npm run build`: passed.
- `npm run smoke:browser`: passed.
- `npm run ci`: passed.
- `npm run release:check`: passed; it only warns about the two current dev-server log files, `dev-5180-current.err.log` and `dev-5180-current.out.log`.
- Hermes, DeepSeek OpenAI-compatible, and MiniMax Anthropic-compatible provider regressions passed all six checks:
  - connection
  - free-chat
  - project-chat
  - timeout-failure
  - retry-after-timeout
  - chinese-context, including `海盐柠檬`

## Important Current Finding

The earlier key persistence issue has been repaired. Existing DeepSeek/MiniMax provider edits now persist newly entered keys into the local trusted credential store instead of browser localStorage, without printing or exposing key values. After verification:

```txt
Local trusted home: <default user home .vibe-office>
```

Current provider readiness:

```txt
Hermes: READY agent-1781701191359
DeepSeek OpenAI-compatible: READY agent-1781765240218
MiniMax Anthropic-compatible: READY agent-1781771100927
```

Current registered agents from local trusted registry:

```txt
agent-1781701191359 | Lucy | provider=openai | model=hermes-agent | hasKey=true
agent-1781716094988 | Tiger | provider=hermes | model=hermes-agent | hasKey=false
agent-1781765240218 | DeepSeeek | provider=openai | model=deepseek-v4-flash | hasKey=true
agent-1781771100927 | MiniMax | provider=anthropic | model=MiniMax-M3 | hasKey=true
agent-1781797961180 | Lucy | provider=openai | model=hermes-agent | hasKey=true
```

Current credential file contains provider credential entries for the ready agents. Do not inspect, print, copy, or commit key values.

```txt
agent-1781701191359
agent-1781765240218
agent-1781771100927
agent-1781797961180
```

No key values were inspected or copied into this document.

Interpretation:

- Lucy/Hermes, DeepSeek, and MiniMax all have ready local trusted records.
- The old `MISSING_KEY` / provider metadata mismatch findings were real historical blockers, but are no longer the current state.
- MiniMax is registered as Anthropic-compatible for M9.

## Recently Added Diagnostic

Commit `0d9ed92` updated `scripts/run-provider-regression.mjs` so `npm run regression:providers:list` prints which trusted home source is in use without exposing the absolute user path:

```txt
Local trusted home: <default user home .vibe-office>
```

This is important because previous key-drop debugging was ambiguous: UI and scripts may have been reading different trusted directories. The list output now makes the source visible without putting local usernames into public logs.

The related test assertion now lives in the split service tests under `src/__tests__/localTrustedScripts.test.ts`.

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
- `src/__tests__/agent.test.ts`
- `src/__tests__/chat.test.ts`
- `src/__tests__/chatRecovery.test.ts`
- `src/__tests__/chatSelection.test.ts`
- `src/__tests__/chatTaskRoom.test.ts`
- `src/__tests__/localTrusted.test.ts`
- `src/__tests__/localTrustedScripts.test.ts`
- `src/__tests__/localTrustedTransport.test.ts`
- `src/__tests__/project.test.ts`
- `src/__tests__/projectLifecycle.test.ts`
- `src/__tests__/projectOutputs.test.ts`
- `src/__tests__/provider.test.ts`
- `src/__tests__/uiStructure.test.ts`
- `src/__tests__/workspace.test.ts`

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

1. Keep the release target narrow.
   - Preserve the existing calm product skeleton.
   - Avoid adding new product features until release hygiene and docs are clean.
   - Do not print or log API keys.

2. Continue codebase slimming.
   - Keep `App.tsx` as orchestration only.
   - Keep provider protocol details behind the local trusted layer.
   - Remove stale docs/logs/generated files before publishing.

3. Before publishing, run:

```powershell
npm run release:check
npm test
npm run typecheck:unused
npm run build
npm run smoke:browser
npm run regression:providers:list
npm run regression:providers
```

4. Next hardening phase:
   - replace prototype JSON credential storage with OS-backed secure storage for packaged builds.
   - move the local trusted layer out of Vite dev middleware.
   - keep browser requests semantic and credential-free.

## Do Not Repeat These Mistakes

- Do not add heavy prompt presets or artificial context that makes agents slower or confused.
- Do not force every provider into A2A concepts in the UI.
- Do not put API keys back into browser localStorage.
- Do not prefill saved API keys into the form.
- Do not let artifact download fetch arbitrary external media as if it were trusted.
- Do not use system messages scattered in chat as the primary error UX.
- Do not claim packaged security complete until credentials use OS-backed secure storage and the local trusted runtime no longer depends on Vite dev middleware.

## Suggested Prompt For New Thread

```txt
Ray，请继续 Vibe Office 当前目标。先读：

<project-root>\docs\CODEX_HANDOFF_2026-06-19_STABILITY_M9.md

当前重点不是新增功能，而是把平台稳定性打牢并往可发布开源方向收口。DeepSeek/MiniMax key 持久化已经修复，M9 provider 矩阵已通过；继续做 release hygiene、文档瘦身、代码瘦身和 packaged local trusted runtime 规划。不要泄露 key。
```
