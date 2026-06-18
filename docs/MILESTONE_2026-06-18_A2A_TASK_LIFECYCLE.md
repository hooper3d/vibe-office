# Milestone: A2A Task Lifecycle

Date: 2026-06-18

Status: completed

## Summary

Vibe Office now has the v0.1 A2A task lifecycle layer for project-scoped work.

The app can keep a local ProjectTask separate from a remote A2A task, poll active remote tasks, retry failed work, request cancel when the provider can support it, and clearly mark provider lifecycle capabilities that are unavailable.

## Completed Capabilities

- A2A client supports:
  - `message/send`
  - `tasks/get`
  - `tasks/cancel`
- Provider adapter exposes:
  - project message send
  - project task refresh
  - project task cancel
- ProjectTask stores:
  - local task id
  - local context id
  - remote task id
  - remote context id
- Active remote tasks are polled without a full browser refresh.
- Repeated polling avoids duplicate lifecycle events when state is unchanged.
- A2A task states map into internal WorkState values before reaching the UI.
- Failed tasks expose a retry action.
- Active remote-linked tasks expose refresh and cancel controls.
- Unsupported lifecycle refresh and unsupported cancel are tracked separately.
- Local Chief-led orchestration tasks are marked as local when they do not have a remote A2A lifecycle link.
- Agent profile data tracks protocol compatibility metadata:
  - protocol version
  - transport binding
  - supported interfaces
  - selected interface
  - last compatibility check time
  - task lifecycle support
  - cancel support
- Native A2A HTTP requests send `A2A-Version` when a real selected protocol version is known.
- OpenAI-compatible adapter calls do not fake native A2A version support.
- Agent HTTP requests use a timeout so a stalled provider cannot leave the UI submitting forever.
- Tasks tab shows lifecycle metadata as compact chips.

## UI Behavior

Task cards now show:

- current task state
- refresh status action
- retry failed task action
- cancel task action
- lifecycle capability note when unsupported
- simplified task capability metadata
- remote task link status
- cancel capability status

For local Chief-led orchestration tasks, the UI shows `No remote lifecycle link` instead of trying to poll a remote provider with a local task id.

## Verification

Validated on 2026-06-18:

- `npm run build` passes.
- `git diff --check` passes.
- Browser Tasks tab shows lifecycle controls.
- Browser Tasks tab shows compact lifecycle metadata.
- Existing Chief-led local orchestration tasks are marked as local and do not expose remote refresh/cancel actions.
- Existing project-scoped tasks, runs, and artifacts remain visible under the selected Project.
- Port `8642` was already occupied by the user's local service, so live mock verification used a separate temporary A2A server on `127.0.0.1:8765`.
- Mock A2A lifecycle verification:
  - `message/send` returned `submitted`.
  - automatic polling through `tasks/get` updated the task to `working`.
  - the next automatic poll updated the task to `completed`.
  - internal task metadata recorded `A2A 1.0`, `json-rpc/http`, `message/send + tasks/get`, and `remote task linked`.
  - frontend task metadata was later simplified to user-facing labels such as `Remote task`, `Status tracking`, and `Cancel unknown`.
- Mock cancel verification:
  - a second mock task returned `submitted`.
  - clicking Cancel called `tasks/cancel`.
  - the task updated to `canceled`.
- Demo hardening:
  - a real Chief-led test exposed that a stalled provider request could leave the task room stuck in `submitting`.
  - Agent request timeouts were added after this test.

## Boundaries

- Remote agents still cannot read local files directly.
- File content is sent only when the user previews and attaches it.
- Browser localStorage remains prototype storage.
- API keys remain prototype-only localStorage secrets and must not be committed, logged, exported, or copied into docs.
- Streaming task progress is prepared for later but not implemented in M6.
- Push notifications are not implemented in M6.
- Packaged secure credential storage is still future work.

## Next Phase

v0.1 stabilization and release review.

Recommended next checks:

- Run a full M0-M6 end-to-end acceptance pass.
- Verify polling against a native provider that returns `submitted`, `working`, and terminal states from `tasks/get`.
- Tighten user-facing copy after observing the full workflow.
- Decide the v0.2 roadmap.
