# Stability Pass Completion Audit

Date: 2026-06-18

## Objective

Stabilize Vibe Office before the next product stage:

- Request lifecycle is recoverable and visible.
- Data model responsibilities are clearer.
- UI selection state restores after refresh.
- Errors are understandable and retryable.
- Request execution has a migration path toward a local trusted orchestration boundary.

## Audit Result

Status: completed.

The Stability Pass is complete for the current browser-local prototype. The remaining native transport and secure credential work belongs to a packaged/local runtime phase, not this pass.

## Evidence

### Request Lifecycle

- Direct Chat, Project Chat, and Task Room user messages persist `sending`, `sent`, and `failed`.
- Request identity is durable through `requestId`, `requestAttempt`, `requestStartedAt`, and `requestCompletedAt`.
- Pending Direct Chat requests can recover after reload.
- Pending Task Room requests fail clearly as interrupted and remain retryable.

Evidence:

- `src/domain/requestLifecycle.ts`
- `src/services/requestRecovery.ts`
- `src/services/requestRetryState.ts`
- `src/services/directRequestOrchestrator.ts`
- `src/services/taskRoomOrchestrator.ts`
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
- `scripts/run-browser-smoke.mjs`

### Data Model Responsibilities

- UI component state no longer owns provider execution and retry mutation logic directly.
- Direct request orchestration is centralized in `directRequestOrchestrator`.
- Task Room orchestration is centralized in `taskRoomOrchestrator`.
- Active request ids and the latest workspace snapshot are centralized in `requestRuntimeStore`.
- Workspace persistence and UI chrome persistence are separated through `workspaceStorage` and `uiStateStorage`.

Evidence:

- `src/services/directRequestOrchestrator.ts`
- `src/services/taskRoomOrchestrator.ts`
- `src/services/requestRuntimeStore.ts`
- `src/services/workspaceStorage.ts`
- `src/services/uiStateStorage.ts`
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

### UI State Restoration

- Selected agent, selected project, chat scope, conversation mode, output tab, and active free-chat conversation ids are persisted.
- `localhost` app loads are redirected to `127.0.0.1` before React starts, preventing localStorage from splitting across two loopback origins.

Evidence:

- `src/services/uiStateStorage.ts`
- `src/services/canonicalHost.ts`
- `src/main.tsx`
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
- `docs/STABILITY_SMOKE.md`

### Error And Retry Recovery

- Provider errors are normalized before user-facing display.
- Workspace file errors are normalized before user-facing display.
- Failed user messages show typed labels and Retry actions.
- Direct Chat and Task Room retry flows are covered by browser smoke checks.
- Workspace context recovery failure becomes a typed context failure with Retry.

Evidence:

- `src/services/agentErrorText.ts`
- `src/services/workspaceErrorText.ts`
- `src/services/requestRetryState.ts`
- `src/services/directRequestOrchestrator.ts`
- `src/services/taskRoomOrchestrator.ts`
- `src/App.tsx`
- `scripts/run-browser-smoke.mjs`
- `docs/STABILITY_SMOKE.md`

### Local Trusted Orchestration Path

- Provider HTTP calls now go through a replaceable `AgentHttpTransport` boundary.
- Native A2A, Hermes-compatible, OpenAI-compatible, and Anthropic-compatible requests share that transport boundary.
- Workspace context recovery goes through the local trusted workspace layer before the recovered request is sent.

Evidence:

- `src/services/agentHttpTransport.ts`
- `src/services/a2aClient.ts`
- `src/services/hermesA2AAdapter.ts`
- `src/services/workspaceContextRecovery.ts`
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

## Verification Commands

Passed on 2026-06-18:

```bash
npm test
npm run build
npm run smoke:browser
```

## Follow-Up Scope

These are intentionally not part of the Stability Pass completion:

- Replace browser-local transport with a native/local trusted implementation for packaged release.
- Move provider credentials from the local trusted credential file into OS-backed secure storage for packaged releases.
- Continue M7 IA Reset and reorganize the Output Area by agent and output type.
