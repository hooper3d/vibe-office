# Vibe Office Code Review And Health Report

Date: 2026-06-18

## Executive Summary

Current health: **medium, usable but not yet stable enough for broad feature expansion**.

The product direction is clearer after M7/M8/M9 work: Vibe Office is returning to the core `List Area + Conversation Area + Output Area` shape, with A2A pushed behind the integration layer and normal model-provider onboarding made more prominent.

However, the platform still has too much fragile state crossing between browser localStorage, local trusted dev middleware, provider adapters, and UI orchestration. The most important finding from this review was confirmed live: provider credentials could be dropped from the local trusted credential store during metadata rewrites, causing real agents to fail with authentication errors.

## What Was Verified

Commands passed:

```bash
npm test
npm run build
npm run smoke:browser
npm run regression:providers:list
```

Current service test coverage:

- 23 service-level tests pass.
- Browser smoke passes.
- Build passes after including `localTrusted` in TypeScript checking.

Current local trusted registry status from safe diagnostics:

- Registry JSON is valid.
- Credential store JSON is valid.
- Current safe provider list still shows DeepSeek missing a key and MiniMax registered with a provider mismatch for the expected Anthropic-compatible target.

No API key values were read into this report.

## P0 Findings

### P0-1 Credential Store Could Be Overwritten During Metadata Sync

Status: **fixed and committed**.

Symptom:

- User-facing chat failed with `Agent authentication failed`.
- Local trusted credential file had become `{}` earlier in the session.

Root cause:

- Browser agent storage correctly strips credentials before writing localStorage.
- But local trusted registry writes derived the whole credential file only from the current write payload.
- If a later metadata-only sync rewrote an existing agent without `apiKey`, the credential file could lose that key.

Fix applied:

- `writeLocalTrustedAgentRegistry` now reads existing credentials first.
- It preserves credentials for agents still present in registry metadata.
- It only removes credentials for agents that no longer exist in the registry.
- New explicit credentials still replace old credentials for that agent.
- Added a regression test covering metadata rewrite without key plus deletion cleanup.

Risk remaining:

- This is still plain local trusted prototype storage, not OS-backed secure storage.

## P1 Findings

### P1-1 App State Orchestration Is Still Too Centralized

Status: **known architecture debt**.

Evidence:

- `src/App.tsx` is still about 1868 lines after extracting the right Output Area shell and Agent setup save-state helpers.
- Major components were extracted, but `App.tsx` still owns too much state coordination and request wiring.
- The new `src/components/OutputPanel.tsx` centralizes Free Chat history, project output tabs, Browser preview, grouped Outputs, and no-project right-panel state.
- The new `src/services/agentSetupState.ts` centralizes add/edit/deduplicate/chief-normalization behavior and keeps credential-bearing payloads separate from UI agent state.

Impact:

- Small UI changes can accidentally affect request lifecycle, project scope, or output state.
- Harder to reason about refresh recovery and selected agent/project behavior.

Recommendation:

- Continue M7-1 and split `App.tsx` into workspace shell state, agent registry controller, project workspace controller, and request/session controller.

### P1-2 Provider Readiness Is Mixed

Status: **partially healthy; setup guard added in working tree**.

Current safe readiness result:

- Hermes target: ready and full M9 matrix passed on 2026-06-19 through local trusted agent `agent-1781701191359`.
- DeepSeek OpenAI-compatible target: missing key.
- MiniMax Anthropic-compatible target: provider mismatch; currently registered as OpenAI-compatible.

Impact:

- The M9 real provider matrix cannot be trusted as complete until these provider records are corrected.
- Some failures will look like chat/runtime bugs even when they are configuration bugs.

Recommendation:

- Add provider-specific setup validation before saving:
  - Hermes
  - OpenAI-compatible
  - Anthropic-compatible
- Make provider mismatch visible inside Add/Edit Agent before the user starts chatting.

Working-tree update:

- Add/Edit Agent now labels provider types as Hermes, OpenAI-compatible, and Anthropic-compatible.
- The app blocks obvious endpoint/provider mismatches before connection tests or saves, such as an OpenAI-compatible record pointing at an `/anthropic` or `/messages` endpoint.

### P1-3 Historical Handoff Docs Had Stale Credential Statements

Status: **fixed and committed**.

Evidence:

