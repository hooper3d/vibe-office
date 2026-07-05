# M7-M9 Completion Audit

Date: 2026-06-19

## Objective

Audit the current state of the post-reset development plan:

- M7-1: keep `App.tsx` as orchestration while extracting workspace, output, task, artifact, and setup views.
- M7-2: split provider adapters into OpenAI-compatible, Anthropic-compatible, and native A2A layers, with `HermesA2AAdapter` as the unified entry.
- M7-3: reorganize the Output Area by agent first, then by output type: tasks, artifacts, browser preview.
- M8: move provider execution, workspace files, and credential management behind the local trusted layer.
- M9: verify real providers: Hermes, DeepSeek OpenAI-compatible, and MiniMax Anthropic-compatible across connection, free chat, project chat, timeout, retry, and Chinese context continuity.

## Audit Result

Status: complete for the current prototype release target, with packaging hardening still pending.

M7 is functionally complete for the current prototype structure. M8 is implemented as a development local trusted layer, with packaging and OS-backed credential storage still pending. M9 now has READY local trusted records for Hermes, DeepSeek, and MiniMax, and the full real-provider matrix passes through the local trusted provider path.

## M7-1 Structure Slimming

Status: complete for the current prototype slice.

Evidence:

- `App.tsx` delegates central/right shell rendering to `src/components/MainWorkspace.tsx`.
- Workspace file browsing is in `src/components/WorkspaceFiles.tsx`.
- Task output rendering is in `src/components/ProjectTasks.tsx`.
- Artifact selection/action orchestration is in `src/components/ProjectArtifacts.tsx`.
- Artifact list/detail/preview rendering is in `src/components/ProjectArtifactViewer.tsx`.
- Agent setup modal composition is in `src/components/SetupWizard.tsx`.
- App dialog shell composition is in `src/components/AppDialogs.tsx`.
- Agent setup control and save state are in `src/services/agentSetupController.ts` and `src/services/agentSetupState.ts`.
- Project setup state is in `src/services/projectSetupState.ts`.
- Workspace selection, attachment, conversation selection, request orchestration, and sync concerns are split into service modules.

Verification:

- Split service tests under `src/__tests__/agent.test.ts`, `src/__tests__/chat.test.ts`, `src/__tests__/chatRecovery.test.ts`, `src/__tests__/chatSelection.test.ts`, `src/__tests__/chatTaskRoom.test.ts`, `src/__tests__/localTrusted.test.ts`, `src/__tests__/localTrustedScripts.test.ts`, `src/__tests__/localTrustedTransport.test.ts`, `src/__tests__/project.test.ts`, `src/__tests__/projectLifecycle.test.ts`, `src/__tests__/projectOutputs.test.ts`, `src/__tests__/provider.test.ts`, `src/__tests__/uiStructure.test.ts`, and `src/__tests__/workspace.test.ts` include structure guards for `MainWorkspace`, `OutputWorkspace`, `ProjectOutputs`, `ProjectTasks`, `ProjectArtifacts`, and extracted artifact/output helpers.

## M7-2 Provider Adapter Layer

Status: complete for the current provider design.

Evidence:

- `src/services/openaiProvider.ts` owns OpenAI-compatible chat execution.
- `src/services/anthropicProvider.ts` owns Anthropic-compatible messages execution.
- `src/services/nativeA2AProvider.ts` owns native A2A capability and task lifecycle execution.
- `src/services/providerRouter.ts` owns runtime routing through `resolveProviderRoute`.
- `src/services/hermesA2AAdapter.ts` is now a unified entry that delegates to `ProviderRouter`.
- `src/services/providerTypes.ts` owns shared provider results, task helpers, metadata mapping, and history types.

Verification:

- Stability tests cover OpenAI-compatible free chat, Anthropic-compatible project chat, and Hermes native A2A fallback to chat compatibility.

## M7-3 Output Area Reorganization

Status: complete for the current UI model.

Evidence:

