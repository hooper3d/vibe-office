# AG_UI_FIRST_MVP_DEV.md

# AI Agent Console · AG-UI First 极简 MVP 开发文档

## 1. 文档目的

本文件用于指导 Ray 开发一个 **极简版 AI Agent Console MVP**。

这不是一个大而全的后台系统，也不是复杂项目骨架。

第一版目标非常明确：

> 用最小功能接入 AG-UI，先跑通 Agent 与 UI 的通信方式，理解 AG-UI 的能力和使用方式。

---

## 2. 核心纠偏

之前版本的问题：

```txt
项目骨架太大
模块太多
像一个完整后台
多项目、多页面、多配置过早
没有把 AG-UI 放在第一优先级
```

现在的正确方向：

```txt
第一版就接入 AG-UI
只做一个极简控制台页面
先跑通事件流和指令交互
后续再扩展多项目、多 Agent 自动编排
```

---

## 3. 项目定位

项目名称建议：

```txt
AI Agent Console
```

第一版定位：

```txt
一个用于学习和验证 AG-UI 能力的极简多 Agent 控制台 MVP
```

长期定位：

```txt
一个可扩展的多项目、多 Agent 调度控制台
```

但第一版不要做长期完整形态。

---

## 4. 第一版必须实现什么

第一版必须包含 AG-UI。

第一版的核心不是“展示很多数据”，而是跑通：

```txt
User 点击控制台动作
  ↓
前端通过 AG-UI 发送输入 / 状态
  ↓
Agent Runtime 接收
  ↓
Agent Runtime 返回事件流
  ↓
前端显示事件、状态、消息或结果
```

---

## 5. 第一版不做什么

第一版不做：

- 不做完整多项目系统
- 不做复杂权限系统
- 不做数据库
- 不做复杂任务管理后台
- 不做完整 LangGraph 编排
- 不做复杂文件写入
- 不做真实自动修改代码
- 不做真实网站发布
- 不做复杂导航
- 不做完整设置中心

第一版只做：

```txt
一个页面
一个 AG-UI 连接
一个最小 Agent Runtime
几个按钮
一个事件流显示区
一个指令生成 / 发送区
```

---

## 6. AG-UI 学习目标

第一版开发完成后，需要能理解：

1. AG-UI 前端如何连接 Agent 后端。
2. Agent 后端如何向 UI 发送事件。
3. UI 如何显示 Agent 的流式状态。
4. 用户输入如何传给 Agent。
5. Agent 执行过程如何被 UI 可视化。
6. 后续如何把 Lucy / Ray / Tiger 接入这个流程。

---

## 7. 第一版架构

推荐最小架构：

```txt
AI Agent Console Frontend
  ↓ AG-UI client
Minimal Agent Runtime / API Route
  ↓
Mock Agent Logic
  ↓
AG-UI Event Stream
  ↓
Frontend Event Viewer
```

第一版 Agent Runtime 可以是 mock agent，不需要真正调用 Ray 修改代码。

重点是：

```txt
前端 ↔ AG-UI ↔ Agent Runtime
```

这条链路跑通。

---

## 8. 推荐技术栈

### 前端

```txt
Next.js
TypeScript
Tailwind CSS
```

### AG-UI

优先使用 AG-UI 官方推荐方式或 starter：

```txt
npx create-ag-ui-app
```

如果 Ray 选择手动搭建，需要使用 AG-UI 相关 SDK，并保持实现尽量简单。

### UI 图标

```txt
lucide-react
```

### 数据

第一版使用 mock 数据。

不要接数据库。

---

## 9. 推荐项目结构

保持轻量，不要过度拆分。

```txt
ai-agent-console/
  app/
    page.tsx
    api/
      agent/
        route.ts

  components/
    AgentStatus.tsx
    TaskList.tsx
    QuickActions.tsx
    EventStream.tsx
    CommandBox.tsx

  lib/
    mock-data.ts
    command-templates.ts
    agui-client.ts

  types/
    agent.ts
    task.ts
    event.ts

  README.md
```

不要一开始就做：

```txt
多层 workspace
复杂 packages
大型后台 layout
复杂权限目录
复杂 settings 系统
```

---

## 10. 页面布局

第一版只做一个页面：