- `docs/HANDOFF.md` and `docs/NEW_CHAT_HANDOFF.md` mentioned browser localStorage API-key storage from older prototype stages.

Impact:

- Future work could reintroduce old assumptions if these docs drift again.

Recommendation:

- Keep docs aligned with the current boundary:
  - Browser localStorage stores agent metadata only.
  - Local trusted layer owns prototype credential storage.
  - Packaged release must move credentials to OS-backed secure storage.

### P1-4 Error States Are Better But Still Too Technical

Status: **partially healthy**.

Evidence:

- Typed failures and Retry exist.
- But messages like auth/provider mismatch still do not always tell the user which exact agent configuration needs action.

Impact:

- Users will keep asking "what happened?" when the issue is fixable in agent setup.

Recommendation:

- Add an inline "Open agent settings" action on auth/provider mismatch failures.
- Distinguish:
  - missing key
  - wrong provider type
  - provider returned 401/403
  - endpoint path wrong

## P2 Findings

### P2-1 Right Output Area Still Feels Heavier Than The Product Goal

Status: **design debt**.

The user already pointed out the nested-card feeling. The output area has been simplified, but the current design still needs a light pass:

- flatter right-panel sections
- fewer bordered boxes inside bordered boxes
- simpler history/output lists
- clearer per-agent grouping

### P2-2 Test Coverage Is Good For Services, Thin For Real Provider UX

Status: **acceptable for prototype, not enough for release**.

Browser smoke covers many lifecycle states, but real provider tests still depend on local keys and correct provider registration.

Recommendation:

- Keep `npm run smoke:browser` as baseline.
- Treat `npm run regression:providers` as a gated pre-milestone check once provider setup is corrected.

## Current Health Score

| Area | Health | Notes |
| --- | --- | --- |
| Build | Good | `npm run build` passes. |
| Service tests | Good | 26 tests pass. |
| Browser smoke | Good | Smoke passes. |
| Credential safety | Improved | P0 fixed and committed; still prototype storage. |
| Provider matrix | Medium/Weak | Readiness still mixed. |
| Request lifecycle | Medium/Good | Much better after Stability Pass, but real provider interruptions still need more UX polish. |
| UI architecture | Medium | Components split, but `App.tsx` remains too large. |
| Docs accuracy | Medium | Known credential boundary docs were updated in this pass; keep future handoffs aligned. |

## Recommended Next Development Plan

### Step 1: Commit The Credential Preservation Fix

Scope:

- Preserve credentials during metadata-only registry rewrites.
- Keep credential store path override for isolated tests and future packaged runtime.
- Include `localTrusted` in TypeScript checking.
- Add regression test.

Definition of done:

- `npm test`
- `npm run build`
- `npm run smoke:browser`
- `npm run regression:providers:list`

### Step 2: Provider Setup Hardening

Goal:

Stop users from saving provider records that are obviously wrong.

Work:

- Add runtime provider choices: Hermes, OpenAI-compatible, Anthropic-compatible.
- Validate endpoint/model shape per provider.
- Keep instance location and Host/IP as local registry notes.
- Show "missing key" and "provider mismatch" before chat.

### Step 3: App Shell Stabilization

Goal:

Make refresh/switching feel like one coherent app.

Work:

- Continue shrinking `App.tsx`.
- Move selected agent/project/free-chat history orchestration into dedicated controller hooks or services.
- Keep Free Chat as a stable default entry.
- Keep Project Workspace explicit and separate.

### Step 4: Output Area Light UI Pass

Goal:

Return to the user's intended core skeleton:

```txt
List Area + Conversation Area + Output Area
```

Work:

- Flatten right-panel cards.
- Keep Chat History simple in Free Chat.
- In Project Workspace, group outputs by agent and type.
- Make Browser a lightweight preview tab, not a competing workspace.

### Step 5: M9 Real Provider Matrix

Goal:

Verify Hermes, OpenAI-compatible, and Anthropic-compatible providers with real configured records.

Work:

- Fix provider records and keys.
- Run full matrix:
  - connection
  - free chat
  - project chat
  - forced timeout
  - retry after timeout
  - Chinese context continuity

## Recommendation

Do **not** start a major new feature yet.

First land the credential preservation fix, then harden Add/Edit Agent and provider setup. After that, continue the M7 IA/UI simplification. The platform is close enough to be useful, but the next few hours should be stabilization work, not feature expansion.