- `src/services/outputSelectors.ts` groups outputs by agent and keeps chat-only direct messages out of the Output Area.
- `src/components/ProjectOutputs.tsx` renders selected agent output groups and type filters.
- `src/components/ProjectOutputPrimitives.tsx` owns output index buttons, type buttons, output sections, and browser preview rows.
- `src/services/projectTaskOutputItems.ts` normalizes run-backed and standalone task-backed records into one task-output list.
- `src/services/projectArtifactContent.ts` owns artifact text/data/file URL parsing.
- `src/components/ProjectArtifactViewer.tsx` owns artifact browser/detail/preview rendering.
- Browser preview links can be assigned to the owning output agent as a Preview type.

Verification:

- Stability tests cover output grouping, selection recovery, preview assignment, trackable task output normalization, and component boundary guards.

## M8 Local Trusted Layer

Status: implemented as a development bridge; not final secure packaging.

Evidence:

- Provider calls use `POST /agent-local/command` through `src/services/agentHttpTransport.ts`.
- Agent registry operations use command-shaped `POST /agent-local/registry-command`.
- Workspace file list/read/search uses command-shaped `POST /workspace-local/command`.
- `localTrusted/providerRequests.ts` owns provider URL construction, method/header policy, request bodies, and credential injection.
- `localTrusted/workspaceFiles.ts` owns controlled local list/read/search and path escape rejection.
- `localTrusted/agentRegistry.ts` stores metadata separately from credentials.
- `localTrusted/credentialStore.ts` owns prototype credential JSON storage with private directory/file mode intent and atomic writes.
- `localTrusted/http.ts` redacts sensitive error text before returning it to the browser.

Remaining:

- Replace prototype local JSON credential storage with OS-backed secure storage.
- Move the local trusted layer out of Vite dev middleware for packaged/runtime distribution.
- Keep frontend requests semantic; avoid expanding browser-authored provider HTTP details again.

## M9 Real Provider Matrix

Status: complete for the current configured real-provider matrix.

Evidence already complete:

- `scripts/run-provider-regression.mjs` covers connection, free chat, project chat, forced timeout, retry after timeout, and Chinese context continuity.
- `docs/M9_PROVIDER_REGRESSION.md` documents safe setup, readiness states, and repair commands without exposing keys.
- `npm run regression:providers -- --target hermes` has passed the full Hermes target repeatedly through the local trusted provider path.
- `npm run regression:providers -- --target deepseek` passes the full DeepSeek OpenAI-compatible target.
- `npm run regression:providers -- --target minimax` passes the full MiniMax Anthropic-compatible target.
- `npm run regression:providers` passes all checks for Hermes, DeepSeek, and MiniMax.

Current readiness from `npm run regression:providers:list`:

- Hermes: `READY agent-1781701191359`
- DeepSeek OpenAI-compatible: `READY agent-1781765240218`
- MiniMax Anthropic-compatible: `READY agent-1781771100927`

Completion condition:

- `npm run regression:providers:list` shows `READY` for Hermes, DeepSeek OpenAI-compatible, and MiniMax Anthropic-compatible.
- `npm run regression:providers` passes all six checks for all three targets.

## Verification Commands

Latest verified commands in this stage:

```bash
npm run ci
npm run release:check
npm test
npm run build
npm run smoke:browser
npm run regression:providers -- --target hermes
npm run regression:providers -- --target deepseek
npm run regression:providers -- --target minimax
npm run regression:providers:list
npm run regression:providers
```

Known packaging note:

- Release packaging still needs OS-backed secure storage and a packaged local trusted runtime outside Vite dev middleware.
- `release:check` currently passes with a warning for the active dev-server logs: `dev-5180-current.err.log` and `dev-5180-current.out.log`.

## Next Work

1. Keep release hygiene tight: no committed logs, screenshots, secrets, or generated local state.
2. Continue simplifying large modules and stale docs toward open-source readability.
3. Start the next platform-hardening phase: secure credential storage and moving the local trusted layer out of Vite dev middleware.
