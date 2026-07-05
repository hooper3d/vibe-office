# Release Checklist

Use this before sharing Vibe Office publicly.

## Repository Hygiene

- [ ] `README.md` explains the project, local trusted storage, setup, and verification commands.
- [ ] `LICENSE` is present and matches the intended open-source license.
- [ ] `CONTRIBUTING.md` explains local development and contribution rules.
- [ ] `SECURITY.md` explains credential boundaries and sensitive-report handling.
- [ ] `.env.example` contains only placeholders.
- [ ] `.gitignore` excludes `node_modules`, `dist`, `.tmp`, `.env*`, `*.local`, and `*.log`.
- [ ] GitHub Actions runs the portable `npm run ci` check.
- [ ] No generated logs or build output are staged.
- [ ] No real provider keys, tokens, cookies, or local credential files are staged.

## Privacy And Local Machine Data

- [ ] Search for real user paths, private domains, and machine-specific IDs before publishing.
- [ ] Move handoff notes with personal local paths into private/internal docs if needed.
- [ ] Keep public docs focused on portable commands and generic paths.
- [ ] Confirm browser localStorage does not store provider API keys.
- [ ] Confirm the local trusted registry stores provider metadata separately from credentials.
- [ ] Enable private vulnerability reporting before announcing a public repository.

## Scope Control

- [ ] Release scope is limited to agent setup, Free Chat, project workspace, local trusted provider bridge, and basic outputs.
- [ ] Experimental milestone notes are clearly marked as development history.
- [ ] New features do not expand `App.tsx` wiring without a matching controller/helper boundary.
- [ ] UI copy is in English and avoids explaining implementation details in the product surface.

## Public Repository Setup

- [ ] Keep `package.json` private unless there is a deliberate npm publishing plan.
- [ ] Add a short repository description: `Local-first multi-agent workspace for real provider-backed agents.`
- [ ] Add focused topics such as `local-first`, `multi-agent`, `react`, `vite`, and `ai-agents`.
- [ ] Confirm default branch protection runs CI before merging release changes.
- [ ] Tag the first public baseline only after `npm run ci` and `npm run release:check` pass locally.

## Verification

Run these before tagging or opening a public PR:

```bash
npm test
npm run typecheck
npm run typecheck:unused
npm run build
npm run smoke:browser
npm run regression:providers:list
npm run release:check
```

For hosted CI, use the portable check that avoids local browser dependencies:

```bash
npm run ci
```

Optional real-provider regression:

```bash
npm run regression:providers
```

Only run real-provider checks with local keys that are never committed or pasted into issue comments.
