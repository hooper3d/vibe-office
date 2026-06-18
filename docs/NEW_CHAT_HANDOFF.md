# Vibe Office New Chat Handoff

## Project Root

`C:\Users\hooper\Documents\VibeOffice`

Current dev server:

`http://127.0.0.1:5180/`

Do not use the old temporary Codex folder as project root.

## Role Boundary

Ray / Codex / 开发 Agent / 代码 Agent = 当前开发助手。

Vibe Office 是重新构思后的项目，不沿用旧 VibeOffice 设定。旧信息不要默认使用，必须以当前目录文件和最新需求为准。

## Product Direction

Vibe Office v0.1 是一个统一入口，用来聚合真实 Agent 实例。

核心痛点：

1. 入口分散：用户的 Agent 分散在本地电脑、云服务器、微信、飞书、钉钉、桌面端等入口。
2. 一个 Agent 干所有事：上下文串台、记忆污染、人格混乱。

核心需求：

- 聚合真实 Agent 实例。
- 可以单独直连某个 Agent。
- 可以让 Chief 协调多个 Agent。
- Project Scope 隔离上下文、对话、执行记录、任务和产物。
- 统一入口是核心，不做假 Agent 演示。

## Current Architecture Decision

Vibe Office v0.1:

- Three-column UI
- Agent Registry
- A2A Client
- Provider Adapter
- Project Scope
- Direct Chat
- Chief-led Task Room
- Run / Task / Artifact display

A2A 是 Phase 1 通信底座。不要自研新的 Agent 通信协议。

Hermes 是第一个 Provider Adapter，不是产品边界。UI 不要写成 Hermes-only。

## Current Real Agent

Local Hermes:

- WSL 内运行
- Endpoint: `http://127.0.0.1:8642/v1/chat/completions`
- Model: `hermes-agent`
- Vite proxy: `/hermes-local/* -> http://127.0.0.1:8642/*`

API Key 已由用户在 Office Setup 中配置。不要把 key 写进源码、文档、日志或最终回复。

## Important Docs

继续开发前必须读：

- `docs/DESIGN.md`
- `docs/UI_COMPONENTS.md`
- `docs/UI_REVIEW_CHECKLIST.md`
- `docs/DEVELOPMENT.md`
- `docs/PHASE_1_A2A.md`
- `docs/HANDOFF.md`

尤其以 `docs/DEVELOPMENT.md` 为当前开发计划主文档。

## Product Acceptance

v0.1 完成标准：

1. App 启动时没有 fake/demo agents。
2. 用户能从 Office Setup 接入至少一个真实 agent。
3. 接入后的 agent 出现在 Agent Registry，并显示真实状态。
4. 用户能创建或选择 Project。
5. 用户能在该 Project 内 direct-chat 某个 agent。
6. 中间面板显示真实 conversation。
7. 右侧 Output Workspace 显示相关 run/task/artifact/response。
8. 切换 Project 后，不显示上一个 Project 的 conversation/runs/tasks/artifacts。
9. 刷新浏览器后恢复 agents、projects、conversations、runs、tasks、artifacts。
10. 用户能把一个真实 connected agent 设为 Chief，并启动 Chief-led Task Room。

## Current Implementation State

已完成/已有：

- Vite + React + TypeScript 项目骨架。
- 三栏布局：
  - 左侧 Agent Registry / Projects / Office Setup
  - 中间 Conversation Panel
  - 右侧 Output Workspace
- 深色/浅色主题切换。
- Codex-like split layout，可拖动中间与右侧区域宽度。
- 去除了假 Agent。
- 目前只保留真实添加的 `Local Hermes`。
- `Local Hermes` 可作为 Chief。
- Office Setup 支持配置 provider / endpoint / key / model / role / tags / location。
- 本地 Hermes 可通过 `/hermes-local` proxy 调用。
- Direct message 当前可发送到 Hermes，并把结果适配到右侧 task/artifact/output 表面。
- Composer 已改为 96px textarea。
- 发送按钮在右下角，圆形向上箭头。
- 输入为空时发送按钮灰色 disabled，hover 不显示禁止光标。
- textarea resize handle 已去除。
- Sidebar 底部只显示 `Office Setup`，不显示 `Hermes` 字样。

未完成/下一步重点：

1. 真正实现中心 Conversation：
   - Conversation
   - ConversationMessage
   - user/agent bubbles
   - sending/error states
   - Project + Agent scoped history

2. 引入 ProjectRun：
   - 右侧 Output Workspace 不只显示 Artifact。
   - 一次 direct chat / A2A task / Chief delegation 都应该形成 run。
   - 有些 direct chat 没有 formal Artifact，但仍应有 run record。

