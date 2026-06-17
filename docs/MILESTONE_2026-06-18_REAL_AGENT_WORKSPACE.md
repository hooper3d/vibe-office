# Milestone: Real Agent Workspace Prototype

Date: 2026-06-18

Status: recorded

## Summary

Vibe Office has reached a real-agent workspace prototype milestone.

The app can register real Hermes-compatible agents, persist them locally, select agents inside a Project, run Direct Chat, render the conversation, and keep project-scoped output records isolated across Projects.

This milestone is the bridge between:

- M1 Real Direct Chat
- M2 Persistent Project State
- M3 Agent Management

It does not yet include real local file access for agents.

## Verified Capabilities

- App runs at `http://127.0.0.1:5180/`.
- No fake/demo agents are seeded in the product UI.
- Local Hermes can be configured as a real connected agent.
- A remote Hermes-compatible provider can be configured through the same agent profile flow.
- OpenAI-compatible `/v1/chat/completions` fallback works for providers that are not native A2A servers.
- Direct Chat stores user and agent messages in the center conversation panel.
- Direct Chat creates visible run records in the right Output Workspace.
- Project switching isolates conversations, runs, tasks, and artifacts.
- Browser refresh restores agents, projects, conversations, messages, runs, tasks, and artifacts from localStorage.
- Agent editing supports:
  - avatar upload
  - name
  - office role: Chief, Builder, Writer, Operator
  - capability tags
  - private notes
  - instance location
  - host/IP
  - runtime type
  - model or agent id
  - API base URL
  - API key
  - generated A2A endpoint
  - generated Agent Card URL
  - namespace prefix
  - timeout
  - delete
- Sidebar agent rows have a hover edit entry and stable text truncation.
- Project creation records a local project directory reference.
- Project name can be derived from the selected or pasted directory path.

## Current Data Layer

Current persistence is browser-local prototype storage:

- agents: `localStorage`
- projects: `localStorage`
- conversations: `localStorage`
- messages: `localStorage`
- runs: `localStorage`
- tasks: `localStorage`
- artifacts: `localStorage`
- theme preference: `localStorage`

This is acceptable for prototype/dev only.

## Boundaries

Project directory is currently only a registry reference.

Agents cannot read files from that directory yet.

Remote agents do not receive local files automatically.

API keys are stored in browser localStorage for prototype/dev only and must not be committed, logged, screenshotted, exported, or copied into docs.

Hermes is a provider adapter, not the Vibe Office product boundary.

## Not Yet Done

- Real local workspace file layer.
- Secure local credential storage.
- Native desktop/backend directory permissions.
- Controlled file tools:
  - list files
  - read file
  - search files
  - attach selected context to a chat/task
- Chief-led multi-agent Task Room.
- Long-running A2A task lifecycle polling.
- Full artifact viewer.
- Export/import with credential redaction.

## Next Milestone

M2.5 Workspace File Layer

Goal:

Bind a Project to a real local workspace path and expose controlled file access through Vibe Office, not directly through remote agents.

Minimum acceptance:

- User selects or pastes a Project directory.
- Vibe Office can list files under that directory through a local trusted layer.
- User can inspect a file before sending it to an agent.
- Agent chat/task requests include only explicitly selected or tool-requested file context.
- Remote agents cannot directly access the user's filesystem.
- Secrets stay out of exported workspace data and logs.
