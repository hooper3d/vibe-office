# Public Roadmap

Vibe Office is currently an early release candidate. The public roadmap is intentionally small so contributors can understand what matters next.

## Current Release Scope

- Agent setup for real provider-backed agents.
- Free Chat.
- Project-scoped conversations.
- Basic project outputs.
- Local trusted provider bridge.
- Provider readiness checks.
- Browser smoke and service regression tests.

## Near-Term Work

### Better First-Run Documentation

Make it easier for new users to set up their first local agent without reading the full development history.

Good contribution ideas:

- Add provider setup examples with placeholder values only.
- Add a short "first local run" walkthrough.
- Add screenshots or a short GIF to the README.

### Public Demo Materials

Help people understand Vibe Office quickly before they install it.

Good contribution ideas:

- Record a short local demo video.
- Add annotated screenshots.
- Create a small sample project walkthrough.

### Packaged Runtime Planning

The current local trusted layer is a development bridge. A packaged release should move toward a dedicated local runtime and OS-backed secure credential storage.

Good contribution ideas:

- Compare packaging options.
- Draft secure credential storage requirements.
- Document migration expectations from the current local trusted credential file.

## Non-Goals For The Current Release Candidate

- No hosted SaaS backend.
- No npm package publishing plan.
- No claim of final packaged credential security.
- No broad feature expansion before the local trusted runtime direction is clear.

## Contribution Principles

- Keep product UI copy in English.
- Keep provider credentials out of browser localStorage.
- Keep docs concise and practical.
- Prefer small, focused controller and service changes over expanding `App.tsx`.
- Add tests for provider, persistence, conversation, task, or workspace behavior changes.
