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
- officeRole: chief | builder | writer | operator
- role
- location
- endpoint
- a2aEndpoint
- agentCardUrl
- apiKey
- avatarUrl generated from uploaded avatar image in prototype local storage
- ipAddress optional local registry note, not injected into agent memory or chat
- model
- tags
- status
- isChief

Project:

- id
- name
- namespace
- description
- directory optional local folder reference used by the local trusted layer

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

Free Chat uses a fixed non-project entry in the sidebar, but persisted free-chat conversations are stored under a separate internal free-chat project id so they do not create ProjectRun, ProjectTask, ProjectArtifact, or workspace-file context records.

ConversationMessage:

- id
- conversationId
- projectId
- role: user | agent | system
- agentId
- contentParts
- a2aMessageId
- taskId
- runId
- requestId stable request identity for retry and recovery
- requestAttempt incremented when a failed/interrupted message is retried or recovered
- requestStartedAt
- requestCompletedAt
- workspaceContext lightweight attached file references
- status: sending | sent | failed
- errorKind: timeout | network | auth | not_found | context | interrupted | unknown
- errorText
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
- summary
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

### Current Recorded Milestone: M6 A2A Task Lifecycle

Status: completed on 2026-06-18.

The prototype now has project-scoped A2A task lifecycle handling. Remote task references are stored separately from local task ids, active remote tasks can be polled, failed tasks can be retried, supported tasks can be canceled, and unsupported provider capabilities are clearly marked.

Validated in browser:

- Local Hermes and one remote Hermes-compatible provider can be connected as real agents.
- Direct Chat can send to a selected real agent and render the user message plus agent reply in the center conversation.
- The Workspace tab can list real project files, navigate folders, search text, preview files, and attach selected file context.
- The Browser surface is separated into its own right-panel tab.
- Task Room requires a Chief and at least one selected participant before dispatch.
- Task Room creates parent `chief_delegation` runs and ProjectTask records.
- Chief receives the first planning request with the selected participant list.
- Vibe Office delegates one A2A task to each selected participant.
- Participant results and Chief summary are stored as project-scoped text artifacts.
- The Tasks tab shows per-agent task-room events inside the run card.
- The Artifacts tab has a selectable viewer with a list and detail pane.
- Text artifacts render as Markdown.
- JSON/data artifact parts render as formatted JSON.
- Image file artifacts render inline.
- Generated `MEDIA:/...` image references can become project-scoped artifacts through the local trusted layer.
- Copy, open URL, and download controls are available from the artifact detail view.
- Tasks tab exposes refresh, retry, and cancel lifecycle controls.
- Tasks tab shows simplified task metadata such as local/remote task, status tracking, and cancel availability.
- Local Chief-led orchestration tasks are marked as local when they do not have a remote A2A lifecycle link.
- Unsupported lifecycle and cancel capabilities are marked without granting remote agents local file access.
- Temporary local mock A2A server verification on `127.0.0.1:8765` confirmed:
  - `message/send` creates a submitted remote task.
  - automatic `tasks/get` polling advances the task to working and completed.
  - `tasks/cancel` updates an active remote task to canceled.
- Switching Project hides conversation and output records from other Projects.
- Refresh restores configured agents, projects, conversations, runs, tasks, and artifacts.
- Agent profile management supports avatar upload, role selection, capability tags, notes, host/IP, runtime settings, delete, and edit-from-sidebar.
- Project creation records a local project directory reference and can derive Project name from the directory path.

Important boundary:

- Remote agents still cannot read local files directly.
- File content is sent only when the user previews and attaches it.
- Full file bodies are not persisted in localStorage; conversation history stores lightweight file references.
- API keys are no longer written to browser localStorage after agent sync; the local trusted layer owns the prototype credential registry.
- A packaged release still needs native folder permission handling and OS-backed secure local credential storage.
- Chief-led Task Room is intentionally one-round in v0.1: one Chief plan, one delegated task per selected participant, and one Chief aggregation.
- Generated media is served only through the local trusted layer and currently allows known image files from controlled generated-media temp roots.

Next phase:

- M7 IA Reset: split Agent Free Chat from Project Workspace and return the product to the core `List Area + Conversation Area + Output Area` skeleton.
- Source design note: `docs/V0_2_IA_RESET.md`.

### Stability Pass: Request Lifecycle and Recovery

Status: completed on 2026-06-18.

Completion audit:

- `docs/STABILITY_PASS_COMPLETION_AUDIT.md`

Goal:

Stabilize the platform before expanding the next product stage. The core requirement is that conversations do not feel random after refresh, agent/project switches, provider timeouts, or local workspace errors.

Completed:

