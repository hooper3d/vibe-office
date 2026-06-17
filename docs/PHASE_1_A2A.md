# Vibe Office Phase 1 A2A Baseline

## Product Boundary

Vibe Office v0.1 is an A2A-native workspace for real connected agent instances.

It is not an agent creator, persona editor, or custom agent communication protocol.

Hermes is the first provider adapter, not the product boundary.

## Required Shape

```txt
Vibe Office v0.1
= Three-column UI
+ Agent Registry
+ A2A Client
+ Provider Adapter
+ Project Scope
+ Direct Chat
+ Chief-led Task Room
+ Run / Task / Artifact display
```

## Phase 1 Acceptance

- The app starts with no fake/demo agents.
- The user can connect at least one real agent from Office Setup.
- The connected agent appears in the Agent Registry with real status.
- The user can select a Project before talking to an agent.
- The conversation area supports direct conversation with one connected agent.
- Chief can coordinate selected connected agents through A2A tasks.
- The output workspace shows related run/task state, progress, artifacts, or responses.
- Switching Project changes conversation, run, task, and artifact scope.
- Refreshing the browser restores agents, projects, conversations, runs, tasks, and artifacts.
- Project context, conversations, runs, tasks, and artifacts must not be mixed between projects.

## Architecture Rules

- Use A2A as the Phase 1 agent-to-agent protocol.
- Vibe Office may implement a client and provider adapters, but must not invent a competing protocol.
- Connected agents should remain opaque instances with their own memory and personality.
- Project Scope is the Vibe Office boundary for context, conversation, run, task state, and artifacts.
- A2A Agent Cards are the discovery contract for agent capabilities when supported.
- A2A messages are the conversation contract.
- A2A tasks and artifacts are the durable work and output contract for collaboration.
- Unsupported provider capabilities must be explicit in the adapter capability matrix.

## Implementation Layers

```txt
UI
  Sidebar
  Conversation
  Output Workspace

Application State
  Agent Registry
  Project Scope
  Conversations
  Messages
  Runs
  Tasks
  Artifacts

A2A Boundary
  A2A Client
  Provider Adapter
  Agent Card discovery
  Protocol/interface selection
  Message send
  Task lifecycle
  State mapping
```

## Direct Chat A2A Mapping

- A direct chat sends an A2A message.
- If the remote agent returns a Task, Vibe Office creates/updates a ProjectTask.
- If the remote agent returns a direct Message, Vibe Office stores it as ConversationMessage.
- Artifacts are created only when the agent returns task output or when Vibe Office intentionally materializes a durable output.
- The right Output Workspace may show a run/task record even when no formal A2A Artifact exists.

## Agent Discovery Priority

1. Explicit agentCardUrl
2. `/.well-known/agent-card.json`
3. Manual provider configuration

Health fallback is not discovery. It may only confirm whether a manually configured provider endpoint is reachable.
