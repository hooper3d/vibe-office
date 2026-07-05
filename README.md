# Vibe Office

Vibe Office is a local-first multi-agent workspace prototype for connecting real AI providers, chatting with agents, and organizing lightweight project work.

The current app is a Vite + React desktop-style web app with a local trusted development layer. The browser UI stores non-sensitive workspace state, while provider credentials are kept outside browser localStorage.

## What It Does

- Configure local agents backed by OpenAI-compatible, Anthropic-compatible, or Hermes-style providers.
- Chat with agents in Free Chat.
- Keep project-scoped conversations, task room state, workspace files, and outputs separate.
- Route provider requests through a local trusted layer so the browser does not assemble provider credential headers.
- Run stability checks for provider readiness, local storage boundaries, browser smoke flows, and core state reducers.

## Current Status

This repository is an early release candidate, not a packaged product. It is useful for local experimentation and code review, but a public release should keep the scope intentionally small:

- Agent setup
- Free Chat
- Project workspace
- Local trusted provider bridge
- Basic project outputs
- Regression and smoke checks

## Requirements

- Node.js 22+
- npm

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev -- --port 5180
```

Open:

```text
http://127.0.0.1:5180/
```

## Local Trusted Data

During development, local trusted data is stored under:

- Windows: `%USERPROFILE%\.vibe-office`
- macOS/Linux: `~/.vibe-office`

Provider credentials are stored in `agent-credentials.local.json` inside that directory. They should never be committed, printed in logs, or stored in browser localStorage.

You can override the local trusted home for testing:

```bash
VIBE_OFFICE_LOCAL_TRUSTED_HOME=/tmp/vibe-office-local npm test
```

## Useful Commands

```bash
npm run ci
npm run typecheck
npm run typecheck:unused
npm test
npm run build
npm run smoke:browser
npm run regression:providers:list
npm run release:check
```

Provider repair and regression scripts use environment variables. See `.env.example` for the supported names.

`npm run ci` is the portable check intended for pull requests. `npm run release:check` also runs the local browser smoke test, which needs a Chromium or Edge executable on the local machine.

## Release Notes For Contributors

- Keep product UI text in English.
- Keep credentials and provider protocol details out of browser-side code.
- Prefer small state helpers and focused controllers over expanding `App.tsx`.
- Add tests when changing provider, persistence, conversation, task, or workspace behavior.
- Before publishing, run the release checklist in `docs/RELEASE_CHECKLIST.md`.

## License

MIT. See `LICENSE`.