- Direct Chat, Project Chat, and Task Room user messages persist `sending`, `sent`, and `failed` status.
- Refresh recovery detects orphaned pending user messages and either resumes recoverable direct requests or marks interrupted task-room requests as retryable failures.
- Current active requests disable the composer and show the existing responding indicator so users can see that the agent is working.
- Failed user messages show typed failure labels and a Retry action instead of only a loose system message.
- Run summaries are persisted so the right Output Area can restore useful run context after refresh.
- Workspace attached-file context recovery is explicit and can fail as a context error without silently dropping the request.
- Provider errors are normalized before reaching user-facing conversation, lifecycle, and connection-test surfaces.
- Workspace file list/read/search errors are normalized before reaching the Workspace panel.
- Chat history for OpenAI-compatible, Anthropic-compatible, and Hermes-compatible chat requests is built from the latest message snapshot instead of a stale render closure.
- Local storage reads and writes for UI state, agents, workspace state, content parts, and theme preference are guarded.
- User messages now carry durable `requestId`, `requestAttempt`, `requestStartedAt`, and `requestCompletedAt` fields so retry/reload recovery has a stable request identity separate from the visible message id.
- In-flight request tracking is centralized in a request tracker service instead of a bare React `Set`, preparing the boundary for local trusted request orchestration.
- Direct free-chat and project-chat provider turns are routed through a direct chat request service that owns history construction plus provider execution.
- Task Room Chief planning, participant execution, and Chief aggregation provider turns are routed through a task-room request service.
- Direct and Task Room retry state preparation now uses request retry reducers instead of component-local cleanup logic.
- Free Chat completion/failure and conversation timestamp updates use pure state reducers instead of ad hoc component-local state edits.
- Project Direct Chat completion/failure now uses state reducers for messages, runs, tasks, and artifacts.
- Task Room Chief plan, participant result, Chief aggregation, and request-failure state writes now use state reducers for messages, tasks, runs, artifacts, and conversation timestamps.
- Artifact/media mapping helpers are centralized outside the React component.
- Direct Free Chat and Project Direct Chat request orchestration now runs through a dedicated direct request orchestrator service that owns provider execution, workspace-context recovery, success/failure state reduction, and suggested Output Area updates.
- Direct Chat retry and pending-recovery preparation now synchronizes the active request snapshot before async completion, avoiding stale ref/state divergence after retry, reload, or fast provider responses.
- Workspace context prompt construction is centralized so Free/Project/Task Room requests use one explicit local-file boundary text.
- Task Room request orchestration now runs through a dedicated task-room orchestrator service that owns Chief planning, participant execution, Chief aggregation, failure conversion, progressive state steps, and suggested Output Area updates.
- Active request tracking and the latest conversation/run/task/artifact snapshot now live in a dedicated request runtime store instead of separate component refs.
- Provider HTTP execution now goes through a replaceable agent HTTP transport boundary shared by Native A2A, Hermes-compatible, OpenAI-compatible, and Anthropic-compatible requests.
- `localhost` app loads are canonicalized to `127.0.0.1` before React starts so browser localStorage state is not split across two loopback origins.
- A service-level stability regression harness now covers pending request recovery, direct/task-room retry routing, retry state reducers, request attempt lifecycle fields, Task Room state reducers, UI state restoration, and workspace localStorage migration/fallback behavior.
- Service-level stability tests now cover Direct request orchestration, Task Room orchestration, workspace-context recovery, and Task Room chief-planning failure conversion.
- Service-level stability tests now cover the request runtime store that coordinates active request ids with the latest workspace snapshot.
- Service-level stability tests now cover provider transport proxy mapping and provider error normalization.
- Service-level stability tests now cover canonical loopback URL generation for the localStorage origin split issue.
- Browser-visible refresh restore and timeout failure smokes passed and are recorded in `docs/STABILITY_SMOKE.md`.
- Browser-visible Direct Chat and Task Room retry click-flow smokes passed and are recorded in `docs/STABILITY_SMOKE.md`.
- Browser-visible Direct Chat and Task Room pending-reload recovery smokes passed and are recorded in `docs/STABILITY_SMOKE.md`.
- Browser-visible Project Direct Chat workspace-context recovery and local-folder outage smokes passed and are recorded in `docs/STABILITY_SMOKE.md`.

Follow-up scope:

- Replace the browser transport implementation with a native/local trusted implementation when packaging and secure credential storage are introduced.
- Move API keys out of browser localStorage into secure local storage before public or packaged release.
- Continue IA simplification from `docs/V0_2_IA_RESET.md`, especially the Output Area organization by agent and output type.

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

Status: completed on 2026-06-18.

Goal:

Office Setup becomes a usable provider management surface.

Completed through the Real Agent Workspace Prototype work:

