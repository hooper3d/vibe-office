# Agent Desk Objects · v1 语义设计

Agent：Lucy
动作：design_agent_desk_objects
任务：agent-office-canvas-task-004 · 设计每个 Agent 的办公桌物件
日期：2026-06-11

---

## 一、设计目标

在 Agent 画布上，每个 Agent 节点周围放置极简办公物件入口——产出箱、桌面/草稿、垃圾桶。第一版只定义语义、归属和交互入口，不实现文件管理 UI，不改变 artifact registry。

核心原则：

- 物件是 Agent 的「桌面隐喻」，不是新功能模块
- 每个物件 = 一个语义入口 + 一个轻量状态指示
- 底层数据仍走现有 artifact registry，物件只是按 owner 过滤的视图
- v1 点击后只打开 mini 浮层（物品种类 + 数量），不做完整列表

---

## 二、三个物件类型

### 2.1 产出箱 (Output Box) 🗃️

语义：该 Agent 已完成并登记的产物出口。

数据来源：`/api/artifacts?owner=<Agent>` 按 owner 过滤。

v1 表现：
- 小方盒图标，右下角显示产物数量 badge
- 有产物时 badge 为蓝色实心；空时 badge 为灰色空心
- 点击 → 弹出 mini 浮层，列出产物标题（最多 3 条，其余折叠为 "+N more"）
- 每条产物可点击跳转到已登记的 artifact card（复用现有对话框 artifact card 渲染）
- 空状态显示：「还没有产出物」

### 2.2 桌面/草稿 (Desk/Draft) 📋

语义：该 Agent 当前正在处理的未完成事项——任务、草稿、进行中的工作。

数据来源：
- Lucy：`LUCY_PLAN.json` 中 owner=<Agent> 且 planStatus = "selected" 或 "in_progress" 的任务
- Ray/Tiger/Musk：任务列表中 owner=<Agent> 且 status = "in_progress" / "reviewing" 的任务

v1 表现：
- 剪贴板图标，右下角显示进行中数量 badge
- 有进行中事项时 badge 为琥珀色；空时为灰色空心
- 点击 → 弹出 mini 浮层，列出进行中任务标题（最多 3 条）
- 每条可点击跳转到任务卡片详情
- 空状态显示：「桌面清爽，无事进行」

### 2.3 垃圾桶 (Trash/Archive) 🗑️

语义：已废弃、已归档、已否决的产物和任务入口。v1 作为「归档」语义，不是真删除。

数据来源：未来 `archived: true` 标记的 artifact + 任务列表中 status = "cancelled" / "discarded" 的任务。v1 为空状态占位。

v1 表现：
- 小垃圾桶图标，右下角显示归档数量 badge
- 有归档内容时 badge 为灰色；空时为灰色空心
- 点击 → 弹出 mini 浮层，列出已归档物标题
- 空状态显示：「垃圾桶空空」
- **v1 不做真删除**，只是语义入口

---

## 三、每个 Agent 的办公桌定义

### 3.1 Lucy · 项目经理 Agent

| 物件 | v1 语义 | 当前内容 |
|------|---------|----------|
| 产出箱 | 计划方案、验收报告、设计决策 | 1 件：Canvas v1 交互边界 (markdown) |
| 桌面/草稿 | 正在拆解的任务、待验收 Handoff | 2 件：#004 办公桌设计、#006 Canvas v1 验收 |
| 垃圾桶 | 废弃计划版本、已否决方案 | 空 |

Lucy 的产出箱产生节奏较慢——每个设计决策产出一个 markdown artifact。桌面常驻 1-3 个任务（拆解中 + 待验收）。垃圾桶通常为空（设计决策很少「作废」，更多是迭代覆盖）。

### 3.2 Ray · 全栈工程师 Agent

| 物件 | v1 语义 | 当前内容 |
|------|---------|----------|
| 产出箱 | 代码实现、DEV_LOG 记录、修复补丁 | v1 空（虽然 DEV_LOG 有大量记录，但 artifact registry 中 Ray 为 0） |
| 桌面/草稿 | 正在编辑的组件、当前开发任务 | 1 件：#003 详情卡画布坐标系 (reviewing) |
| 垃圾桶 | 回滚代码、废弃实现方案 | 空 |

Ray 的产出箱值得注意：DEV_LOG 中记录了大量已完成工作，但 artifact registry 目前没有 Ray 的产物——因为之前的开发记录都是文本写入 Project Context Hub，不是结构化 artifact。task-005 接入后，Ray 完成一次代码交付时可选写入 artifact。

桌面常驻 1 个开发任务。垃圾桶 v1 为空（还没有需要回滚的）。

### 3.3 Tiger · 运维工程师 Agent

| 物件 | v1 语义 | 当前内容 |
|------|---------|----------|
| 产出箱 | 生成图片、Blog 草稿、发布内容、部署产物 | 1 件：Vibe Office App Icon (image) |
| 桌面/草稿 | 正在准备的内容、部署草稿 | v1 空（Tiger 在 DEV_LOG 中没有 in_progress 任务） |
| 垃圾桶 | 废弃图片版本、旧发布草稿 | 空 |

Tiger 是目前唯一有真实图片产物的 Agent，产出箱里已经有一张 1254×1254 的 App Icon。这是 task-005 验收的核心场景——点击 Tiger 产出箱能直接看到这张图。

### 3.4 Musk · 运维工程师 Agent（离线占位）

