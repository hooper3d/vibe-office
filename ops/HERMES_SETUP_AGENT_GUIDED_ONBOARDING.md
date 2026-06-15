# Setup Agent Guided Hermes Onboarding

Date: 2026-06-13
Project: Vibe Office Hermes provisioning
Scope: ordinary user, model key ready, local Hermes framework exists, Hermes API/key may not be ready

## Core Understanding

Setup Agent is not a setup page, a form wrapper, or a better error message.

Setup Agent is the first real assistant activated because the user cannot complete Hermes onboarding alone yet. Its job is to guide and assist a normal user through the local Hermes connection, one action at a time, with real checks after each step.

If Setup Agent only says:

- open Hermes
- enable API server
- set port
- find access key
- paste key

then it is still a manual. That is not enough.

The product intent is:

> Setup Agent is the user's hand during Hermes onboarding.

It should behave like someone sitting beside the user:

- "First, open Hermes on this computer."
- "Tell me when Hermes is open."
- "Now open Settings."
- "Do you see API Server?"
- "Turn it on."
- "Set the port to 8642."
- "Save and restart Hermes if it asks."
- "I will test the local API again."
- "The API is running now. Next we need the Hermes access key."
- "That key was rejected. It looks like a model provider key, not a Hermes access key."

## Product Principle

The user should not need to know:

- what `/v1/models` means
- what `/v1/responses` means
- whether Hermes API server is enabled
- what port Hermes uses
- where the Hermes access key lives
- how to distinguish a model provider key from a Hermes access key

Setup Agent should know the goal and drive the flow.

The user should only need to answer simple, visible-state questions:

- "Hermes is open"
- "I cannot find Hermes"
- "I see Settings"
- "I do not see API Server"
- "I turned API Server on"
- "I restarted Hermes"
- "I found the access key"
- "I pasted the key"

## Hermes Can Provision Its Own API

Important product discovery from Lucy:

Hermes itself can help the user enable its API server and provide the API key, if the Hermes gateway is running on a machine Hermes can touch.

This changes the onboarding model.

Do not assume the user must manually edit `.env`.
Do not make the user learn how to generate `API_SERVER_KEY`.
Do not make the user manually run every Hermes-side setup step unless Hermes cannot perform it.

Hermes-side setup can be assisted or automated by Hermes:

1. Check Hermes `.env` state:
   - `API_SERVER_ENABLED=true` means API is enabled.
   - `API_SERVER_ENABLED=false` means API is disabled.
   - `API_SERVER_KEY=...` is the API access key.
2. If API is off, Hermes can turn it on:
   - generate a strong random key if no key exists
   - write `API_SERVER_KEY`
   - set `API_SERVER_ENABLED=true`
   - restart gateway with `hermes gateway restart`
3. After restart, Hermes can give the `API_SERVER_KEY` to the user.
4. The user only needs to paste that key into Vibe Office.

The key product point:

> Hermes-side setup should be zero manual when Hermes can act on its own machine. Client-side setup is still one manual step: the user pastes the key into Vibe Office.

Setup Agent should therefore guide the user toward asking Hermes to do the Hermes-side work, not toward hand-editing config first.

Important warning:

- Restarting Hermes gateway may briefly disconnect the current Hermes chat session.
- Setup Agent should warn the user before asking Hermes to restart:
  - "Hermes may disconnect for about 10 seconds while the gateway restarts."
  - "Come back here after Hermes gives you the access key."

## Paste Hermes' Answer Back Into Setup Agent

The user should not need to ask the developer agent whether Hermes' answer is enough.

Expected behavior:

1. User sends the setup prompt to Hermes.
2. Hermes replies with status, `API_SERVER_KEY`, `Base URL`, and possibly SSH tunnel guidance.
3. User pastes Hermes' full answer into the Setup Agent conversation box.
4. Setup Agent parses the answer and continues the flow.

Setup Agent should detect:

- `API_SERVER_KEY`
- `Base URL`
- whether Hermes is bound to `127.0.0.1` / localhost only
- `ssh -L ...` tunnel commands
- SSH tunnel errors such as `ssh: connect to host ... port 22: Connection timed out`
- remote direct URLs such as `http://172.x.x.x:8642/v1`
- private SSH hosts such as `172.x.x.x` that may not be reachable from the Vibe Office machine
- private key material or instructions that decode/write SSH keys
- cloud firewall / security group blocks for `22` or `8642`

If Hermes is localhost-only and Vibe Office is on another machine, Setup Agent should not tell the user to keep trying the remote IP.
It should prefer the SSH tunnel path and fill:

```txt
Base URL: http://localhost:8642/v1
Hermes access key: saved
```

Then Setup Agent should ask the user to keep the SSH tunnel running and click `Test Hermes Agent`.
Only real `/v1/models` and `/v1/responses` checks can move the flow forward.

If SSH itself times out before the tunnel starts, Setup Agent should not keep asking for keys.
It should say the tunnel did not start and guide the user to check VPN, server address, SSH port, or ask Hermes for another reachable client option.

Remote Hermes may know both private and public addresses.
Setup Agent must ask for the SSH host that is reachable from the Vibe Office machine.
Do not accept a private IP such as `172.x.x.x` as sufficient unless the user is on that private network.
If a private IP times out, ask Hermes for the public IP / reachable SSH host and port.

Hermes must not send SSH private keys into the Setup Agent conversation.
If a private key or hex-encoded private key is pasted, Setup Agent should not decode, store, or display it.
It should redirect the flow to a safer option:

- open the cloud security group / firewall for the API port only from the Vibe Office machine IP, or
- provide a tunnel method that does not require pasting private key material into Vibe Office.

If Hermes binds to `0.0.0.0` but the public Base URL times out, Setup Agent should say the API port is not reachable from this machine and ask the user to open the cloud security group / firewall.

## Current Mistake To Avoid

Do not turn Setup Agent into a documentation block.

Bad pattern:

```txt
Hermes API is not reachable.
Next steps:
1. Start Hermes.
2. Enable API server.
3. Confirm port 8642.
4. Restart Hermes.
5. Try again.
```

This is technically correct, but it does not justify activating a Setup Agent.

Better pattern:

```txt
Setup Agent:
I cannot reach the local Hermes API yet.

Step 1: open Hermes on this computer and ask Hermes to enable its API server.

[Hermes is open] [I cannot find Hermes] [Show me what to ask Hermes]
```

Then:

```txt
Setup Agent:
Good. Now open Settings in Hermes.

[Settings is open] [I do not see Settings]
```

Then:

```txt
Setup Agent:
Ask Hermes:
"Please enable your API server, generate an API_SERVER_KEY if needed, restart the gateway, and give me the key."

[Hermes gave me a key] [Hermes could not do it]
```

Then Setup Agent runs a real check.

## Required MVP Path

Only cover this path for now:

1. User enters a model provider key.
2. Vibe Office verifies the model key.
3. Vibe Office activates Setup Agent.
4. Setup Agent assumes local Hermes framework exists on this computer.
5. Setup Agent guides the user to enable/check local Hermes API.
6. Setup Agent guides the user to ask Hermes to enable API and generate/provide the Hermes access key.
7. Vibe Office verifies both `/v1/models` and `/v1/responses`.
8. Only after both checks pass, Setup Agent offers activation review.
9. Hermes Agent does not appear as active until explicit activation approval.
10. Setup Agent remains available after activation.

Out of scope for this MVP:

- cloud Hermes
- installing Hermes
- Vibe Office directly reading local Hermes config automatically
- Vibe Office directly modifying Hermes config automatically
- exposing or storing access keys outside the current session behavior

In scope:

- asking the user to let Hermes perform Hermes-side API setup
- giving the user a clear prompt to send to Hermes
- warning that Hermes gateway restart may briefly disconnect
- asking the user to paste the key Hermes returns
- verifying the pasted key with real endpoint checks

## Setup Agent State Machine

The conversation should carry an explicit guided state. Suggested states:

- `model_ready`
- `local_hermes_intro`
- `ask_open_hermes`
- `ask_hermes_enable_api`
- `wait_for_hermes_key`
- `test_local_api`
- `api_unreachable_help`
- `api_reachable_key_required`
- `ask_find_access_key`
- `test_access_key`
- `responses_unavailable_help`
- `hermes_ready`
- `activation_review`
- `office_active`

Each state should have:

- one short Setup Agent message
- one primary user action
- two or three buttons at most
- optional inline input only when needed
- a real diagnostic check when the user says they completed a step

## Interaction Rules

Use conversation-first onboarding.

The Setup Agent message is the main surface. Forms are secondary tools inside a step, not the product's main route.

Keep each step small:

- one question
- one action
- one check
- one clear fallback

Avoid presenting long lists of instructions unless the user asks for details.

Use plain English UI copy. Good examples:

- `Open Hermes`
- `Hermes is open`
- `I cannot find Hermes`
- `Show me what to ask Hermes`
- `Hermes gave me a key`
- `Hermes could not enable API`
- `I restarted Hermes`
- `Test local API`
- `Find Hermes access key`
- `I pasted the key`
- `Test Hermes Agent`