- Connected agents can be edited from the sidebar.
- Connected agents can be deleted with confirmation.
- Connection can be retested without rebuilding the agent from scratch.
- Chief is assigned through the Office role field.
- Duplicate local provider entries are merged by endpoint/model/name.
- The disabled/enabled agent state was removed from scope.

Scope:

- Edit connected agent.
- Delete connected agent.
- Retest connection.
- Set Chief.
- Avoid duplicate local provider entries.

Acceptance:

- User can change Chief from Office Setup.
- User can remove accidental agents.
- User can retest a provider without re-entering all fields.
- Registry never shows demo agents.

### Milestone 4: Chief-led Task Room

Status: completed on 2026-06-18.

Goal:

Task Room becomes real multi-agent coordination.

Completed:

- Task Room composer can submit a project-scoped task request to the selected Chief agent.
- Users can choose online participant agents before dispatch.
- Vibe Office creates parent `chief_delegation` runs and ProjectTask records before the remote Chief response returns.
- Chief responses are stored in a project-scoped task-room conversation.
- Chief receives the selected participant list and returns a first-round plan.
- Vibe Office sends one delegated A2A task to each selected participant.
- Participant results are stored as project-scoped text artifacts.
- Chief receives the participant results and returns one final aggregation.
- Chief summary is stored as a project-scoped text artifact.
- The Tasks tab shows per-agent task-room events inside the visible run card.
- Workspace file context still follows the explicit preview-and-attach boundary from M2.5.

Scope:

- Chief receives the user's task.
- User can manually override participants before dispatch.
- Chief plans work for the selected participant agents.
- Vibe Office sends delegated A2A tasks to selected participants.
- Task events show per-agent progress.
- Results are collected into project artifacts.
- No autonomous long-running multi-step planning in v0.1.

Chief-led Task Room v0.1 Boundary:

- Chief can perform only one planning round.
- Vibe Office delegates only one task per selected participant after the Chief plan.
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

Status: completed on 2026-06-18.

Goal:

Artifacts become inspectable output, not just summaries.

Completed:

- Click artifact to view content.
- Text artifact preview.
- JSON artifact preview.
- URL artifact opening.
- Copy content.
- Download where applicable.
- Generated media image preview through the local trusted layer.
- Manual copy fallback when browser clipboard access is denied.

Acceptance:

- User can inspect `Local Hermes response`.
- User can copy artifact content.
- Artifacts remain project-scoped.

### Milestone 6: A2A Task Lifecycle

Status: completed on 2026-06-18.

Goal:

Support longer-running agent tasks.

Completed:

- A2A client exposes `tasks/get`.
- A2A client exposes `tasks/cancel`.
- Provider adapter exposes project task refresh and cancel calls.
- Project tasks persist remote A2A task/context references separately from local task ids.
- Tasks tab shows lifecycle actions:
  - refresh status
  - retry failed task
  - cancel task
- Active tasks are polled without a full browser refresh.
- Local Chief-led orchestration tasks are not auto-polled as remote A2A tasks unless a remote task link exists.
- Unsupported lifecycle operations are recorded as task events instead of failing silently.
- Agent profile data can track:
  - protocol version
  - transport binding
  - supported interfaces
  - selected interface
  - last compatibility check time
  - task lifecycle support
  - cancel support
- Native A2A HTTP requests send the selected `A2A-Version` header when a real protocol version is known.
- Compatibility adapter calls do not fake native A2A version support.
- Repeated lifecycle polling does not add duplicate task events when the remote task state is unchanged.
- `tasks/get` unsupported and `tasks/cancel` unsupported are tracked separately.
- Tasks tab shows simplified task metadata while protocol/interface details stay in the background.

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

### Milestone 7: IA Reset - Agent Free Chat + Project Workspace

Status: proposed.

Goal:

Return the product to the core three-area skeleton:

```txt
List Area + Conversation Area + Output Area
```

Scope:

- First M7 slice: simplify Add Agent into Basic Agent onboarding.
  - Default path: Basic setup, Behavior, Instance address, Model provider.
  - Advanced path: namespace, timeout, generated task endpoint, generated capability URL.
  - A basic connected agent may be only an OpenAI-compatible chat provider with a role note and capability tags.
- Second M7 slice: make Free Chat the default context.
  - Show Free Chat as the default fixed entry in the Project list.
  - Project Workspace activates only after the user selects a real Project.
  - Switching back to Free Chat selects the Free Chat entry.
  - Free Chat messages persist separately from project runs, tasks, artifacts, and file context.
  - Free Chat keeps the conversation header minimal and uses the right panel for chat history.
- Add per-agent free chat history.
- Add New Chat for each agent.
- Keep free chat outside Project Scope.
- Remove or downgrade `Direct chat / Task room` as primary header choices.
- Keep Project Workspace as the context for files, outputs, previews, and multi-agent coordination.
- Start reorganizing Output Area around agent/type grouping.
- Treat A2A as an integration layer, not a user-facing product concept.
- Make default agent onboarding feel like adding an LLM provider.
- Move A2A-specific fields to advanced integration settings.