3. 修正 Direct Chat A2A Mapping：
   - Direct chat 发送 A2A message。
   - 如果返回 Task，创建/更新 ProjectTask。
   - 如果返回 direct Message，存为 ConversationMessage。
   - 只有 task output 或明确 durable output 才创建 Artifact。
   - 不要强行把每条聊天回复伪装成 Artifact。

4. 持久化：
   - agents
   - projects
   - conversations
   - messages
   - runs
   - tasks
   - artifacts
   - migration/version handling

5. Agent Management：
   - edit/delete/retest agent
   - set Chief
   - disable/enable agent
   - avoid duplicate local provider entries

6. Chief-led Task Room v0.1：
   - 只做一轮规划
   - 每个 participant 只委派一个任务
   - participant 不递归委派
   - Chief 聚合一次结果
   - 用户 dispatch 前可手动覆盖 participants
   - 不做复杂自治 multi-step planning

## Important Architecture Rules

Project Scope:

- Conversations
- Messages
- Runs
- Tasks
- Artifacts
- Context snapshots
- Chief-led task rooms

都必须 scoped by Project。

不 scoped by Project：

- Agent Registry
- Provider credentials
- Agent capability metadata
- Theme preference

禁止：

- 无 active project 发送 message。
- 展示其它 project 的 artifacts。
- 跨 project 复用 conversation history。
- 把一个 project 的 context 注入另一个 project。

## Provider Adapter Rules

Provider adapter 要暴露 normalized capabilities：

- supportsA2A
- supportsAgentCard
- supportsTaskLifecycle
- supportsArtifacts
- supportsStreaming
- supportsCancel
- supportsRetry
- supportsHealthCheck
- supportsDirectChatOnly

Adapter modes：

1. Native A2A
2. A2A-shaped compatibility adapter
3. Health-only provider

Agent discovery priority：

1. explicit agentCardUrl
2. `/.well-known/agent-card.json`
3. manual provider configuration

Health fallback 不是 discovery，只能确认手动配置的 endpoint 是否可达。

## A2A Notes

已核对当前 A2A 规范：

- well-known path 是 `/.well-known/agent-card.json`
- HTTP native A2A 可用 `A2A-Version`
- Agent Card 可声明 `supportedInterfaces`
- Message 和 Artifact 语义不同
- Messages 不应被用来交付 task output
- Task output 应通过 Task 关联的 Artifacts 返回

实现时不要把 A2A protocol enum 直接泄露到 UI，要映射到内部状态：

- idle
- submitting
- submitted
- working
- input_required
- completed
- failed
- canceled
- unsupported

## Security Boundary

当前 prototype/dev 阶段 API key 由 local trusted layer 的 prototype credential registry 管理。

硬边界：

- browser localStorage 只允许保存 agent 元数据，不允许保存 provider secrets。
- local trusted credential registry 仍是开发桥接层，不是最终安全存储。
- public release 必须迁移到 OS-backed secure storage 或等价的本地安全凭证层。
- UI 应提示 dev/prototype warning。
- Provider API keys 不能随 workspace data export。
- 日志必须 redact credentials、Authorization headers、含 token 的 provider endpoints。

## UI Direction

用户明确要求：

- 干净、克制、现代 SaaS / studio dashboard。
- 类 Codex 的分割布局。
- 不要卡片堆叠感。
- 不要画布背景。
- 不要多余说明文字。
- 不要假 Agent。
- 不要 Hermes-only 文案。
- 右侧 Output Workspace 可以是浏览器，但不需要无关装饰。
- 图标按钮优先，少文字。
- 深色方案已经参考用户截图实现，保留浅色切换。

每次前端 UI 任务完成前检查：

- `docs/UI_REVIEW_CHECKLIST.md`

## Commands

Install:

```bash
npm install
```

Start dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 5180
```

Build:

```bash
npm run build
```

最近一次代码构建通过。

## Current Files To Inspect First

- `src/App.tsx`
- `src/styles.css`
- `src/domain/a2a.ts`
- `src/domain/types.ts`
- `src/domain/projectScope.ts`
- `src/domain/hermesSetup.ts`
- `src/domain/seedData.ts`
- `src/services/a2aClient.ts`
- `src/services/hermesA2AAdapter.ts`
- `src/services/agentStorage.ts`
- `vite.config.ts`

## Development Attitude

不要照单全收需求建议。Ray 应该有自己的工程判断：

- 正确的建议采纳。
- 不准确、过度绝对、会误导实现的建议要指出并修正。
- 不要为了右侧有内容而强行制造 Artifact。
- 不要为了方便使用全局状态破坏 Project Scope。
- 不要做复杂多 Agent 自治，v0.1 先闭环真实产品体验。
