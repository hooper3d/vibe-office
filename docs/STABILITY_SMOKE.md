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

## Still Needed

- Browser-visible Direct Chat retry click flow.
- Browser-visible Task Room retry click flow.