| 物件 | v1 语义 | 当前内容 |
|------|---------|----------|
| 产出箱 | 部署记录、服务器配置、健康检查报告 | v1 空（部署记录在 DEV_LOG/HANDOFF，未登记为 artifact） |
| 桌面/草稿 | Dockerfile/nginx 配置草稿 | 空 |
| 垃圾桶 | 旧配置备份 | 空 |

Musk 目前离线，所有物件为空。未来 Musk 上线后，部署 URL（http://43.162.107.236/）可登记为 URL artifact 进入产出箱。

---

## 四、视觉布局规则

### 4.1 物件相对于 Agent 节点的位置

物件放在 Agent 节点周围，形成一个「迷你桌面」布局：

```
         [产出箱]              ← 节点右上方，偏移 (+38px, -28px)
         
[垃圾桶]  (Agent Node)  [桌面/草稿]   ← 垃圾桶在左下 (-38px, +28px)
                                       桌面/草稿在右下 (+38px, +28px)
```

三个物件围绕 Agent 节点，形成三角形分布。

### 4.2 物件尺寸

- 物件图标：24×24px，opacity 0.7→0.9 on hover
- Badge 数字：12px 圆角徽章，贴图标右下角
- 间距：物件与节点边缘保持 8-12px 间隙

### 4.3 物件层级

- 物件属于画布 world 层 → 随 pan/zoom 移动缩放
- 物件 z 序：在 Agent 节点之下、连线之上
- 物件在默认缩放(1x)下可见；缩小到 0.5x 以下时可选择隐藏（避免杂乱）
- 放大到 2x 以上时物件清晰可点

### 4.4 Mini 浮层

点击物件后弹出 mini 浮层：
- 固定 200px 宽，最大 3 条 + "+N more" 折叠
- 浮层定位在物件附近，不超出 viewport
- 点击画布空白或 Esc 关闭
- 浮层不在画布 world 层内——它在 viewport overlay 层，不随缩放移动

---

## 五、数据模型（建议）

```typescript
// 不改变现有 artifact registry，只做语义映射

interface AgentDeskObject {
  type: "output_box" | "desk_draft" | "trash";
  owner: "Lucy" | "Ray" | "Tiger" | "Musk";
  
  // 计数：从 artifact registry / 任务列表实时计算
  count: number;
  hasContent: boolean;  // true → badge 实心，false → 空心
  
  // 预览项（前 3 条）
  previewItems: Array<{
    id: string;
    title: string;
    type: "artifact" | "task";
    link?: string;  // artifact accessUrl 或任务锚点
  }>;
}
```

数据计算规则（v1 前端实时计算，不存后端）：

- 产出箱 count = `/api/artifacts` 中 `owner === agentName` 的条目数
- 桌面 count = 任务列表中 `owner === agentName && (status === 'in_progress' || planStatus === 'selected')` 的条目数
- 垃圾桶 count = artifact 中 `archived === true && owner === agentName` + 任务中 `status === 'cancelled'` 的条目数

---

## 六、与 artifact registry 的关系

硬约束：

- ✅ 不改变 `ops/ARTIFACT_REGISTRY.json` 存放位置
- ✅ 不改变 `/api/artifacts` 接口签名
- ✅ 不改变 Artifact 数据模型的字段
- ✅ 办公桌物件是纯前端语义层，底层数据源不变

数据流：

```
Agent 返回 artifact → /api/artifacts 登记 → ARTIFACT_REGISTRY.json
                                                    ↓
                        办公桌产出箱 badge count 实时计算（按 owner 过滤）
                        详情卡 / 对话框 artifact card 渲染不受影响
```

---

## 七、v1 明确不做

- 不做办公桌持久化布局（物件位置由 Agent 节点位置计算，不独立存储）
- 不做物件拖拽重排
- 不做到垃圾桶里「恢复」或「真删除」操作
- 不做从桌面拖拽文件到产出箱的动画
- 不做物件自定义（用户不能新增/删除/重命名物件类型）
- 不做跨 Agent 物件共享或传递
- 不做「清空垃圾桶」按钮
- 桌面/草稿不做文件上传（那是输入框的功能）

---

## 八、验收标准映射

| 验收项 | 状态 |
|--------|------|
| 每个 Agent 有清晰的办公物件定义 | ✅ 完成：四 Agent 三物件全定义 |
| 产出箱按 artifact owner 分组 | ✅ 完成：按 owner 过滤 `/api/artifacts` |
| 垃圾桶先作为 discarded/archived 入口语义 | ✅ 完成：垃圾桶 = archived + cancelled，不真删除 |
| 不改变当前 artifact registry 存放位置 | ✅ 确认：ARTIFACT_REGISTRY.json 不变 |

---

## 九、给 Ray 的交接说明（task-005 前置）

task-005 标题：「把 Agent 产出箱接入 Artifact registry」

- 按本文档第三节的数据计算规则实现前端 desk object 组件
- 新增 `AgentDeskCluster` 组件，放在 Agent 节点附近（canvas world 层）
- 产出箱 mini 浮层中，Tiger 应能显示 `Vibe Office App Icon`（id: artifact_mq95077z_byifnx）
- 桌面/草稿中，Lucy 应显示 #004 / #006，Ray 应显示 #003
- mini 浮层使用 viewport overlay 层，不随画布缩放移动
- 垃圾桶 v1 只做空状态占位
- 不碰 ARTIFACT_REGISTRY.json、不碰 `/api/artifacts` 接口
