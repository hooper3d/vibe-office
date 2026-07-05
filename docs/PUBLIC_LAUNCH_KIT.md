# Vibe Office Public Launch Kit

Use this material when announcing Vibe Office publicly.

## One-Line Pitch

Vibe Office is a local-first multi-agent workspace where real AI providers collaborate through agents, projects, shared context, and a local trusted credential boundary.

## Short Description

Vibe Office is an early release candidate for people who want to experiment with real provider-backed agents in a local workspace. It supports agent setup, Free Chat, project-scoped conversations, basic outputs, and a local trusted provider bridge that keeps provider credentials out of browser localStorage.

It is not yet a packaged desktop product. The current release is best for local experimentation, code review, and feedback from builders interested in multi-agent workflows.

## What To Show In A Demo

1. Add or edit a provider-backed agent.
2. Show that provider credentials are saved through the local trusted layer, not browser localStorage.
3. Run a Free Chat conversation.
4. Switch into a project workspace.
5. Show project-scoped conversations, outputs, and provider readiness checks.

## Repository About Text

```text
Local-first multi-agent workspace for real provider-backed agents.
```

Recommended topics:

```text
local-first
multi-agent
react
vite
ai-agents
developer-tools
agent-workspace
```

## GitHub Release Title

```text
Vibe Office v0.1.0 Release Candidate
```

## GitHub Release Notes

```md
Vibe Office v0.1.0 is an early local-first release candidate for real provider-backed multi-agent workspace experimentation.

Highlights:
- Local agent setup for OpenAI-compatible, Anthropic-compatible, and Hermes-style providers.
- Free Chat and project-scoped workspace flows.
- Local trusted provider bridge keeps provider credentials out of browser localStorage.
- Basic project outputs, browser smoke checks, and provider readiness regression gates.
- Public launch documentation, release checklist, and security policy.

Status:
This is not yet a packaged desktop release. It is intended for local experimentation, source review, and controlled provider testing.
```

## Show HN Draft

Title:

```text
Show HN: Vibe Office - local-first workspace for real provider-backed agents
```

Body:

```text
I built Vibe Office, a local-first multi-agent workspace for experimenting with real provider-backed agents.

The current release candidate focuses on a narrow local workflow: configure agents, chat in Free Chat, organize project-scoped conversations, view basic outputs, and route provider calls through a local trusted layer so browser localStorage does not hold provider keys.

It is not a packaged desktop app yet. I am sharing it now because I want feedback from people building agent workflows, local-first tools, and provider integrations.

The most interesting parts are the local trusted credential boundary, provider readiness checks, browser smoke tests, and the attempt to keep multi-agent project work understandable instead of turning it into another noisy chat surface.
```

## Product Hunt Draft

Tagline:

```text
Local-first workspace for real provider-backed AI agents.
```

Description:

```text
Vibe Office is an early release candidate for running real provider-backed agents inside a local-first workspace. Configure agents, chat, organize project work, and keep provider credentials outside browser localStorage through a local trusted bridge.
```

First comment:

```text
Hi Product Hunt,

I built Vibe Office to explore what an AI office could feel like when agents are real provider-backed workers inside a local-first workspace instead of one-off chat tabs.

This release candidate is intentionally narrow: agent setup, Free Chat, project workspace, basic outputs, local trusted provider routing, and regression checks. It is not a packaged desktop product yet, and I would love feedback from builders who care about local-first workflows, agent orchestration, and safe provider integration.
```

## Social Post Draft

```text
I just published Vibe Office v0.1.0 RC.

It is a local-first multi-agent workspace for real provider-backed agents:
- agent setup
- Free Chat
- project workspaces
- basic outputs
- local trusted provider bridge
- credentials kept out of browser localStorage

This is not a packaged desktop release yet. I am looking for feedback from people building with agents, local-first tools, or provider integrations.
```

## Launch Checklist

- Make the repository public.
- Add the repository About text and topics.
- Publish the GitHub release from `v0.1.0`.
- Add at least one screenshot or short demo video to the README when available.
- Open beginner-friendly issues for docs, provider examples, and packaging planning.
- Share with feedback-oriented wording first; avoid hype that implies a finished packaged product.
