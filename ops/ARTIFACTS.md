# Artifact Requirements

## 2026-06-11 · P0: Agent 产物出口

背景：
- Tiger 已能通过自己的 skill 生成图片类产物。
- 当前 Vibe Office 对话框只能接收和展示文本，无法直接展示图片。
- 如果 Agent 在远端环境生成文件，平台目前缺少文件回传、预览、下载和归档机制。

目标：
- 让 Vibe Office 能接住真实 Agent 的交付物，而不只接收文字回复。
- 让图片、Markdown、文件、下载 URL、部署 URL 都能作为结构化 artifact 展示。
- 让 artifact 可以进入 Project Context Hub，成为团队共享资产。

P0 范围：
- 图片 artifact：支持在对话气泡内直接预览。
- URL artifact：支持以卡片形式展示、复制、打开。
- 文件 artifact：支持标题、类型、大小、来源 Agent、下载/打开入口。
- Markdown artifact：支持预览和写入共享记忆。

建议数据结构：

```json
{
  "type": "image",
  "title": "Vibe Office Logo",
  "url": "https://example.com/artifacts/logo.png",
  "path": "/safe/artifacts/logo.png",
  "mimeType": "image/png",
  "owner": "Tiger",
  "projectId": "demo-project",
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

实现建议：
- 新增 `Artifact` 类型和后端 registry。
- 新增 `/api/artifacts` 用于登记、查询和安全访问产物。
- Hermes Agent 返回结构化 artifact 时，前端按 artifact card 渲染。
- 文本中出现图片 URL 时，先做自动识别作为过渡方案。
- 本地/远端绝对路径不能直接暴露给浏览器，必须经后端校验或复制到安全目录。

验收标准：
- Tiger 生成图片后，Vibe Office 对话框能显示图片预览。
- 用户能看到图片标题、来源 Agent、创建时间。
- 用户能下载或复制图片链接。
- 用户能把该产物写入 Project Context Hub。


## Registered Artifacts 2026-06-11T06:49:13.872Z

### Vibe Office App Icon
- id: artifact_mq95077z_byifnx
- type: image
- owner: Tiger
- projectId: demo-project
- createdAt: 2026-06-11T06:49:13.871Z
- mimeType: image/png
- location: https://openpt.wuyinkeji.com/4ad44fee9da2471a9c295139d5c92733.png
- description: Square1:1 app icon, teal-to-sky gradient rounded square with three glowing dots representing the agent collaboration network. Background slate #0f172a with grid + aurora glow.


## Registered Artifacts 2026-06-11T09:11:20.264Z

### Agent Office Canvas v1 交互边界决策
- id: artifact_mq9a2y86_quamzb
- type: markdown
- owner: Lucy
- projectId: demo-project
- createdAt: 2026-06-11T09:11:20.263Z
- mimeType: text/markdown
- location: ops/DECISIONS.md
- description: Lucy 定义的 Canvas v1 完整交互边界：画布归属、非画布层级、交互模型、缩放范围、v1 排除项、给 Ray 的交接说明。已同步写入 DEV_LOG / PROGRESS_SUMMARY / LUCY_PLAN.json。


## Registered Artifacts 2026-06-11T10:26:47.121Z

### Agent 办公桌物件语义设计 v1
- id: artifact_mq9crz68_ikyak1
- type: markdown
- owner: Lucy
- projectId: demo-project
- createdAt: 2026-06-11T10:26:47.120Z
- mimeType: text/markdown
- location: ops/AGENT_DESK_DESIGN.md
- description: Lucy 定义的 Agent Desk Objects 完整语义：三物件模型（产出箱/桌面/垃圾桶）、四 Agent 内容映射、视觉布局规则、数据模型、v1 边界、给 Ray 的 task-005 交接说明。


## Registered Artifacts 2026-06-11T12:55:25.676Z

### `
- id: artifact_mq9i34rv_lx16le
- type: url
- owner: Tiger
- projectId: demo-project
- createdAt: 2026-06-11T12:55:25.675Z
- location: http://43.162.107.236/`


## Archived Artifact 2026-06-11T13:32:56.855Z

### `
- id: artifact_mq9i34rv_lx16le
- type: url
- owner: Tiger
- projectId: demo-project
- createdAt: 2026-06-11T12:55:25.675Z
- archivedAt: 2026-06-11T13:32:56.855Z
- location: http://43.162.107.236/`
