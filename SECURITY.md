# Security Policy

Vibe Office is a local-first release candidate. It is intended for local development, review, and controlled experimentation, not as a packaged desktop product with final secure credential storage.

## Supported Scope

Security reports are most useful when they affect:

- Provider credential handling.
- Browser localStorage boundaries.
- Local trusted registry or credential files.
- Local workspace file access.
- Provider request routing or redaction.
- Release hygiene checks that could allow secrets, logs, generated output, or machine-specific data to be published.

## Credential Boundary

Provider credentials must not be committed, logged, printed, stored in browser localStorage, pasted into public issues, or included in screenshots.

Current development builds store provider credentials in the local trusted credential file under the user's local trusted home. This is acceptable for the current local development baseline, but packaged releases should move credentials to OS-backed secure storage and run the local trusted layer outside Vite development middleware.

## Reporting A Vulnerability

Do not open a public issue that includes provider keys, tokens, local credential files, private endpoints, or personal machine paths.

For public repositories, enable GitHub private vulnerability reporting and use that channel for sensitive reports. If private reporting is not available, contact the maintainers directly before sharing reproduction material.

When reporting, include:

- A short summary of the issue.
- A minimal reproduction path.
- The affected command, UI flow, or file boundary.
- Whether real credentials were involved.
- Redacted logs only.

## Before Public Release

Run the release gate before tagging or announcing a release:

```bash
npm run ci
npm run release:check
```

Only run real-provider regression with local credentials that are never copied into source, docs, screenshots, public issue comments, or committed logs.
