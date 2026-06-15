# Office Provisioning Handoff

Date: 2026-06-14 morning
Workspace: `C:\Users\hooper\Documents\AG_UI`
Branch: `codex/phase1-portable-preview`
Local app: `http://localhost:3000/?setupTest=1`

## Current Direction

Vibe Office is no longer an MVP mock. The current target is a single reliable path:

1. The user opens Vibe Office.
2. The user provides a working model provider key.
3. Vibe Office verifies the key and lets the user select a model.
4. Vibe Office checks the local Hermes environment.
5. Vibe Office uses the user's existing/default Hermes Agent as Chief.
6. Vibe Office creates three worker profiles only:
   - `vibe-engineer`
   - `vibe-content`
   - `vibe-tools`
7. The user enters the Agent Office and can talk to the selected agent.

Do not recreate the old Lucy/Ray/Tiger/Musk demo team for this path.
Do not overwrite the user's default Hermes Agent.

## Verified Today

Commands passed:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

`git diff --check` currently reports only line-ending warnings:

- `.gitignore`: LF will be replaced by CRLF when Git touches it.
- `lib/artifacts.ts`: CRLF will be replaced by LF when Git touches it.

No whitespace errors were reported.

## What Works Now

- The main onboarding path is `components/RuntimeQuickStart.tsx`.
- The reset/test entry is `http://localhost:3000/?setupTest=1&reset=1`.
- The welcome screen hides the normal Office sidebar when no setup session exists.
- The model provider picker in `RuntimeQuickStart` uses a custom menu, not a native browser select.
- Invalid model keys no longer advance the flow.
- Model list fetching is separate from key verification.
- The local Hermes check page stops for user confirmation instead of auto-skipping.
- The Office settings page allows custom names for Chief plus the three worker agents.
- Existing/default Hermes is treated as Chief.
- Worker profile setup creates only the three worker profiles.
- Active Agent Office uses the formal canvas path again, not the old 3001/test preview canvas.
- The bottom dock is present in the active Office canvas.
- The Agent list can switch selected agents.
- The Office chat composer has image paste/drop UI restored.
- The old header badge `Agent Engine Ready` was removed.
- The Office chat panel no longer injects the debug intro block like `Manager Agent is online`.

## Known Critical Risks

### P0: Worker chat is not truly profile-routed yet

`app/api/provision/hermes/chat/route.ts` accepts `profileName`, but it still posts every message to the same `baseUrl`:

```ts
fetch(`${baseUrl}/chat/completions`, ...)
```

The profile name is currently only metadata plus a system prompt. It does not switch the running Hermes profile or gateway.

Observed local Hermes state today:

```text
default        running
vibe-engineer stopped
vibe-content  stopped
vibe-tools    stopped
```

This explains why worker chats can show memory from the user's default Hermes Agent. Until this is fixed, worker chat should be considered a UI shell over the default Hermes runtime, not isolated worker execution.

Next implementation should define one real contract:

- either start a gateway per profile and store each profile's `baseUrl`
- or add a Hermes-supported profile switch mechanism to the chat API
- or temporarily disable worker chat until profile-specific runtime is ready

### P0: Worker memories/templates are not applied yet

`lib/hermes-profiles.ts` currently creates missing workers with:

```ts
hermes profile create <profileName> --clone
```

Then it writes a generated `SOUL.md` only for newly created profiles.

This is not the final desired behavior. The correct next step is:

- create the three worker profiles if missing
- apply Vibe Office template memory/context files to the workers
- do not copy or expose the user's default Hermes memory into workers
- keep the default Chief profile untouched
- make the operation idempotent and explicit

Existing worker profiles are currently left unchanged, so template updates will not refresh them.

## Other Risks

### P1: Two onboarding surfaces still exist

The current user-facing path is `RuntimeQuickStart`.

`components/onboarding/ProvisioningOnboarding.tsx` and `app/onboarding/page.tsx` still exist. That older flow still contains native `<select>` controls and older product concepts. Decide whether to delete it, make it developer-only, or update it to the same state model.

### P1: `app/page.tsx` is overloaded

`app/page.tsx` is roughly 3,500 lines and now owns onboarding state, Hermes setup, Office chat, artifact upload, sidebar behavior, and canvas routing. This caused several regressions during merge work.

Recommended extraction order:

1. `useOfficeSetupSession`
2. `useOfficeAgentChat`
3. `OfficeSidebar`
4. `OfficeWorkspace`
5. setup route/state helpers

### P1: Image attachments are UI-only for Hermes chat

The Office composer can paste/drop images again and stores them as artifacts in the UI message, but `/api/provision/hermes/chat` sends only text to Hermes. Do not claim multimodal support until Hermes receives image payloads.

### P2: Test flags are still part of normal development flow

`?setupTest=1` and `?reset=1` are useful for now, but they should not become the production entry model.

### P2: Remaining UI cleanup

