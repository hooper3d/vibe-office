# Vibe Office Handoff

Last updated: 2026-06-17

## Current Goal

Vibe Office is being rebuilt as an A2A-native workspace for aggregating real agent instances.

The current prototype has moved past static UI mockup. It can connect to a real local Hermes runtime running inside WSL through a Vite proxy, send a chat completion request, and adapt the response into Vibe Office's A2A Task / Artifact surface.

## Product Boundary

Vibe Office is:

- A unified entry for real agent instances.
- An Agent Registry.
- A Project-scoped workspace.
- An A2A Client plus provider adapters.
- A Task and Artifact display surface.

Vibe Office is not:

- An agent/persona creator.
- A custom agent communication protocol.
- A canvas/graph relationship editor.
- A place where different agents' private memory is merged.

## Current Tech Stack

- Vite
- React 19
- TypeScript
- Plain CSS tokens
- lucide-react icons
- Browser localStorage for the current prototype configuration

Useful commands:

```bash
npm run dev -- --host 127.0.0.1 --port 5180
npm run build
```

Current local app URL:

```txt
http://127.0.0.1:5180/
```

## Local Hermes Integration

The current real provider is a Hermes runtime running inside WSL.

Known local endpoint:

```txt
http://127.0.0.1:8642/v1/chat/completions
```

Known model:

```txt
hermes-agent
```

Important:

- Do not commit API keys into source files or docs.
- The API key is entered in Office Setup and stored by the local trusted layer prototype credential registry.
- Browser localStorage must store agent metadata only, not provider secrets.
- `/v1/models` returned unauthorized during testing, but `POST /v1/chat/completions` works with the correct key.

Vite proxy:

```txt
/hermes-local/* -> http://127.0.0.1:8642/*
```

The proxy removes the browser `Origin` header because the WSL Hermes runtime rejected browser-originated proxy requests with `403` until this was removed.

## Current Implementation Status

Done:

- Three-column app shell.
- Draggable center/right split.
- Dark and light theme toggle.
- Agent Registry uses real configured agents only.
- Old fake demo agents were removed.
- Office Setup opens provider configuration.
- Office Setup can mark one real agent as Chief.
- Local Hermes is connected through `HermesA2AAdapter`.
- If a provider does not expose a native A2A Agent Card, Hermes health and chat completion are adapted into A2A-compatible behavior.
- Composer can send a message to the selected agent.
- Right panel shows project-scoped Tasks and Artifacts.
- Project Scope filtering exists for Tasks and Artifacts.

Current important files:

```txt
src/App.tsx
src/styles.css
src/domain/a2a.ts
src/domain/types.ts
src/domain/projectScope.ts
src/domain/hermesSetup.ts
src/domain/seedData.ts
src/services/a2aClient.ts
src/services/hermesA2AAdapter.ts
src/services/agentStorage.ts
vite.config.ts
```

## Current UX Notes

Left sidebar:

- Shows only real configured agents.
- `Local Hermes` is currently the real connected agent.
- If only one real agent exists, it is automatically Chief.

Center conversation:

- Can submit messages to the selected agent.
- The communication path works.
- Conversation history is not yet rendered as proper chat bubbles.
- User and agent messages currently surface mainly through the Task and Artifact output area.

Right output area:

- `Browser` exists as an output mode.
- `Outputs` shows A2A Task state.
- `Artifacts` shows generated artifacts.
- Artifact content is currently summarized, not fully previewable.

Office Setup:

- Shows connected agents.
- Can set a connected agent as Chief.
- Can add a provider with A2A endpoint, Agent Card URL, API key, model, role, tags, and location.

## Known Gaps

Highest priority:

- Render real chat messages in the center conversation area.
- Persist chat history by Project.
- Persist Tasks and Artifacts beyond the current runtime session.
- Add edit/delete/retest actions for connected agents.
- Make Task room perform real Chief-led multi-agent dispatch.

Other gaps:

- No encrypted local secret storage yet.
- No backend service yet.
- No streaming task updates yet.
- No A2A polling loop for long-running tasks yet.
- No full artifact viewer yet.
- No import/export for configuration.

## Design Constraints

Before any frontend UI work, read:

```txt
docs/DESIGN.md
docs/UI_COMPONENTS.md
docs/UI_REVIEW_CHECKLIST.md
```

Current UI direction:

- Minimal.
- Calm.
- Professional.
- Studio/SaaS dashboard.
- No decorative canvas background.
- No fake agents.
- No hardcoded provider branding in generic UI surfaces.

Provider-specific names may appear only where they describe a real configured provider, such as `Local Hermes`.

## Verification Checklist For Next Developer

Run:

```bash
npm run build
```

Check in browser:

- Left sidebar shows only real connected agents.
- Office Setup bottom button only says `Office Setup`.
- Theme toggle switches light/dark.
- Sending a message to `Local Hermes` creates a Task in `Outputs`.
- The returned response appears as an Artifact in `Artifacts`.
- Switching Project does not show another Project's Task/Artifact.
