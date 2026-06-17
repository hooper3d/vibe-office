# Vibe Office Development Plan

## Vision

Vibe Office is a unified workspace for real agent instances.

The first product problem is entry fragmentation: users already have useful agents, but they are scattered across different apps, devices, servers, and contexts.

The second product problem is one-agent overload: different task types pollute one agent's memory and personality when everything is forced through a single assistant.

Vibe Office solves this by aggregating real agent instances while keeping their memory, identity, and context boundaries intact.

## v0.1 Product Definition

```txt
Vibe Office v0.1
= Three-column UI
+ Agent Registry
+ A2A Client
+ Provider Adapter
+ Project Scope
+ Direct Chat
+ Chief-led Task Room
+ Task / Artifact display
```

## v0.1 Product Acceptance Scenario

Vibe Office v0.1 is considered complete when:

1. The app starts with no fake/demo agents.
2. User connects at least one real agent from Office Setup.
3. The connected agent appears in the Agent Registry with real status.
4. User creates or selects a Project.
5. User can direct-chat with the agent inside that Project.
6. The center panel shows the conversation.
7. The right Output Workspace shows the related run/task and produced artifact or response.
8. Switching to another Project hides the previous Project's conversation, runs, tasks, and artifacts.
9. Refreshing the browser restores agents, projects, conversations, runs, tasks, and artifacts.
10. User can assign one real connected agent as Chief and start a Chief-led Task Room.

## Non-Negotiable Boundaries

- A2A is the Phase 1 communication foundation.
- Do not invent a competing agent communication protocol.
- Do not show fake/demo agents in the product UI.
- Chief is a role assigned to one real connected agent.
- Project Scope isolates conversations, tasks, artifacts, and context.
- Provider adapters may support non-native A2A providers, but the app-facing contract remains A2A-shaped.
- Generic UI must not imply the product is Hermes-only.

## Current Architecture

```txt
UI
  Sidebar
    Agent Registry
    Projects
    Office Setup

  Conversation Panel
    Direct Chat
    Chief-led Task Room
    Composer

  Output Workspace
    Browser
    Tasks / Outputs
    Artifacts

Application State
  Agents
  Projects
  Project-scoped Conversations
  Project-scoped Messages
  Project-scoped Runs
  Project-scoped Tasks
  Project-scoped Artifacts
  Theme preference

A2A Boundary
  A2A Client
  Provider Adapter
  Agent Card discovery
  Protocol/interface selection
  message/send
  Task state
  State mapping
  Artifact mapping

Provider Adapter
  Capability matrix
  Hermes native A2A attempt
  Hermes health fallback
  OpenAI-compatible chat/completions fallback
```

## Current Local Development Setup

Install:

```bash
npm install
```

Start:

```bash
npm run dev -- --host 127.0.0.1 --port 5180
```

Build:

```bash
npm run build
```

Local app:

```txt
http://127.0.0.1:5180/
```

Local WSL Hermes:

```txt
http://127.0.0.1:8642/v1/chat/completions
```

Vite proxy:

```txt
/hermes-local/* -> http://127.0.0.1:8642/*
```

Do not hardcode API keys. Enter keys through Office Setup.

## Data Model Direction

Agent:

- id
- name
- role
- location
- endpoint
- a2aEndpoint
- agentCardUrl
- apiKey
- avatarUrl
- model
- tags
- status
- isChief

Project:

- id
- name
- namespace
- description

Conversation:

- id
- projectId
- mode: direct | task_room
- title
- primaryAgentId
- chiefAgentId
- participantAgentIds
- a2aContextId
- createdAt
- updatedAt

ConversationMessage:

- id
- conversationId
- projectId
- role: user | agent | system
- agentId
- contentParts
- a2aMessageId
- taskId
- status: sending | sent | failed
- createdAt

ProjectRun:

- id
- projectId
- conversationId
- taskId
- type: direct_message | a2a_task | chief_delegation
- ownerAgentId
- participantAgentIds
- state
- eventIds
- artifactIds
- createdAt
- updatedAt

ProjectTask:

- id
- projectId
- contextId
- title
- ownerAgentId
- participantAgentIds
- state
- summary
- events
- artifactIds
- updatedAt

ProjectArtifact:

- id
- projectId
- taskId
- agentId
- name
- kind
- summary
- createdAt