Implementation progress:

- M7-1 structure slimming started.
- Output Workspace views are now split out of `App.tsx` into `src/components/OutputWorkspace.tsx`.
- The extracted views are `WorkspaceFiles`, `BrowserPreview`, `ProjectTasks`, and `ProjectArtifacts`.
- Setup Wizard is now split out of `App.tsx` into `src/components/SetupWizard.tsx`.
- Shared agent profile constants live in `src/domain/agentProfile.ts`.
- Shared agent display primitives live in `src/components/AgentPrimitives.tsx`.
- `App.tsx` remains the state and request orchestration owner for this slice.
- M7-2 provider adapter split started.
- OpenAI-compatible execution lives in `src/services/openaiProvider.ts`.
- Anthropic-compatible execution lives in `src/services/anthropicProvider.ts`.
- Native A2A execution lives in `src/services/nativeA2AProvider.ts`.
- Shared provider result and task helpers live in `src/services/providerTypes.ts`.
- `HermesA2AAdapter` remains the unified provider entry, native fallback coordinator, and A2A compatibility metadata mapper.
- Provider split tests cover OpenAI-compatible free chat, Anthropic-compatible project chat, and Hermes native fallback to chat compatibility.
- Browser smoke tests now exercise provider retry/recovery through the local trusted provider endpoint.
- M7-3 Output Area organization started.
- Project Workspace now uses top-level `Workspace`, `Browser`, and `Outputs` tabs.
- `Outputs` groups project work by agent first, then filters by `All`, `Tasks`, `Artifacts`, or `Preview`.
- Task and artifact request flows now target the unified `outputs` mode instead of separate `runs` or `artifacts` UI modes.
- UI state storage migrates legacy `runs` and `artifacts` output tabs to `outputs`.
- M8 local trusted layer work started.
- Provider HTTP execution now goes through `POST /agent-local/request` before reaching Hermes, OpenAI-compatible, Anthropic-compatible, or native A2A endpoints.
- Browser transport now sends a provider request command to the local trusted layer instead of directly calling remote provider URLs.
- The local trusted provider endpoint only forwards supported HTTP methods and a small allowlist of provider headers.
- Agent profile saves now upsert provider connection details into the local trusted agent registry.
- Browser agent storage strips API keys before writing `localStorage`; legacy browser-stored keys are migrated into the local trusted registry on the next agent sync.
- Provider adapters now pass `agentId` to the local trusted layer and no longer assemble provider credential headers in browser code.
- The local trusted provider endpoint validates that an agent-scoped request targets that registered agent before injecting credentials.
- OpenAI-compatible and Anthropic-compatible adapters now call `POST /agent-local/command` with `agentId`, provider action, and semantic message payloads.
- The local trusted command endpoint owns provider URL construction, model selection, JSON body assembly, and credential injection for OpenAI-compatible and Anthropic-compatible chat.
- Native A2A capability and task lifecycle calls now use the same local trusted command boundary for `getAgentCard`, `message/send`, `tasks/get`, and `tasks/cancel`.
- The local trusted command endpoint now owns A2A JSON-RPC envelope construction and A2A version header injection.
- Workspace list/read/search/media remains on `/workspace-local/*`.
- Credential storage is now local-trusted-layer prototype storage; replacing the plain local registry file with OS-backed secure storage is still pending.
- M8's remaining hardening work is replacing the prototype registry file with OS-backed secure storage and moving the local trusted layer out of Vite dev middleware for packaging.

Acceptance:

- Add Agent feels like adding a model-backed agent, not configuring an A2A server.
- A2A/runtime endpoints and local tuning are available only in advanced settings.
- Fresh app load highlights the Free Chat entry.
- Selecting a Project activates Project Workspace tabs and project-scoped composer copy.
- Free Chat does not create ProjectRun, ProjectTask, or ProjectArtifact records.
- Free Chat does not show mode-switch buttons in the conversation header.
- User can select Lucy and see Lucy's free chat history.
- User can create a new Lucy free chat.
- Free chat does not show project folder, project badge, or project outputs as primary chrome.
- User can select a Project and enter project workspace.
- Project workspace still has conversation, files, browser preview, and outputs.
- Outputs are easier to find by agent and type.

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

- API keys are stored by the local trusted layer prototype registry and stripped from browser localStorage.
- The current local trusted registry is a development bridge, not final secure credential storage.

Next stage:

- Move secrets to OS-backed desktop secure storage.
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
- Local Hermes integration works through the local trusted provider request path; the legacy `/hermes-local` proxy remains configured for compatibility.

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