```txt
/
```

或：

```txt
/agent-console
```

页面结构：

```txt
顶部：
  AI Agent Console
  当前项目
  AG-UI 连接状态

左侧主区域：
  任务列表
  最新 Handoff
  Bug / 风险

右侧：
  Agent 状态
  快捷动作

底部：
  AG-UI Event Stream
  指令输入 / 发送区
```

---

## 11. UI 要求

视觉关键词：

```txt
极简
清爽
轻量
macOS Frost
SaaS 控制台
少即是多
```

禁止：

```txt
大而全后台
复杂侧边栏
多层导航
卡片套卡片
高饱和科技风
过度玻璃拟态
复杂渐变
大量图表
```

第一版页面应该像：

```txt
一个轻量实验台
一个 AG-UI 学习控制面板
一个能快速验证流程的 MVP
```

而不是完整商业后台。

---

## 12. 页面模块

## 12.1 顶部 Header

显示：

```txt
AI Agent Console
AG-UI First MVP
当前项目：A股交易助手 / Demo Project
AG-UI: Connected / Mock Connected / Error
```

AG-UI 状态必须明确显示。

---

## 12.2 Agent 状态

显示 Lucy / Ray / Tiger 三个 Agent。

第一版只是状态展示，不要求真的分别运行。

```txt
Lucy：项目维护 Agent
Ray：开发 Agent
Tiger：网站维护 Agent
```

状态示例：

```txt
idle
working
handoff
reviewing
blocked
```

---

## 12.3 任务列表

第一版使用 mock 任务。

字段：

```txt
优先级
任务标题
状态
负责人
```

示例：

```txt
P1 交易信号模块性能优化   coding    Ray
P1 任务文档整理           ready     Lucy
P2 网站首页内容更新       ready     Tiger
```

---

## 12.4 快捷动作

第一版只保留 4 个按钮：

```txt
派发给 Ray
让 Lucy 验收
让 Tiger 更新网站
生成项目日报
```

点击按钮后，不只是生成文本，而是要通过 AG-UI 发送一次用户意图。

例如点击：

```txt
派发给 Ray
```

应该触发：

```txt
sendAguiInput({
  targetAgent: "Ray",
  action: "dispatch_task",
  projectId: "demo-project",
  taskId: "task-001"
})
```

Agent Runtime 返回事件流，前端显示。

---

## 13. AG-UI 事件流显示区

这是第一版最重要的学习模块。

需要有一个区域：

```txt
AG-UI Event Stream
```

用于显示事件：

```txt
RUN_STARTED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
STATE_DELTA
TOOL_CALL_START
TOOL_CALL_END
RUN_FINISHED
ERROR
```

不要求事件名完全固定，但 Ray 应尽量参考 AG-UI 标准事件。

显示方式：

```txt
[10:24:01] run_started
[10:24:02] message: Ray 正在读取任务上下文
[10:24:03] state_delta: task.status = coding
[10:24:04] message: 已生成给 Ray 的执行指令
[10:24:05] run_finished
```

第一版必须让用户看到：

> AG-UI 不是普通按钮，而是事件驱动的 Agent ↔ UI 通信。

---

## 14. 指令区

底部保留一个指令区。

功能：

- 显示当前由 Agent Runtime 返回的标准指令
- 支持复制
- 支持清空
- 支持手动输入测试消息并发送给 AG-UI runtime

示例：

```md
@Ray

请读取当前项目的：
- AGENTS.md
- ops/TASKS.md
- ops/HANDOFF.md
- ops/CODEX_RULES.md

请根据最高优先级 ready 任务继续开发，完成后写入 HANDOFF.md。
```

---

## 15. Minimal Agent Runtime

第一版可以做一个 mock agent runtime。

它的职责：

1. 接收前端通过 AG-UI 发送的 action。
2. 根据 action 生成模拟事件流。
3. 返回标准指令文本。
4. 返回状态变更事件。
5. 前端实时显示。

示例动作：

```ts
type AgentAction =
  | "dispatch_to_ray"
  | "ask_lucy_review"
  | "ask_tiger_publish"
  | "daily_report";
```

---

## 16. AG-UI 接入要求

Ray 需要优先阅读 AG-UI 官方文档和示例。

