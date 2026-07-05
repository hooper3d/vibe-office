# Vibe Office Release Baseline Handoff

Date: 2026-06-19
Project root: `<project-root>`
Local app: `http://127.0.0.1:5180/`
Developer agent: Ray

## Current Status

This is the stable baseline after the M7-M9 hardening pass. DeepSeek and MiniMax provider key persistence has been repaired; provider credentials stay in the local trusted credential store and must not be printed, copied, logged, or committed. Hermes, DeepSeek OpenAI-compatible, and MiniMax Anthropic-compatible all report READY and pass the full M9 provider regression matrix.

## Verified Gates

Latest verified commands:

```powershell
npm run release:check
npm run ci
npm run regression:providers
```

Results:

- `npm test`: 108/108 passed.
- `npm run build`: passed.
- `npm run smoke:browser`: passed.
- `npm run regression:providers:list`: Hermes / DeepSeek / MiniMax READY.
- `npm run regression:providers`: all three providers passed connection, free chat, project chat, forced timeout, retry, and Chinese context continuity.
- `npm run release:check`: passed; only warning is the active dev-server logs `dev-5180-current.err.log` and `dev-5180-current.out.log`.

## Continue From Here

Next thread should treat this as a release baseline, not a feature-expansion point. Continue with open-source readiness: keep README and docs concise, avoid new UI surface unless necessary, keep product UI English, keep development reports Chinese, and preserve the provider/local-trusted test gates. The next real hardening track is packaged local trusted runtime plus OS-backed credential storage; prototype JSON credential storage is acceptable only for the current dev baseline.