Do not use technical text as the primary user-facing instruction:

- avoid leading with `/v1/models`
- avoid leading with `/v1/responses`
- avoid leading with HTTP status
- avoid asking the user to understand "endpoint"

Technical diagnostics can be shown in a compact details area after the human message.

## Diagnostic Behavior

Setup Agent must never pretend success.

For local API checks:

- try `http://127.0.0.1:8642/v1`
- also try `http://localhost:8642/v1`
- check `/models`
- check `/responses`

If both local addresses are unreachable:

- stay in Setup Agent
- do not create Hermes Agent
- do not enter activation review
- ask the user to open Hermes and ask Hermes to enable its API Server
- provide the exact prompt the user can send to Hermes
- offer buttons to proceed step by step

If the API responds with 401 or 403 and no key is available:

- say `Hermes API is running. It needs a Hermes access key.`
- guide the user to ask Hermes for its API Server key
- warn that the model provider key is not the Hermes key

If the user pastes a model provider key or wrong key:

- say `Hermes rejected this key. Use a Hermes access key, not your model provider key.`
- stay in the key step

If `/models` passes but `/responses` fails:

- say `Responses endpoint is not ready.`
- guide the user back to API Server settings
- do not mark Hermes connected

Only mark connected when:

- `/models` accepts the Hermes access key
- `/responses` is reachable and usable

## UI Shape

Reuse the existing system:

- Agent list
- Setup Agent avatar
- canvas node
- conversation panel
- popover/dialog style
- existing buttons and compact result blocks

Do not create a new onboarding dashboard.
Do not create a big settings page.
Do not make the setup form the main character.

The first screen after model key success should feel like:

```txt
Setup Agent:
Let's connect Hermes on this computer.

First, open Hermes. I will give you one message to send there so Hermes can enable its own API and give you the key.

[Hermes is open] [I cannot find Hermes]
```

Not:

```txt
Local Hermes API address: ______
Hermes access key: ______
[Diagnose local Hermes] [Check Hermes Agent]
```

The address/key form can appear later when Setup Agent reaches the relevant step.

## Acceptance Tests

### Scenario 1: API Server Off

1. Reset site.
2. Enter model provider key.
3. Setup Agent comes online.
4. User sees a conversational first step, not a raw Hermes address/key form.
5. User clicks `Hermes is open`.
6. Setup Agent gives the user a short message to send to Hermes:
   - enable API server
   - generate `API_SERVER_KEY` if needed
   - restart gateway
   - return the key
7. Setup Agent warns that gateway restart may briefly disconnect Hermes chat.
8. User clicks `Hermes gave me a key`.
9. User pastes the key into Vibe Office.
10. Vibe Office tests local Hermes API.
11. If unreachable, Setup Agent stays in the guided loop and helps the user recover.

Pass condition:

- no Hermes Agent is created
- no activation review appears
- user always has a clear next click
- user does not need to manually edit `.env` unless Hermes cannot perform the setup

### Scenario 2: API On, Key Unknown

1. Setup Agent tests local Hermes API.
2. API responds with 401 or 403.
3. Setup Agent says Hermes API is running but needs a Hermes access key.
4. Setup Agent guides user to ask Hermes for the API Server key.
5. User pastes key.
6. Vibe Office tests Hermes again.

Pass condition:

- model provider key is not accepted as Hermes key
- wrong key keeps user in key step
- correct key only advances after real endpoint checks

### Scenario 3: Responses Not Ready

1. `/models` accepts the key.
2. `/responses` fails.
3. Setup Agent explains that the response endpoint is not ready.
4. Setup Agent guides user back to API Server settings/restart.

Pass condition:

- no connected state
- no activation review
- no Chief Agent online state

## Implementation Direction

Add a guided onboarding state in the inline Setup Agent flow.

Recommended frontend state:

```ts
type LocalHermesGuideStep =
  | "intro"
  | "open_hermes"
  | "open_settings"
  | "enable_api_server"
  | "test_api"
  | "find_key"
  | "test_key"
  | "responses_help"
  | "ready";
```

Render the step as Setup Agent inline conversation content with buttons.

Keep `HermesTestResult` as the truth source for real checks.

Do not enter `hermes_ready` unless the API test returns `ok: true`.

## Final Product Bar

A normal user should feel:

> "I do not understand Hermes API setup, but Setup Agent is walking me through it."

Not:

> "The app gave me a list of technical steps and now I need to figure it out."