第一版接入要求：

- 使用 AG-UI client 或 starter 初始化项目。
- 建立一个最小可运行 Agent backend / API route。
- 前端可以发送一次 action。
- 后端可以返回事件流。
- 前端可以显示事件流。
- 事件流完成后显示生成指令。
- 错误时显示 error event。

---

## 17. MVP 成功标准

第一版成功，不是看功能多不多。

只看这条链路是否跑通：

```txt
点击按钮
  ↓
AG-UI 发送用户意图
  ↓
Agent Runtime 收到
  ↓
Runtime 返回事件流
  ↓
UI 显示事件流
  ↓
UI 显示生成指令
  ↓
用户复制指令
```

只要这条链路跑通，第一版就是成功。

---

## 18. 第一版验收清单

- [ ] 项目是独立项目。
- [ ] 页面足够极简，不臃肿。
- [ ] 第一版已经接入 AG-UI。
- [ ] 顶部显示 AG-UI 连接状态。
- [ ] 有 Lucy / Ray / Tiger 状态展示。
- [ ] 有 mock 任务列表。
- [ ] 有 4 个快捷动作。
- [ ] 点击快捷动作会通过 AG-UI 发送事件。
- [ ] 后端 / Runtime 会返回事件流。
- [ ] 前端能显示事件流。
- [ ] 前端能显示生成的标准指令。
- [ ] 指令可以复制。
- [ ] 没有复杂多项目后台骨架。
- [ ] 代码结构简单，方便学习。
- [ ] 后续可以扩展真实 ops 文档。
- [ ] 后续可以扩展 LangGraph。
- [ ] 后续可以扩展真正的 Ray / Lucy / Tiger runner。

---

## 19. 后续扩展预留

第一版必须预留扩展点，但不要提前实现。

## 19.1 多项目扩展

未来支持：

```txt
A股交易助手
个人网站
AIGC Studio
其他项目
```

但第一版只做一个 mock project。

---

## 19.2 真实 ops 文档

未来接入：

```txt
AGENTS.md
ops/PROJECT.md
ops/TASKS.md
ops/HANDOFF.md
ops/BUGS.md
ops/CHANGELOG.md
```

第一版不读真实文件。

---

## 19.3 LangGraph

未来用 LangGraph 编排：

```txt
Lucy Planner
  ↓
User Approval
  ↓
Ray Developer
  ↓
Lucy Reviewer
  ↓
Tiger Publisher
```

第一版不接 LangGraph。

---

## 19.4 Agent Runner

未来按钮可以真实触发：

```txt
Ray Runner
Lucy Runner
Tiger Runner
```

第一版只通过 AG-UI mock runtime 验证交互。

---

## 19.5 Langfuse

未来接入：

```txt
执行日志
trace
prompt 版本
成本统计
错误排查
```

第一版不接。

---

## 20. 给 Ray 的开发顺序

Ray 请按这个顺序开发：

1. 阅读本文件。
2. 阅读 AG-UI 官方文档和 quickstart。
3. 创建极简独立项目。
4. 使用 AG-UI starter 或 AG-UI SDK 建立最小连接。
5. 做一个单页面 UI。
6. 做 mock 任务和 Agent 状态。
7. 做 4 个快捷动作。
8. 点击动作后通过 AG-UI 发送输入。
9. Runtime 返回模拟事件流。
10. 前端显示事件流。
11. 显示生成指令。
12. 实现复制按钮。
13. 优化 UI，去掉臃肿模块。
14. 写 README，说明如何运行和如何理解 AG-UI。
15. 记录后续扩展点。

---

## 21. README 必须说明

README 中必须说明：

```txt
这是一个 AG-UI First 的极简 MVP。
它不是完整 Agent 平台。
第一版目标是学习 AG-UI 的前后端事件通信方式。
```

README 至少包含：

- 项目目的
- 技术栈
- 如何运行
- AG-UI 在项目中的位置
- 点击按钮后发生了什么
- 当前限制
- 后续扩展路线

---

## 22. 最重要的一句话

当前第一版不是做“大系统”，而是：

> 用最小页面、最小 Agent Runtime、最小事件流，真正接入 AG-UI，先把 Agent ↔ UI 的通信能力跑通。
