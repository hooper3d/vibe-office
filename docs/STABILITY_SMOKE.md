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

## Still Needed

- Browser-visible provider timeout failure check.
- Browser-visible Direct Chat retry check.
- Browser-visible Task Room retry check.
