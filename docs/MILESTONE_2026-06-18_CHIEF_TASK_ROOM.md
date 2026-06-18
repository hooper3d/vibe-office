# Milestone: Chief-led Task Room Prototype

Date: 2026-06-18

Status: completed

## Summary

Vibe Office now has a real Chief-led Task Room workflow for the v0.1 prototype.

The Task Room can submit a project-scoped task to the selected Chief, delegate one round of work to user-selected participant agents, collect participant results as artifacts, and ask the Chief to aggregate the final response.

This milestone turns Task Room from a mode switch into an observable project workflow with parent runs, task events, and grouped artifacts.

## Completed Capabilities

- A real connected agent can be assigned as Chief through the Office role field.
- Task Room requires a Chief before dispatch.
- User can select online participant agents before sending.
- Sending a Task Room request creates a project-scoped `chief_delegation` run.
- Sending also creates a parent `ProjectTask` owned by the Chief.
- The Chief receives the original task and selected participant list.
- Vibe Office delegates one A2A task to each selected participant.
- Participant results are saved as text artifacts under the parent task.
- Chief receives the participant results and returns one final aggregation.
- Chief summary is saved as a text artifact under the same parent task.
- The Tasks tab shows per-agent event progress inside the run card.
- The Artifacts tab shows the generated participant result and Chief summary artifacts.
- Project Scope is preserved for task-room conversations, runs, tasks, events, and artifacts.
- Workspace file context still follows the M2.5 explicit preview-and-attach boundary.

## Task Room v0.1 Flow

```txt
User task
  -> selected Project
  -> selected Chief
  -> selected participant agents
  -> parent chief_delegation run
  -> parent ProjectTask
  -> Chief planning request
  -> one delegated task per selected participant
  -> participant result artifacts
  -> Chief aggregation request
  -> Chief summary artifact
```

## Boundaries

- This is a one-round coordination model.
- Chief plans once.
- Vibe Office delegates once to each user-selected participant.
- Participant agents do not recursively delegate.
- Chief aggregates once.
- There is no autonomous long-running planning loop in v0.1.
- Remote agents still cannot read local files directly.
- File excerpts are sent only when the user explicitly previews and attaches them.
- API keys remain prototype-only browser localStorage secrets and must not be committed, logged, exported, or copied into docs.

## Verification

Validated on 2026-06-18:

- `npm run build` passes.
- Browser smoke test created completed Task Room runs with a Chief and one participant.
- Tasks tab shows the full event chain:
  - `Task submitted to Chief.`
  - `Chief returned the first task-room plan.`
  - `Delegated to Tiger.`
  - `Tiger returned a result.`
  - `Chief aggregated participant results.`
- Tasks tab shows grouped artifact chips for `Tiger result` and `Chief summary`.
- No new fake/demo agents were introduced.

## Not Yet Done

- Full artifact content viewer.
- Copy/download actions for artifact content.
- Long-running A2A task polling.
- Retry and cancel actions for delegated tasks.
- Streaming task progress.
- Agent-requested file tools with human approval.
- Secure local credential storage.

## Next Milestone

M5 Artifact Viewer.

Goal:

Make generated task-room artifacts inspectable, copyable, and exportable while preserving Project Scope and credential safety.
