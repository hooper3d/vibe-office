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


## Registered Artifacts 2026-06-12T01:48:16.563Z

### 0743dc13-95d1-44f1-8d53-e4477ac63c50.png
- id: artifact_mqa9p0s0_spjrjb
- type: image
- owner: User
- projectId: project-mq9kgf7d
- createdAt: 2026-06-12T01:48:16.560Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqa9p0rv-eegqcq-0743dc13-95d1-44f1-8d53-e4477ac63c50.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-12T01:50:25.071Z

### Pasted image
- id: artifact_mqa9rrxp_e8kjsy
- type: image
- owner: User
- projectId: project-mq9kgf7d
- createdAt: 2026-06-12T01:50:25.070Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqa9rrxl-x6wlve-Pasted-image.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-12T02:00:22.264Z

### Hooper 的博客 - 调整后
- id: artifact_mqaa4kqe_ocfiy6
- type: url
- owner: Tiger
- projectId: project-mq9kgf7d
- createdAt: 2026-06-12T02:00:22.262Z
- mimeType: text/html
- location: https://www.hooper.ink/blog/
- description: 博客列表页：摘要 2 行 + tag 上限 4，卡片高度约 200px，图左文右紧凑布局


## Registered Artifacts 2026-06-12T03:31:03.063Z

### 43.162.107.236
- id: artifact_mqadd6vp_3fzu8p
- type: url
- owner: Musk
- projectId: demo-project
- createdAt: 2026-06-12T03:31:03.061Z
- location: http://43.162.107.236/


## Registered Artifacts 2026-06-12T03:59:29.187Z


## Registered Artifacts 2026-06-12T04:25:11.704Z

### POSITIONING.md
- id: artifact_mqafatjq_tf1xg0
- type: markdown
- owner: Musk
- projectId: demo-project
- createdAt: 2026-06-12T04:25:11.702Z
- mimeType: text/markdown
- location: ops/POSITIONING.md
- description: Vibe Office product positioning saved from Musk inline response.


## Registered Artifacts 2026-06-13T19:21:52.726Z

### 屏幕截图 2026-06-13 094200.png
- id: artifact_mqcqrtcl_1kgci8
- type: image
- owner: User
- projectId: office-provisioning-empty
- createdAt: 2026-06-13T19:21:52.725Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqcqrtch-iqqao4-2026-06-13-094200.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-13T19:21:57.575Z

### 屏幕截图 2026-06-13 094200.png
- id: artifact_mqcqrx3a_4h261z
- type: image
- owner: User
- projectId: office-provisioning-empty
- createdAt: 2026-06-13T19:21:57.574Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqcqrx37-hlw45m-2026-06-13-094200.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-13T19:22:03.112Z

### 屏幕截图 2026-06-13 094200.png
- id: artifact_mqcqs1d3_2ndi7p
- type: image
- owner: User
- projectId: office-provisioning-empty
- createdAt: 2026-06-13T19:22:03.111Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqcqs1d1-24zqtt-2026-06-13-094200.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-14T04:18:40.899Z

### Pasted image
- id: artifact_mqd9y5c2_8ra2bg
- type: image
- owner: User
- projectId: office-provisioning-empty
- createdAt: 2026-06-14T04:18:40.898Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqd9y5c0-iuoqru-Pasted-image.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-14T04:26:28.030Z

### Pasted image
- id: artifact_mqda85rx_4rfbzz
- type: image
- owner: User
- projectId: office-provisioning-empty
- createdAt: 2026-06-14T04:26:28.029Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqda85rv-q2pvfj-Pasted-image.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-14T13:02:37.259Z

## Registered Artifacts 2026-06-14T13:03:20.490Z


## Registered Artifacts 2026-06-14T13:10:41.332Z


## Registered Artifacts 2026-06-15T03:45:00.034Z

### Pasted image
- id: artifact_mqeo6oox_op75hj
- type: image
- owner: User
- projectId: office-default-project
- createdAt: 2026-06-15T03:45:00.033Z
- mimeType: image/png
- location: ops/ARTIFACT_UPLOADS/mqeo6oon-7h6i6a-Pasted-image.png
- description: Image pasted into the Vibe Office composer.


## Registered Artifacts 2026-06-15T04:46:54.393Z

### PROJECT_BRIEF.md
- id: artifact_mqeqeapa_fynq00
- type: markdown
- owner: Writer
- projectId: office-default-project
- createdAt: 2026-06-15T04:46:54.382Z
- mimeType: text/markdown
- location: ops/ARTIFACT_UPLOADS/mqeqeaov-PROJECT_BRIEF.md
- description: Fallback capture from an agent file-delivery message.
