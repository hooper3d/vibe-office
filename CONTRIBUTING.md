# Contributing

Vibe Office is kept intentionally small while it moves toward a public release.

## Development

Install dependencies:

```bash
npm install
```

Run the portable verification suite:

```bash
npm run ci
```

Run the local release check before sharing a branch:

```bash
npm run release:check
```

`release:check` includes a browser smoke test and expects a local Chromium or Edge executable.

## Guidelines

- Keep product UI copy in English.
- Never commit provider keys, local credential files, logs, or generated build output.
- Keep provider credentials in the local trusted layer, not browser state.
- Prefer focused service helpers and small components over expanding `App.tsx`.
- Add or update tests when changing provider, chat, project, workspace, or persistence behavior.
