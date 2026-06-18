# Milestone: Workspace File Layer Prototype

Date: 2026-06-18

Status: recorded

## Summary

Vibe Office has moved the Project directory from a passive registry field into a real local workspace capability.

The app now has a minimum local trusted layer that can list, read, and search files under the selected Project directory. Users can preview a file first, then explicitly attach selected file content to the next Direct Chat request.

This milestone keeps the core boundary intact: remote agents still cannot read the user's disk. They receive only the file text that Vibe Office deliberately includes after user selection.

## Verified Capabilities

- Project directory can point to a real local workspace path.
- Workspace tab lists files and folders under the active Project directory.
- Folder navigation stays inside the selected Project root.
- Parent navigation works from nested folders back to the root.
- Workspace search returns matching file paths, line numbers, and short previews.
- File preview reads text files through the local trusted layer before context injection.
- Users can attach and remove selected file context from the composer.
- Direct Chat sends attached file excerpts only when the user explicitly attaches them.
- Conversation history stores lightweight file references, not the full file body.
- The Browser surface is separated into its own right-panel tab.
- The Tasks tab hides completed direct-message noise unless a real task or artifact needs tracking.
- Workspace layout keeps the header/search compact while the file list and preview fill available panel height.

## Local Trusted Layer

The Vite dev server exposes one local-only workspace command endpoint:

```txt
POST /workspace-local/command
```

Supported commands:

```txt
workspace.list
workspace.read
workspace.search
```

Access rules:

- Every request provides a Project root path.
- The server resolves requested paths inside that root.
- Path traversal outside the selected root is blocked.
- Heavy generated folders are skipped from listing/search.
- Large files are rejected for preview.
- Binary-like files are rejected for preview.
- Search is bounded by file size and result count.

## User-Controlled Context Injection

File context follows this flow:

```txt
Project directory
  -> local trusted layer list/search/read
  -> user previews file
  -> user attaches file
  -> next Direct Chat includes selected excerpts
  -> localStorage stores only file reference metadata
```

Remote agents do not receive:

- automatic workspace access
- full project directory listings in every request
- local path read tools
- hidden file content

## Current Data Layer

Persistent prototype state is still browser-local:

- agents
- projects
- conversations
- messages
- runs
- tasks
- artifacts
- lightweight workspace context references

Full attached file content is not persisted in localStorage.

## Boundaries

- This is a dev-server trusted layer, not a packaged desktop permission model.
- The file layer is local to Vibe Office and must not become a remote agent filesystem bridge.
- API keys remain prototype-only browser localStorage secrets.
- Provider credentials must never appear in docs, logs, screenshots, commits, or exported workspace data.
- Workspace access remains scoped to the active Project.

## Not Yet Done

- Native desktop folder picker and permission record.
- Secure local credential storage.
- Agent-requested file tools with human approval.
- Context budget management and truncation UI.
- Multi-file context pack review before sending.
- Artifact viewer for generated files.
- Chief-led Task Room orchestration.
- Long-running A2A task lifecycle polling.

## Next Milestone

M4 Chief-led Task Room foundation.

Goal:

Turn Task Room from a mode switch into a real project-scoped workflow surface where the Chief receives a task, the user can choose participants, and Vibe Office records delegated work as project tasks and runs.

Minimum acceptance:

- Task Room composer submits a project-scoped task request.
- A real Chief agent must be selected before dispatch.
- User can choose participant agents before sending.
- Vibe Office creates a visible parent task/run record.
- The Chief response is stored in the project conversation.
- Remote agents still receive only explicit Project and workspace context.
