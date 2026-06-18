# Milestone: Artifact Viewer Prototype

Date: 2026-06-18

Status: completed

## Summary

Vibe Office now has an Artifact Viewer for project-scoped outputs.

Artifacts are no longer only summary cards. Users can select an artifact, inspect its rendered content, copy text or data content, open supported artifact URLs, and download artifact content where the browser permits downloads.

This milestone builds on the M4 Task Room work and the generated media ingestion fix: `MEDIA:/...` image references from agent output can become project artifacts and render inline in the viewer.

## Completed Capabilities

- Artifacts tab uses a two-pane viewer:
  - artifact list
  - selected artifact detail
- Clicking an artifact opens its detail view.
- Text artifacts render as Markdown.
- JSON/data parts render as formatted JSON.
- Image file parts render inline.
- Generated media artifacts from controlled local media URLs render inline.
- Copy action copies artifact text, JSON, and file URI content when browser clipboard access is available.
- If browser clipboard access is denied, the viewer shows a read-only fallback field for manual copy.
- Download action supports:
  - file/image artifacts through their artifact URI
  - text artifacts as `.txt`
  - JSON artifacts as `.json`
- Open URL action supports:
  - `http://` and `https://` artifact URLs
  - controlled local media URLs under `/workspace-local/media`
- Artifacts remain filtered by the active Project.

## Local Media Boundary

Generated media access stays behind the local trusted layer.

```txt
Agent text
  -> MEDIA:/tmp/mmx-gen/image_001.jpg
  -> Vibe Office parses media reference
  -> /workspace-local/media serves allowed image files only
  -> ProjectArtifact stores a file part with controlled local URI
  -> Artifact Viewer renders the image
```

Current dev boundary:

- WSL media roots allowed:
  - `/tmp/mmx-gen`
  - `/tmp/vibe-office-media`
- Windows temp media roots allowed:
  - current OS temp directory
  - `vibe-office-m4-demo` under the temp directory
- Only known image extensions are served.
- Media files larger than the local media limit are rejected.
- Arbitrary filesystem paths are rejected.

## Verification

Validated on 2026-06-18:

- `npm run build` passes.
- The generated M4 image artifact appears as `Generated media`.
- Artifact detail renders the image inline at `1024x1024`.
- Copy action exposes content through the viewer; the in-app browser denied programmatic clipboard access, so the manual copy fallback was verified.
- Open URL action opens the controlled local media URL.
- The local media endpoint returns `200 image/jpeg` for `/tmp/mmx-gen/image_001.jpg`.
- The local media endpoint rejects `/etc/passwd` with `400`.
- Artifacts remain scoped to the active Project through the existing project-scoped artifact filter.

## Boundaries

- The viewer does not grant remote agents direct filesystem access.
- Local media files are served only through the Vibe Office local trusted layer.
- Browser localStorage remains prototype storage.
- Secure packaged storage and native desktop permissions are still future work.
- The in-app browser used for verification does not support download events; download behavior is implemented with browser Blob downloads and should be verified again in the packaged/browser target that supports downloads.

## Next Milestone

M6 A2A Task Lifecycle.

Goal:

Support longer-running tasks with polling, retry/cancel affordances, and clearer state transitions.