ProjectRun exists because the right Output Workspace represents an interaction, task, or execution process, not only durable artifacts. Direct chat may have no formal A2A Artifact and still needs a visible run record.

## Project Scope Rules

Every workspace action that creates or reads conversation, message, run, task, artifact, or context state must resolve to one active project.

Global actions such as Office Setup, provider credential management, agent capability refresh, and theme preference are explicit exceptions and must not silently read or write project-scoped state.

Scoped by Project:

- Conversations
- Messages
- Runs
- Tasks
- Artifacts
- Context snapshots
- Chief-led task rooms

Not scoped by Project:

- Agent Registry
- Provider credentials
- Agent capability metadata
- Theme preference

Forbidden:

- Sending messages without active project.
- Showing artifacts from another project.
- Reusing conversation history across projects.
- Injecting one project's context into another project.

## Provider Capability Matrix

Provider adapter must expose normalized capabilities:

- supportsA2A
- supportsAgentCard
- supportsTaskLifecycle
- supportsArtifacts
- supportsStreaming
- supportsCancel
- supportsRetry
- supportsHealthCheck
- supportsDirectChatOnly

Adapter modes:

1. Native A2A
   - Uses Agent Card discovery.
   - Uses A2A send message / task lifecycle / artifacts where supported.
2. A2A-shaped compatibility adapter
   - Wraps non-A2A provider into Vibe Office's internal A2A-shaped contract.
   - Must mark unsupported features explicitly.
3. Health-only provider
   - Can show status.
   - Cannot be selected for chat/task unless a send capability exists.

Agent discovery priority:

1. Explicit agentCardUrl
2. `/.well-known/agent-card.json`
3. Manual provider configuration

Health fallback is not discovery. It may only confirm whether a manually configured provider endpoint is reachable.

## Milestones

### Milestone 0: Real Agent Onboarding

Goal:

The app can connect one real provider-backed agent before any chat feature is considered complete.

Scope:

- Empty Agent Registry state.
- Add real agent through Office Setup.
- Support Local Hermes through the existing `/hermes-local` proxy.
- Retest connection.
- Show online / offline / error state.
- No fake/demo agents in product UI.

Acceptance:

- Fresh app has no demo agents.
- User adds `Local Hermes`.
- Connection test succeeds.
- `Local Hermes` appears in Agent Registry.
- User can select it for Direct Chat.

### Milestone 1: Real Direct Chat

Goal:

The center conversation panel becomes a real chat surface, not only a task launcher.

Scope:

- Store user messages and agent replies.
- Render chat bubbles in the center panel.
- Show sending/loading/error states.
- Keep messages scoped by Project and Agent.
- Send direct chat as an A2A message.
- Store direct A2A Message responses as conversation messages.
- Create or update ProjectTask only when the remote agent returns a Task.
- Create ProjectArtifact only when the agent returns task output or Vibe Office intentionally materializes a durable output.
- Allow the right Output Workspace to show a run/task record even when no formal A2A Artifact exists.

Acceptance:

- User sends a message to `Local Hermes`.
- User message appears in the center panel.
- Agent reply appears in the center panel.
- If the agent returns a Task, the right panel receives or updates a ProjectTask.
- If the agent returns a direct Message, the center panel stores it as conversation history.
- If the agent returns task output, the right panel shows the related Artifact.
- Switching Project hides the previous Project's chat history.

Direct Chat A2A Mapping:

- A direct chat sends an A2A message.
- If the remote agent returns a Task, Vibe Office creates/updates a ProjectTask.
- If the remote agent returns a direct Message, Vibe Office stores it as ConversationMessage.
- Artifacts are created only when the agent returns task output or when Vibe Office intentionally materializes a durable output.
- The right Output Workspace may show a run/task record even when no formal A2A Artifact exists.

### Milestone 2: Persistent Project State

Goal:

Refresh does not lose the core workspace state.

Scope:

- Persist project-scoped conversations.
- Persist project-scoped tasks.
- Persist project-scoped artifacts.
- Keep Agent Registry in local storage for v0.1.
- Add migration/version handling for local data.

Acceptance:

- Refresh keeps agents, conversations, tasks, and artifacts.
- Switching Project still isolates all state.
- Corrupt local data fails safely.

### Milestone 3: Agent Management

Goal:

Office Setup becomes a usable provider management surface.

Scope:

- Edit connected agent.
- Delete connected agent.
- Retest connection.
- Set Chief.
- Disable/enable agent.
- Avoid duplicate local provider entries.

Acceptance:

- User can change Chief from Office Setup.
- User can remove accidental agents.
- User can retest a provider without re-entering all fields.
- Registry never shows demo agents.

### Milestone 4: Chief-led Task Room

Goal:

Task Room becomes real multi-agent coordination.

Scope:

- Chief receives the user's task.
- User can manually override participants before dispatch.
- Chief decides participant agents.
- Chief sends delegated A2A tasks.
- Task events show per-agent progress.
- Results are collected into project artifacts.
- No autonomous long-running multi-step planning in v0.1.

Chief-led Task Room v0.1 Boundary:

- Chief can perform only one planning round.
- Chief can delegate only one task per selected participant.
- Participant agents do not recursively delegate.
- Chief aggregates results once.
- User can manually override participants before dispatch.
- No autonomous long-running multi-step planning in v0.1.

Acceptance:

- User starts a task in Task Room.
- Chief is the owner.
- One or more participant agents receive delegated tasks.
- Right panel shows task state per participant.
- Artifacts are grouped under the project task.

### Milestone 5: Artifact Viewer

Goal:

Artifacts become inspectable output, not just summaries.

Scope:

- Click artifact to view content.
- Text artifact preview.
- JSON artifact preview.
- URL artifact opening.
- Copy content.
- Download where applicable.

Acceptance:

- User can inspect `Local Hermes response`.
- User can copy artifact content.
- Artifacts remain project-scoped.

### Milestone 6: A2A Task Lifecycle

Goal:

Support longer-running agent tasks.

Scope:

- Poll task status.
- Show submitted, working, input-required, completed, failed, canceled.
- Track A2A protocol version and selected interface.
- Map A2A task states into internal UI states.
- Retry failed tasks.
- Cancel tasks where supported.
- Prepare for streaming later.

Acceptance:

- Long-running tasks update without refreshing.
- Failed tasks show clear reason and retry action.
- A2A task state maps cleanly into internal task state.
- Unsupported provider lifecycle capabilities are disabled or clearly marked.

## A2A Version / State Mapping

A2A client must track:

- protocolVersion
- transportBinding
- supportedInterfaces
- selectedInterface
- lastCompatibilityCheckAt

Requests must send the selected A2A version information only when the chosen transport binding requires or supports it. For HTTP bindings, use `A2A-Version` when speaking to a native A2A endpoint; compatibility adapters must not fake native version support unless they can enforce the mapped contract.

Internal task state:

- idle
- submitting
- submitted
- working
- input_required
- completed
- failed
- canceled
- unsupported

A2A states must be mapped into internal states instead of directly leaking protocol enums into UI.

## UI Rules For Development

- Keep the three-column layout.
- Keep output workspace as right panel.
- Do not add a canvas/graph surface unless explicitly requested.
- Do not add marketing hero sections.
- Use icon-only controls for small utility actions.
- Keep text minimal.
- Prefer borders over heavy shadows.
- Avoid nested cards.
- Keep status colors only for actual status.

## Security Notes

Prototype:

- API keys are currently in browser localStorage.
- Browser localStorage secrets are allowed only in prototype/dev mode.

Next stage:

- Move secrets to a local backend or desktop secure storage.
- Any public release must move secrets out of browser localStorage.
- UI must show a visible dev/prototype warning when secrets are stored locally.
- Provider API keys must never be exported with workspace data.
- Logs must redact credentials, Authorization headers, and provider endpoints containing tokens.
- Never include keys in screenshots, docs, commits, logs, or seed files.
- Avoid sending provider credentials anywhere except the intended provider endpoint.

## Definition Of Done

For every development step:

- Build passes.
- UI remains aligned with `DESIGN.md`.
- No fake agents are reintroduced.
- Project Scope is preserved.
- Agent provider labels stay generic unless naming a real provider.
- Local Hermes integration still works through `/hermes-local`.

Behavioral Definition Of Done:

For every feature:

- It works with at least one real connected agent.
- It does not require demo agents.
- It preserves active Project Scope.
- It writes state only to the expected project.
- It produces a visible event/run/task/artifact record where applicable.
- Refresh does not corrupt existing local data.
- Error states are visible to the user.
- Unsupported provider capabilities are disabled or clearly marked.
