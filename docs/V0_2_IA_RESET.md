# Vibe Office v0.2 IA Reset

Date: 2026-06-18

Status: proposed

## Product Position

Vibe Office is a multi-agent coordination desk shaped like a project workspace.

The core product skeleton is:

```txt
List Area + Conversation Area + Output Area
```

The app should not feel like an A2A protocol demo, an admin console, or a pile of modes. Users should be able to select an agent, talk naturally, and find generated work in one organized output space.

## Primary Product Modes

Vibe Office has two high-level contexts:

1. Agent Free Chat
2. Project Workspace

These contexts must be explicit in the information architecture, but they should stay simple in the UI.

## Agent Free Chat

Agent Free Chat is the user's ongoing relationship with one independent agent personality.

Examples:

- Talk with Lucy about product direction.
- Ask Tiger to brainstorm wording.
- Continue a personal thread with an agent without attaching a project.

Rules:

- No Project Scope.
- No automatic workspace files.
- No project output pressure.
- Free Chat is the default fixed entry in the Project list.
- Switching to Free Chat selects that fixed entry and removes project workspace scope.
- Keep per-agent conversation history.
- Support New Chat.
- Support continuing an existing chat.
- Do not show Task Room as a mode.
- Right panel can be hidden, minimized, or show agent profile / memory / notes.

Minimum UI shape:

```txt
Agent: Lucy

[New chat]

Recent
- Vibe Office positioning
- M6 release notes idea
- hi

Conversation
```

## Project Workspace

Project Workspace is where agents work on a real project.

Examples:

- Read and discuss a codebase.
- Produce a release note.
- Generate image, Markdown, PPT, or code patch artifacts.
- Coordinate multiple agents for a project task.
- Preview a development app in the browser.

Rules:

- Project Scope is active.
- A real project must be explicitly selected before Project Workspace is active.
- Local folder permissions are bound to the project.
- Files are available through the local trusted layer.
- Agents may read/search files only through Vibe Office-controlled permissions.
- Write operations require user review/approval.
- Outputs are project-scoped.
- Multi-agent coordination happens inside the project context.

Minimum UI shape:

```txt
Project: Vibe Office

Conversation

Output Area
- by agent
- by type
- preview
- files
```

## Agent Role Boundaries

Agents are independent personalities with clear responsibilities.

They should not all become generic do-anything assistants.

Example roles:

- Lucy
  - Chief
  - coordination
  - planning
  - summary
  - release review
- Tiger
  - Writer
  - release notes
  - editing
  - copywriting
- Code Agent
  - code reading
  - code editing
  - tests
  - patches
- Design Agent
  - UI review
  - product design critique
  - visual direction
- Finance Agent
  - finance-only discussions

If a request is outside an agent's role, the agent should decline or route the task to a better-suited agent.

## Multi-Agent Coordination

Multi-agent coordination should not be presented as a separate `Task room` mode.

The user should be able to say:

```txt
Lucy, coordinate Tiger to draft the M6 release note.
```

Vibe Office can then create internal task records and outputs, but the user does not need to understand a separate room concept.

Recommended user-facing language:

- Coordinate
- Assigned work
- Outputs
- Review

Avoid making `Task room` a primary product concept.

## Output Area

The Output Area is the stable home for generated work.

Outputs should not be scattered across Tasks, Artifacts, Browser, and conversation history as separate top-level concepts.

Recommended organization:

```txt
Outputs

By Agent
- Lucy
  - plans
  - summaries
  - reviews
- Tiger
  - drafts
  - release notes
  - edited copy
- Code Agent
  - patches
  - test results
  - code reviews

By Type
- Markdown
- Images
- PPT
- Code patches
- Browser previews
- Data / JSON
```

Tasks remain useful internally, but users usually look for "who produced what" and "what can I inspect or use".

## Workspace Files

Project folder access should feel closer to Codex:

```txt
Project folder permission
-> local trusted runtime
-> agent reads/searches files through controlled tools
-> agent proposes edits
-> user reviews changes
-> Vibe Office applies approved changes
```

Important boundaries:

- Remote agents must not receive raw filesystem access.
- Vibe Office owns local read/write control.
- Users can inspect what files are used.
- Write operations must be explicit and reviewable.
- File access should be scoped to the selected Project folder.

## A2A Positioning

A2A is an integration layer, not the product's primary concept.

User-facing product language should focus on:

- Agent online/offline
- Agent capabilities
- Task status
- File permission
- Output type

A2A remains useful for remote or external agent runtimes, but users should not need to understand A2A servers to use Vibe Office.

Default agent setup should feel like adding an LLM provider:

```txt
Agent name
Role
Capabilities
Base URL
Model / Agent ID
API key
```

A2A-specific fields belong in advanced integration settings:

```txt
Task endpoint
Capability URL
Protocol version
Transport binding
```

The frontend should stay simple and explicit. It should show whether an agent is connected, whether task status tracking is available, and whether cancel is available, without exposing protocol names as primary UI copy.

## Basic Agent Onboarding

The default Add Agent flow should feel like connecting an LLM provider and assigning a responsibility.

Minimum visible setup:

```txt
Basic setup
- Agent name
- Office role
- Capability tags

Behavior
- Role note

Instance address
- Instance location
- Host / IP

Model provider
- Provider type
- Base URL
- Model / Agent ID
- API key
- Test connection
```

The first connected agent can be only a model-backed chat agent. It does not need full memory, workspace tools, task lifecycle support, or A2A-native runtime support on day one.

Enhancement layers:

- Personality and memory
- Project folder permissions
- Read/search/write tools
- Task lifecycle tracking
- External runtime / A2A integration

Advanced details should be available for users who need them, but they should not define the main onboarding experience.

## Proposed M7

### Milestone 7: IA Reset - Agent Free Chat + Project Workspace

Goal:

Separate independent agent free chat from project-scoped workspace work.

Scope:

- Add per-agent free chat history.
- Add New Chat for each agent.
- Keep free chat outside Project Scope.
- Remove or downgrade `Direct chat / Task room` as primary header choices.
- Keep Project Workspace as the context for files, outputs, previews, and multi-agent coordination.
- Start reorganizing Output Area around agent/type grouping.
- Make default agent onboarding feel like adding an LLM provider.
- Move A2A-specific fields to advanced integration settings.
- Treat Basic Agent onboarding as the first M7 implementation slice.

Acceptance:

- Add Agent defaults to Basic setup, Behavior, Instance address, and Model provider sections.
- Runtime task endpoints and local runtime tuning are hidden under advanced settings.
- App defaults to the Free Chat list entry.
- Project Workspace becomes active only after the user selects a real Project.
- Switching back to Free Chat highlights the Free Chat entry, not a project workspace.
- User can select Lucy and see Lucy's free chat history.
- User can create a new Lucy free chat.
- Free chat does not show project folder, project badge, or project outputs as primary chrome.
- User can select a Project and enter project workspace.
- Project workspace still has conversation, files, browser preview, and outputs.
- Outputs are easier to find by agent and type.

## Non-Goals For M7

- Full autonomous file editing.
- Full patch review workflow.
- Streaming task progress.
- Secure credential storage.
- Rewriting all existing project task history.
- Removing the underlying task/run/artifact data model.

## Design Principles

- Keep the three-area skeleton visible.
- Do not expose implementation concepts as primary product modes.
- Keep agent roles legible.
- Keep Project Scope explicit.
- Keep free chat lightweight.
- Make outputs easy to find.
- Prefer calm, structured UI over mode-heavy controls.
