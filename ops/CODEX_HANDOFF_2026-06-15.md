# Codex Handoff - Vibe Office Preview

Date: 2026-06-15
Workspace: `C:\Users\hooper\Documents\AG_UI`
Local app: `http://localhost:3000/`
Assistant identity in this project: Ray

## Product Positioning

Current product direction:

- First public preview: **Vibe Office Preview: Product Team**
- First/default office template: **Product Team**
- Default project: **Default Project**
- UI language for the first version: English
- Core concept: a small product-development office with Chief, Builder, Writer, Operator, and a visible Project Context Hub.

Current visible team model:

- Chief: coordinates agents and context
- Builder: builds and fixes
- Writer: publishes and summarizes
- Operator: external tools and special skills
- Project Context Hub: shared memory, knowledge, and state between agents

## Recent Work Completed

### Office Canvas / React Flow

The right-side Agent Office Canvas was moved toward a React Flow / xyflow implementation.

Important design expectations from the user:

- Keep the canvas close to the supplied reference image.
- Avatar circles should be 80px.
- Project Context Hub node should be compact, around 260px wide.
- Lines should feel clean and mostly vertical/orthogonal, not tangled.
- Endpoint dots on lines should remain visible.
- Working-state ring animation should be restored or preserved.
- Clicking blank canvas should dismiss the selected agent detail popover.
- Zoom control currently exists but was reported as broken; inspect and repair.

### Office Template / Project Selection

Top canvas controls were converted to dropdown-style controls:

- Team selector: Product Team
- Project selector: Default Project

User wanted these styled with the product's own dark UI style, not native browser selects.

### Bottom Canvas Buttons

The four bottom buttons were clarified as:

- Task Desk
- Archive Library
- Materials & Outputs
- History Log

History subtitle should be:

- AG-UI Event Stream

Materials & Outputs combines user-provided materials and generated outputs. User accepted this semantics.

### Default Project

The office should create/show a Default Project by default to avoid ambiguity about where chats, materials, and outputs live.

### Agent Naming

Current display names:

- Chief
- Builder
- Writer
- Operator

Important distinction:

- Display names are product-facing and can change.
- Backend/profile keys are still legacy `AgentName` values: `Lucy`, `Ray`, `Tiger`, `Musk`.
- The current UI maps legacy `Lucy` to visible Chief / planning-agent behavior.

The next full migration should rename backend Agent IDs/profile keys separately, for example:

- `Lucy` -> planning agent / Chief profile
- `Ray` -> builder/developer profile
- `Tiger` -> writer profile
- `Musk` -> operator profile

Do not hard-replace those legacy profile keys without auditing storage, AG-UI state paths, Hermes profiles, and persisted local state.

## Naming Migration Completed

The approved migration away from core Lucy workflow semantics has been completed.

Renamed concepts:

- `LucyPlan` -> `PlanWorkflow`
- `LucyWorkflowStage` -> `PlanWorkflowStage`
- `lucy-plan-store.ts` -> `plan-workflow-store.ts`
- `LucyConversationPanel` -> `AgentConversationPanel`

New action names:

- `submit_requirement_to_planning_agent`
- `generate_plan_workflow`
- `ask_planning_agent_review`

New event names:

- `planning_agent_clarification`
- `plan_workflow_ready`
- `plan_workflow_completed`
- `planning_agent_linked_review`
- `planning_agent_triage`

Compatibility:

- `app/api/agent/route.ts` intentionally keeps exactly three old action aliases:
  - `submit_requirement_to_lucy`
  - `generate_lucy_plan`
  - `ask_lucy_review`
- These are centralized in `normalizeAgentAction()` and only map old persisted input into new actions.

Storage:

- New workflow file: `ops/PLAN_WORKFLOW.json`
- Legacy fallback: `ops/LUCY_PLAN.json`
- Store reads legacy only if the new workflow file is missing, then writes the new workflow.

## Important Files Touched Recently

Core migration files:

- `types/agent.ts`
- `types/task.ts`
- `lib/plan-workflow-store.ts`
- `lib/codex-exec-adapter.ts`
- `lib/command-templates.ts`
- `lib/context-hub.ts`
- `lib/run-history.ts`
- `lib/workflow-triage.ts`
- `app/api/agent/route.ts`
- `app/page.tsx`
- `components/AgentConversationPanel.tsx`
- `components/EventStream.tsx`
- `components/QuickActions.tsx`
- `components/TaskList.tsx`

