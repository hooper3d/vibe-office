# AI Agent Console

AG-UI First 的极简 MVP。它不是完整 Agent 平台，新版目标是验证 AG-UI 事件通信和 Project Context Hub 共享上下文。

## 项目目的

这个项目只跑通一条链路：

```txt
点击按钮
  -> 前端发送 AG-UI RunAgentInput
  -> /api/agent local runtime 接收
  -> runtime 读取 / 写入 Project Context Hub Markdown
  -> runtime 通过 SSE 返回 AG-UI 事件流
  -> UI 展示事件、状态变化、共享上下文和生成指令
```

当前安全示例项目是 `AG-UI 推广网页开发`，不使用旧的交易类测试项目。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- lucide-react
- `@ag-ui/core`

## 如何运行

```bash
npm install
npm run dev
```

打开：

```txt
http://localhost:3000
```

## AG-UI 在项目中的位置

- `lib/agui-client.ts`：构造 `RunAgentInput`，通过 `fetch` 发送给 runtime，并读取 SSE 事件流。
- `app/api/agent/route.ts`：本地 Agent Runtime，通过 SSE 流式返回 `RUN_STARTED`、`TEXT_MESSAGE_CONTENT`、`STATE_DELTA`、`TOOL_CALL_*`、`CUSTOM`、`RUN_FINISHED` 等 AG-UI 事件。
- `lib/local-agent-runtime.ts`：读取本地工作区白名单文件和 git 状态，并把指令写入 `ops/RAY_INBOX.md`、`ops/LUCY_INBOX.md` 等受控 inbox。
- `lib/context-hub.ts`：初始化并更新 Project Context Hub 的 Markdown 共享记忆。
- `lib/codex-exec-adapter.ts`：可选调用本地 Codex CLI。Lucy/Tiger 默认只读；Ray 可通过环境变量开启 workspace-write。
- `components/ContextHubPanel.tsx`：展示 Project Context Hub 文件组和上下文流向。
- `components/EventStream.tsx`：把事件流可视化。
- `components/CommandBox.tsx`：显示 runtime 返回的标准指令，支持复制、清空和手动测试消息。

## 点击按钮后发生什么

以“派发给 Ray”为例：

```ts
sendAguiInput({
  targetAgent: "Ray",
  action: "dispatch_to_ray",
  projectId: "demo-project",
  taskId: "task-001"
});
```

本地 runtime 会读取工作区上下文和 Project Context Hub，写入 `ops/RAY_INBOX.md`，并在 Ray 动作中更新 `DEV_LOG.md`、`PROGRESS_SUMMARY.md`、`HANDOFF.md`、`RELEASE_NOTES.md`、`BLOG_CONTEXT.md`。前端实时展示 AG-UI 事件流，并把 `CUSTOM/generated_command` 中的指令放入指令区。

## Project Context Hub

第一版用 Markdown 文件模拟共享记忆：

- `ops/PROJECT_BRIEF.md`
- `ops/PROGRESS_SUMMARY.md`
- `ops/DEV_LOG.md`
- `ops/HANDOFF.md`
- `ops/DECISIONS.md`
- `ops/RELEASE_NOTES.md`
- `ops/BLOG_CONTEXT.md`

Ray 负责写入开发过程，Lucy 负责统筹验收，Tiger 读取 `BLOG_CONTEXT.md` / `RELEASE_NOTES.md` 生成 Blog 草稿。

当前 `Ray → Lucy 联动` 是真实本地联动：一次点击会先让 Ray 写入 Project Context Hub，再自动触发 Lucy 基于同一份共享上下文做验收。

## 本地 Agent 执行

默认运行：

```powershell
$env:AG_UI_ENABLE_CODEX_EXEC='1'
npm run dev -- --port 3000
```

Ray 派发开发任务需要显式开启写入模式；否则只会写入 inbox、生成指令和事件，不会启动修改工作区的 runner：

```powershell
$env:AG_UI_ENABLE_CODEX_EXEC='1'
$env:AG_UI_CODEX_WRITE_ACTIONS='1'
npm run dev -- --port 3000
```

## 当前限制

- 不接数据库。
- 默认不执行真实代码修改；Ray 写入模式需要显式开启。
- 不做多项目、多页面、权限系统和复杂设置中心。
- 当前已支持可选本地 Codex exec；是否执行取决于环境变量。

## 后续扩展

- 把 Ray / Lucy / Tiger 接成真实 runner。
- 引入 LangGraph 做多 Agent 编排。
- 接入 Langfuse 做 trace 和执行日志。
