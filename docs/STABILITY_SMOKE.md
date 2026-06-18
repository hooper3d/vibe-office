# Stability Smoke Checks

This file records lightweight browser-visible checks for the Stability Pass.

## Refresh Restore Smoke

Purpose:

- Verify refresh does not make the app feel like a different application.
- Verify selected agent, selected project, output tab, composer scope, and Workspace panel survive a browser reload.

Latest check:

- Date: 2026-06-18
- App URL: `http://127.0.0.1:5180/`
- Browser state before reload:
  - Active agent: `Lucy`
  - Active project: `Vibe Office`
  - Active output tab: `Workspace`
  - Composer placeholder: `Ask Lucy in Vibe Office`
  - Workspace panel: project file list visible
- Browser state after reload:
  - Active agent: `Lucy`
  - Active project: `Vibe Office`
  - Active output tab: `Workspace`
  - Composer placeholder: `Ask Lucy in Vibe Office`
  - Workspace panel: project file list visible
- Result: passed.

Notes:

- The smoke is intentionally read-only and does not send messages to a provider.
- The service test runner now removes its `.tmp` output folder so test artifacts do not appear in the Workspace file list.

## Timeout Failure Smoke

Purpose:

- Verify a failed provider timeout message is restored as an inline failed user message.
- Verify the visible UI shows the typed failure label and Retry action.
- Avoid sending a real provider request during the smoke.

Latest check:

- Date: 2026-06-18
- Command: `npm run smoke:browser`
- App URL: `http://127.0.0.1:5180/`
- Seeded state:
  - Active agent: `Smoke Agent`
  - Active scope: `Free Chat`
  - Failed user message: `errorKind: timeout`
- Browser-visible result:
  - Active agent: `Smoke Agent`
  - Active project entry: `Free Chat`
  - Conversation title: `Smoke Agent`
  - Failure label: `Timeout`
  - Failure text includes: `Agent did not respond before the timeout.`
  - Retry button: visible
- Result: passed.

Notes:

- The smoke runs in an isolated Playwright browser context backed by local Microsoft Edge.
- The smoke seeds localStorage inside that isolated context and does not touch the user's in-app browser state.
- Set `VIBE_OFFICE_BROWSER` if Edge is installed in a non-default path.

## Retry Click Flow Smoke

Purpose:

- Verify a failed Direct Chat message can be retried from the visible UI.
- Verify a failed Task Room user message can be retried from the visible UI.
- Verify retry increments the original request attempt instead of creating a detached message.
- Verify successful retry clears the inline failure and removes the Retry action.

Latest check:

- Date: 2026-06-18
- Command: `npm run smoke:browser`
- App URL: `http://127.0.0.1:5180/`
- Seeded Direct Chat state:
  - Active agent: `Smoke Agent`
  - Active scope: `Free Chat`
  - Failed user message: `errorKind: timeout`
- Seeded Task Room state:
  - Active project: `Retry Smoke Project`
  - Active mode: `Task Room`
  - Failed user message linked to a failed project task/run
- Browser-visible result:
  - Direct Chat retry renders `Recovered direct retry reply.`
  - Direct Chat original user message becomes `sent`
  - Direct Chat original request attempt becomes `2`
  - Task Room retry renders `Recovered task room retry result.`
  - Task Room original user message becomes `sent`
  - Task Room original request attempt becomes `2`
  - Task Room project task becomes `completed`
  - Retry action is removed after successful recovery
- Result: passed.

Notes:

- Provider calls are intercepted inside the isolated Playwright browser context and return deterministic OpenAI-compatible responses.
- The smoke verifies Vibe Office retry state, not external provider availability.

## Still Needed

- Browser-visible interrupted pending request recovery for Direct Chat after reload.
- Browser-visible interrupted pending request recovery for Task Room after reload.