Legacy files deleted in the working tree:

- `components/LucyConversationPanel.tsx`
- `lib/lucy-plan-store.ts`
- `app/api/hermes-lucy/route.ts`
- `app/api/hermes-tiger/route.ts`
- `app/api/hermes-musk/route.ts`
- `lib/hermes-lucy-client.ts`
- `lib/hermes-tiger-client.ts`
- `lib/hermes-musk-client.ts`

New shared Hermes client:

- `lib/hermes-agent-client.ts`

## Verification Already Run

These passed after the naming migration:

```powershell
npx tsc --noEmit --pretty false
npm run lint
```

Old-name scans:

```powershell
rg -n "LucyPlan|LucyWorkflow|LucyConversation|lucyPlan|setLucyPlan|lucyConversation|setLucyConversation|lucy-plan-store|readLucyPlan|writeLucyPlan|updateLucyPlan|inferLucyPlan|buildLucy|clearLucy|hermes_lucy|tool_hermes_lucy" app components lib types --glob "*.ts" --glob "*.tsx"
```

No matches.

```powershell
rg -n "submit_requirement_to_lucy|generate_lucy_plan|ask_lucy_review|lucy_plan|lucy_triage|handoff_to_lucy|linked_lucy|awaiting_lucy|ag-ui-lucy|tool_lucy|lucy_clarification" app components lib types --glob "*.ts" --glob "*.tsx"
```

Only the three compatibility aliases in `app/api/agent/route.ts` remain.

Also checked:

```powershell
rg -n "hermes-lucy|hermes-tiger|hermes-musk|sendLucyResponse|sendTigerResponse|sendMuskResponse|HermesLucyError|HermesTigerError|HermesMuskError|lucy-plan-store" app components lib types --glob "*.ts" --glob "*.tsx"
```

No matches.

## Known Current Risks / Next Fixes

### P0 Before Preview

1. Canvas interaction polish
   - restore/verify working ring animation
   - click blank canvas closes selected-agent popover
   - fix zoom control behavior
   - clean orthogonal edge routing and endpoint dots
   - keep React Flow styles from drifting away from the reference

2. Artifact correctness
   - agent saying "file written to desktop" is not enough
   - AG-UI should receive a registered artifact, preview it, and allow download
   - markdown preview/rendering in chat looked good; Materials & Outputs artifact card needs to preserve preview/download behavior

3. Backend ID/profile migration
   - do not leave old private-test names such as lucy/ray/tiger/musk mixed into core domain semantics long term
   - migrate carefully from legacy profile keys to stable IDs such as `planning_agent`, `builder_agent`, `writer_agent`, `operator_agent`
   - preserve compatibility with localStorage, event history, AG-UI state paths, and Hermes profiles

4. Full English UI pass
   - first version should be English
   - scan for remaining Chinese UI strings and mojibake
   - do not remove Chinese from docs unless intentionally converting docs

### P1

- Agent management/editing UI
- Persisted chat validation by project and agent
- Better outputs/materials filters by display agent name
- Clear distinction between user inputs/materials and agent outputs
- Better empty states for Default Project

### P2

- More office templates:
  - Video Team
  - Copywriting Team
  - Marketing Team
  - Sales Team
- More mature project switching
- Agent profile editing and skills/tags management

## Current Worktree Warning

The worktree is intentionally dirty with many changes from today's development. Do not reset or revert unrelated files.

Before making new changes, run:

```powershell
git status --short
```

The user has not asked to commit yet.

## Recommended First Step In New Conversation

1. Read this handoff.
2. Run:

```powershell
git status --short
npx tsc --noEmit --pretty false
npm run lint
```

3. Start with P0 canvas fixes:
   - verify React Flow canvas current behavior in the browser
   - fix blank-click popover close
   - fix zoom control
   - restore/verify working ring animation
   - clean edge endpoints and routing

## Suggested Opening Prompt For New Thread

Ray, read `ops/CODEX_HANDOFF_2026-06-15.md` first. Continue from the current dirty worktree in `C:\Users\hooper\Documents\AG_UI`. Do not revert unrelated changes. We are building Vibe Office Preview: Product Team. Start with the P0 canvas interaction fixes and verify with TypeScript/lint and browser QA.
