# Hermes User Onboarding Requirements / Handoff

Date: 2026-06-12
Project: Vibe Office Hermes provisioning
Local app: http://localhost:3001/

## Current Verified Path

One route is now working:

1. User enters a model provider key.
2. Vibe Office creates and keeps a system `Setup Agent`.
3. User chooses the existing Hermes path.
4. User provides Hermes API address and Hermes access key.
5. Vibe Office checks the Hermes API.
6. User reviews activation in the Setup Agent conversation.
7. User explicitly activates the connected Hermes Agent.
8. The office keeps both Agents:
   - `Setup Agent`: system setup guide
   - `Hermes Agent`: user/office Agent, role `Chief Agent`
9. Chat with `Hermes Agent` routes to the connected Hermes `/responses` endpoint.

This proves the product can connect a local Hermes instance when the user already has:

- Hermes API server running
- Hermes API base URL
- Hermes access key

## Remaining Product Gap

This is not enough for normal users.

Most users will not know:

- whether Hermes is installed
- whether Hermes is running
- whether the Hermes API server is enabled
- what the Hermes API URL is
- where the Hermes access key is stored
- how to create or rotate the access key
- whether their Hermes is local or on a cloud server
- what to do when a port, firewall, token, or endpoint check fails

The next phase is not more Chief Agent UI polish. The next phase is making `Setup Agent` a real onboarding guide that helps a normal user reach the connected state.

## Product Goal

Make `Setup Agent` guide a non-technical user from:

> “I have a model key, but I do not know how to connect Hermes.”

to:

> “Hermes Agent is connected and ready for explicit Chief Agent activation.”

The flow must stay inside the Setup Agent conversation as much as possible.

## Required MVP State Machine

Keep the existing state machine, but make the transitions user-proof:

- `empty`
- `model_ready`
- `office_previewed`
- `hermes_ready`
- `activation_review`
- `office_active`

Important: do not reintroduce a generic old onboarding page as the main route. Early setup should happen in the conversation panel.

## Setup Agent Responsibilities

### 1. Detect Local Hermes

Setup Agent should help determine:

- Is Hermes installed?
- Is Hermes running?
- Is the local API endpoint reachable?
- Is `/v1/models` reachable?
- Is `/v1/responses` reachable?

Suggested checks:

- `http://127.0.0.1:8642/v1/models`
- `http://localhost:8642/v1/models`
- health endpoint if available

Do not mark Hermes connected unless a real endpoint check succeeds.

### 2. Guide API Server Enablement

If Hermes exists but the API is not reachable, Setup Agent should explain the next concrete action:

- start Hermes
- enable API server
- confirm port
- confirm base URL
- restart Hermes if needed

The user should not be expected to know what an API server is.

### 3. Guide Access Key Discovery

If the access key is missing, Setup Agent should guide the user to:

- find the configured API server key
- create a new access key if supported
- confirm that the key is a Hermes API key, not a model provider key

The UI should offer a clear action such as:

`I don't know my Hermes access key`

This should start a guided diagnostic, not just return a generic explanation.

### 4. Support Cloud Hermes

Existing Hermes may be local or cloud-hosted.

The flow should ask:

- Is Hermes on this computer?
- Is Hermes on a cloud server?

For cloud Hermes, guide the user to confirm:

- full API URL
- HTTPS or HTTP
- port
- access key
- firewall/security group
- whether `/v1/models` is reachable

### 5. Preserve Setup Agent

Setup Agent is a built-in system assistant and should remain available after Chief Agent activation.

After activation:

- `Setup Agent` remains in the Agent list.
- `Hermes Agent` appears as a separate office Agent.
- `Hermes Agent` has role `Chief Agent`.
- If no user-provided name exists, default name is `Hermes Agent`.
- `Chief Agent` is a role/title, not a person/agent name.

## UX Requirements

- Keep UI text concise and plain English.
- Do not show technical cards after the Agent is already connected unless the user asks.
- Do not pretend success.
- Every failed check should say what failed and what the user should do next.
- Avoid card-in-card layouts.
- Reuse existing Agent list, canvas, avatar, popover, drag, and conversation styles.
- Do not invent a new visual system.

## Real Test Scenarios For Next Thread

### Scenario A: User Has Model Key Only

1. Reset site.
2. Enter model provider key.
3. Verify Setup Agent comes online.
4. Ask Setup Agent: “I want to connect Hermes but I don't know the API key.”
5. Verify Setup Agent starts a guided diagnostic instead of ending with generic advice.

### Scenario B: Local Hermes Running, Key Known

1. Use local Hermes URL.
2. Enter known access key.
3. Verify `/models` check succeeds.
4. Activate only after explicit review.
5. Verify Hermes Agent can chat through `/responses`.

### Scenario C: Local Hermes Running, Key Unknown

1. Use local Hermes URL.
2. Leave access key empty.
3. Verify check fails honestly.
4. Verify Setup Agent offers a concrete key-finding path.

### Scenario D: Local Hermes API Off

1. Simulate or use an unreachable local endpoint.
2. Verify Setup Agent says Hermes/API is unreachable.
3. Verify user gets next actions to start or enable Hermes API.

### Scenario E: Cloud Hermes

1. Select existing Hermes.
2. Enter a non-local cloud URL.
3. Verify Setup Agent copy supports cloud URL, token, port, and firewall checks.

## Current Known Implementation Notes

- `app/page.tsx` contains the inline Setup Agent flow and virtual Agent selection.
- `app/api/provision/hermes/test/route.ts` checks Hermes connectivity.
- `app/api/provision/hermes/chat/route.ts` sends Chief Agent messages to Hermes `/responses`.
- `components/AgentStatus.tsx` renders Setup Agent and Hermes Agent nodes on the canvas.
- `components/LucyConversationPanel.tsx` renders the conversation panel and inline flow content.

## Next Development Focus

Build the Setup Agent diagnostic flow for ordinary users:

1. Add explicit “I don't know my Hermes access key” path.
2. Add local/cloud Hermes choice inside Setup Agent conversation.
3. Add honest endpoint diagnostics.
4. Add actionable remediation for unreachable API, missing key, unauthorized key, and empty response.
5. Keep the user inside the Setup Agent conversation until Hermes is truly connected.

## 2026-06-13 Product Clarification

The core product intent is now captured in:

- `ops/HERMES_SETUP_AGENT_GUIDED_ONBOARDING.md`

Important clarification:

- The immediate MVP path is not cloud Hermes and not Hermes installation.
- The immediate MVP path is: user has a model key and local Hermes framework exists, but the user does not know whether Hermes API Server is enabled or where the Hermes access key is.
- Setup Agent must not be a documentation block or a form wrapper.
- Setup Agent is the first real assistant because it should guide and assist the user step by step.
- Each step should ask for one visible user action, provide 2-3 simple buttons, then run a real check.
- Long "Next steps" lists are not enough. That is still manual-style onboarding.
- New Lucy/Hermes discovery: Hermes itself can enable its API server, generate `API_SERVER_KEY`, set `API_SERVER_ENABLED=true`, restart gateway, and give the key to the user when Hermes can act on its own machine.
- Therefore Setup Agent should first guide the user to ask Hermes to perform Hermes-side API setup. The user should only need to paste the returned key into Vibe Office.
- Warn the user that `hermes gateway restart` may briefly disconnect the Hermes chat session.