- The small numeric badge in the top-right header is still unexplained.
- Some old setup copy may still be reachable through the developer setup path.
- Some console reads show mojibake for Chinese text, although the browser renders correctly. Verify encoding before broad text edits.

## Suggested Next Work Order

1. Freeze broad UI changes until the runtime/profile contract is fixed.
2. Implement profile-specific Hermes chat routing.
3. Add a guard so worker chat is disabled or clearly unavailable when the worker gateway/profile runtime is not active.
4. Implement worker template application:
   - `SOUL.md`
   - memory/context files
   - per-role defaults
   - no writes to default Chief unless explicitly confirmed
5. Re-test:
   - clean reset onboarding
   - key verification
   - model list fetch
   - local Hermes check
   - worker profile creation
   - Chief chat
   - worker chat isolation
   - canvas dock
   - sidebar agent switching
   - paste image UI
6. Only after that, do a unified visual polish pass.

## Useful Files

- `components/RuntimeQuickStart.tsx`: current main onboarding UI.
- `app/page.tsx`: current app orchestration and Office active chat.
- `app/api/provision/hermes/chat/route.ts`: current Hermes chat bridge; profile routing is not real yet.
- `lib/hermes-profiles.ts`: creates worker profiles and writes worker `SOUL.md`.
- `lib/hermes-runtime.ts`: locates native Windows or WSL Hermes CLI and starts/checks gateway.
- `lib/office-templates.ts`: current Chief plus three-worker office template.
- `components/AgentStatus.tsx`: formal Agent Office canvas.
- `components/RequirementComposer.tsx`: composer with paste/drop image hooks.

## Handoff Summary

The app is stable enough to continue from the current branch, but it is not yet safe to treat worker agents as isolated Hermes agents. The next conversation should start by fixing the Hermes profile runtime contract before adding more onboarding UI.

## 2026-06-14 Midday Update

Ray implemented the first profile runtime safety contract.

What changed:

- `GET /api/runtime/profiles` now reports default and worker profile runtime readiness.
- `/api/provision/hermes/chat` no longer sends worker messages to the default Hermes base URL.
- Worker chat now requires both:
  - a dedicated worker profile base URL, configured through `VIBE_OFFICE_HERMES_PROFILE_BASE_URLS` or `VIBE_OFFICE_HERMES_PROFILE_<PROFILE>_BASE_URL`
  - a running Hermes gateway for that worker profile
- If either condition is missing, worker chat returns `409 profile_runtime_unavailable`.
- The Office composer shows a disabled state for unavailable worker profiles.
- Worker profile apply now refreshes Vibe Office templates every time:
  - `SOUL.md`
  - `memories/MEMORY.md`
  - `memories/USER.md`
  - `VIBE_OFFICE_CONTEXT.md`

Verified local state after the change:

```text
default        running      chatAvailable=true
vibe-engineer stopped      chatAvailable=false
vibe-content  stopped      chatAvailable=false
vibe-tools    stopped      chatAvailable=false
```

Validation passed:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Current remaining P0:

- Vibe Office still does not start or register dedicated per-worker Hermes API gateways.
- The next implementation should define and automate the per-profile gateway/baseUrl startup path.
- Until then, worker chat is safely disabled instead of leaking to the default Chief Agent.

## 2026-06-14 Worker Runtime Update

Ray implemented local per-worker Hermes gateway startup.

What changed:

- Worker profiles now get dedicated API server settings in their own `.env` files.
- Default local ports:
  - `vibe-engineer`: `http://127.0.0.1:8650/v1`
  - `vibe-content`: `http://127.0.0.1:8651/v1`
  - `vibe-tools`: `http://127.0.0.1:8652/v1`
- `/api/runtime/profiles` accepts `startRuntimes=true`.
- When startup is requested, Vibe Office refreshes worker templates, writes API server env values, and starts each worker gateway.
- WSL profile gateways are started through detached Windows-owned `wsl.exe` processes; shell backgrounding from WSL did not persist.
- `/api/provision/hermes/chat` now reads the selected worker profile API key from that profile's `.env`.
- Profile status now reads `hermes gateway list` once per request and maps the result to all profiles.

Verified local state:

```text
default        running      http://127.0.0.1:8642/v1
vibe-engineer running      http://127.0.0.1:8650/v1
vibe-content  running      http://127.0.0.1:8651/v1
vibe-tools    running      http://127.0.0.1:8652/v1
```

Worker chat smoke tests:

```text
vibe-engineer -> engineer-runtime-ok
vibe-content  -> content-runtime-ok
vibe-tools    -> tools-runtime-ok
```

Remaining risks:

- Add explicit stop/restart controls for worker runtimes.
- Detect port conflicts before assigning `8650`-`8652`.
- Consider hiding or suppressing non-API messaging platform conflicts for worker gateways; local logs showed Weixin token conflicts with the default gateway, but the API server still came up.
