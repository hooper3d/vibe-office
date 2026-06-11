# Vibe_Office_MVP3_Agent_Access.md

# Vibe Office · MVP-3 Agent 接入产品化开发文档

## 1. 阶段定位

本文件用于记录 **第三阶段 / MVP-3：Agent 接入产品化** 的开发目标与设计方案。

当前 Vibe Office 已完成 MVP-1 的核心验证：

- 真实 Lucy / Tiger / Musk Hermes Agent 已接入
- 统一输入入口支持 `@Agent` 沟通
- Agent 对话已按房间隔离
- Project Context Hub 已被 Agent 读取并证明共享记忆有效
- Agent 状态机已初步拆分
- 项目频道切换已降低串台风险

MVP-1 证明：

> 真实本地 / 远端 Hermes Agent 可以通过统一 AG-UI 工作台和共享记忆完成协作。

MVP-2 的重点应放在：

> 固化 Agent 协作规则、共享记忆归因、任务状态、项目频道、产物出口等可靠性问题。

MVP-3 才进入：

> 普通用户 Agent 接入产品化。

---

## 2. MVP-3 核心问题

当前 Agent 接入主要依赖 Ray 操作。

现状是：

```txt
用户想接入一个 Agent
    ↓
告诉 Ray
    ↓
Ray 配置实例 / 地址 / token / 能力描述
    ↓
Ray 接入 Vibe Office
    ↓
用户才能使用
```

这属于：

```txt
开发者接入模式
```

MVP-3 要解决的问题是：

```txt
普通用户不需要 Ray 帮忙，也能自己完成 Agent 接入、测试、配置和使用。
```

---

## 3. MVP-3 核心目标

MVP-3 的目标是把 Agent 接入从“开发者操作”升级为“产品化流程”。

核心目标：

1. **Agent 接入向导**
   - 普通用户可通过可视化流程添加 Agent

2. **Agent Profile**
   - 系统为每个 Agent 生成标准能力档案

3. **能力边界配置**
   - 明确 Agent 能做什么、不能做什么、哪些操作需要确认

4. **连接测试**
   - 验证 Agent 是否可用，是否支持 AG-UI，是否能访问共享上下文

5. **手动 Agent 模式**
   - 支持暂时没有真实 Runtime 的 Agent，通过复制指令方式接入

6. **普通用户友好**
   - 避免让用户理解 endpoint、token、runtime、event stream 等技术细节

---

## 4. MVP-3 不解决什么

MVP-3 不负责：

- 完整 Agent Marketplace
- 远程 Agent 自动发现
- 复杂权限系统
- 企业级团队管理
- 自动部署 Agent
- Agent 收费系统
- 高级多 Agent 编排
- LangGraph 全自动流程

这些可以留到后续阶段。

MVP-3 只解决：

> 普通用户能把一个 Agent 加进来，并知道它能做什么。

---

## 5. Agent 接入向导

建议入口：

```txt
添加 Agent
接入新 Agent
连接 Agent
Agent 接入向导
```

接入流程建议分为 4 步。

---

## 6. Step 1：选择 Agent 类型

第一步不要让用户填技术参数，而是先让用户选择：

```txt
你想接入什么类型的 Agent？
```

推荐类型：

```txt
项目管理 Agent
开发 Agent
网站维护 Agent
内容发布 Agent
研究分析 Agent
客服 Agent
自定义 Agent
```

对应当前 Vibe Office 的 Agent：

```txt
Lucy  = 项目管理 / Leader Agent
Ray   = 开发 Agent
Tiger = 网站维护 / 信息发布 Agent
Musk  = 其他专业 Agent
```

---

## 7. Step 2：选择接入方式

用户选择 Agent 运行在哪里。

推荐四类：

```txt
1. 本地 Agent
2. 远程 Agent
3. API Agent
4. 手动 Agent
```

---

### 7.1 本地 Agent

适合用户自己电脑上运行的 Hermes、CLI、脚本服务。

用户填写：

```txt
Agent 名称
本地地址，例如 http://localhost:xxxx
连接密钥，可选
```

适合场景：

```txt
本地 Hermes Agent
本地开发 Agent
本地自动化脚本
```

---

### 7.2 远程 Agent

适合部署在服务器上的 Agent。

用户填写：

```txt
Agent 名称
Agent 服务地址
API Key / Token
```

适合场景：

```txt
部署在云服务器上的 Hermes Agent
团队共享 Agent
长期运行的远程 Agent
```

---

### 7.3 API Agent

适合第三方模型、第三方服务或自建 API。

用户填写：

```txt
Agent 名称
API 地址
认证方式
模型 / Agent ID
```

适合场景：

```txt
OpenAI Assistant
Claude
Dify
Coze
LangGraph 服务
自建 API Agent
```

---

### 7.4 手动 Agent

这是 MVP-3 很重要的低门槛模式。

很多普通用户一开始并没有真正可调用的 Agent Runtime，只是有多个聊天入口。

手动 Agent 模式允许：

```txt
Vibe Office 生成标准指令
用户复制给对应 Agent
用户再把结果粘贴回 Vibe Office
```

适合场景：

```txt
ChatGPT 会话
Claude 会话
Codex 网页会话
其他不能被直接 API 调用的 Agent
```

这个模式不完美，但非常适合早期用户。

---

## 8. Step 3：测试连接

用户填完信息后，不应直接保存。

必须提供：

```txt
测试连接
```

测试项：

```txt
Agent 是否可访问
是否支持 AG-UI
是否支持事件流
是否支持读取共享上下文
是否支持写入 Handoff
是否支持文件操作
是否支持自动执行
```

测试结果示例：

```txt
连接成功

AG-UI 事件流：支持
读取上下文：支持
写入 Handoff：支持
文件操作：不支持
自动执行：不支持
```

这样用户能理解：

```txt
这个 Agent 能做什么
这个 Agent 不能做什么
```

---

## 9. Step 4：配置能力边界

这是 MVP-3 的关键。

普通用户必须配置：

```txt
这个 Agent 能做什么？
不能做什么？
哪些操作需要人工确认？
```

---

### 9.1 Lucy 能力边界

```txt
名称：Lucy
角色：Leader / 项目统筹 Agent

允许：
- 拆解任务
- 分配任务
- 验收结果
- 整理共享上下文
- 生成日报
- 生成项目总结
- 判断任务状态

禁止：
- 直接改代码
- 直接发布网站
- 冒充其他 Agent 执行任务
- 伪造其他 Agent 的执行结果

需要确认：
- 改变项目方向
- 标记重大任务完成
- 分配高风险任务
```

---

### 9.2 Ray 能力边界

```txt
名称：Ray
角色：Developer Agent

允许：
- 读取项目上下文
- 修改代码
- 修复 Bug
- 写入 DEV_LOG
- 写入 HANDOFF
- 生成测试说明
- 更新 CHANGELOG

禁止：
- 删除生产数据
- 直接发布线上版本
- 修改未授权项目
- 擅自大范围重构
- 绕过 Lucy 验收

需要确认：
- 大范围重构
- 删除文件
- 修改数据库
- 上线部署
- 修改认证 / 权限 / 支付相关代码
```

---

### 9.3 Tiger 能力边界

```txt
名称：Tiger
角色：Website Maintainer / Publisher Agent

允许：
- 读取 BLOG_CONTEXT
- 生成 blog 草稿
- 更新网站内容
- 维护页面信息
- 发布项目动态
- 生成 SEO 标题和摘要

禁止：
- 删除网站核心页面
- 擅自发布敏感内容
- 修改网站底层代码
- 修改未授权域名或部署配置

需要确认：
- 正式发布文章
- 修改首页
- 删除内容
- 更换网站导航结构
```

---

## 10. Agent Profile

接入完成后，每个 Agent 都应生成一个标准档案。

可以叫：

```txt
Agent Profile
Agent Card
Agent 能力卡
```

示例结构：

```json
{
  "id": "agent_ray",
  "name": "Ray",
  "role": "Developer Agent",
  "level": "executor",
  "connectionType": "local",
  "endpoint": "http://localhost:xxxx",
  "protocol": "ag-ui",
  "status": "connected",
  "capabilities": [
    "read_context",
    "write_handoff",
    "code_development",
    "bug_fix"
  ],
  "permissions": {
    "canReadContext": true,
    "canWriteContext": true,
    "canModifyCode": true,
    "canPublish": false,
    "requiresApprovalForDangerousActions": true
  },
  "contextFiles": [
    "PROJECT_BRIEF.md",
    "TASKS.md",
    "DEV_LOG.md",
    "HANDOFF.md"
  ]
}
```

Vibe Office 应根据 Agent Profile 理解：

```txt
Ray 是开发者
Lucy 是统筹者
Tiger 是发布者
```

而不是每次依赖用户解释。

---

## 11. 普通用户最终体验

理想流程：

```txt
1. 用户创建一个项目
2. 系统提示：是否添加 Agent？
3. 用户点击：添加 Agent
4. 选择 Agent 类型
5. 填写 Agent 名称
6. 选择接入方式
7. 测试连接
8. 配置能力边界
9. 保存
10. Agent 出现在项目房间中
11. 用户可以 @Agent 使用
```

用户可以直接说：

```txt
@Lucy 帮我把这个想法拆成任务
```

Lucy 根据 Agent Profile 知道：

```txt
Ray 能开发
Tiger 能发布
哪些操作需要用户确认
```

然后 Lucy 可以回答：

```txt
我建议把这个任务分配给 Ray 开发。
开发完成后由我验收。
如果涉及网站内容更新，再交给 Tiger 发布。
```

---

## 12. UI 设计建议

### 12.1 添加 Agent 入口

位置建议：

```txt
Agent 列表右上角：添加 Agent
项目设置页：Agent 管理
首次创建项目后的引导卡片
```

---

### 12.2 接入向导 UI

推荐步骤条：

```txt
选择类型 → 接入方式 → 测试连接 → 能力边界 → 完成
```

不要一页塞满所有参数。

---

### 12.3 普通模式 / 高级模式

建议拆成：

```txt
普通模式
高级模式
```

普通模式显示：

```txt
这个 Agent 叫什么？
它负责什么？
它在哪里运行？
它能做什么？
```

高级模式显示：

```txt
Endpoint
Token
AG-UI event endpoint
Context read/write permissions
Runner command
Health check URL
```

---

## 13. 技术实现要点

### 13.1 数据模型

需要新增：

```txt
AgentProfile
AgentConnection
AgentCapability
AgentPermission
AgentContextAccess
```

---

### 13.2 连接测试

需要支持：

```txt
health check
AG-UI event test
context read test
handoff write test
permission test
```

---

### 13.3 手动 Agent

手动 Agent 需要：

```txt
生成标准指令
复制指令
结果粘贴回 Vibe Office
将结果归档到对应 Agent 房间
必要时更新 Project Context Hub
```

---

### 13.4 能力边界

平台内部应明确区分：

```txt
canRead
canWrite
canExecute
canPublish
needsApproval
```

---

## 14. MVP-3 成功标准

MVP-3 完成后，应满足：

- [ ] 普通用户可以点击「添加 Agent」
- [ ] 用户可以选择 Agent 类型
- [ ] 用户可以选择接入方式
- [ ] 用户可以完成连接测试
- [ ] 系统能生成 Agent Profile
- [ ] 用户可以配置能力边界
- [ ] Agent 加入后能出现在对应项目房间
- [ ] 平台能识别 Agent 角色和能力
- [ ] 手动 Agent 模式可用
- [ ] 不再必须依赖 Ray 手动接入 Agent
- [ ] Agent 接入后仍能使用 Project Context Hub
- [ ] Agent 之间仍保持房间隔离
- [ ] 普通用户无需理解复杂技术细节

---

## 15. 与前后阶段的关系

### MVP-1：核心验证

已经完成：

```txt
真实 Agent 接入
统一入口
AG-UI 工作台
房间隔离
Project Context Hub 有效
```

---

### MVP-2：协作可靠性

重点应该是：

```txt
项目频道规则
Agent 房间规则
任务状态规则
共享记忆归因
Agent 能力边界文档
产物出口规则
```

MVP-2 是为了让已跑通的系统更可靠。

---

### MVP-3：Agent 接入产品化

本文件对应阶段。

重点是：

```txt
普通用户自主添加 Agent
Agent Profile
能力边界配置
连接测试
手动 Agent 模式
```

---

### MVP-4：任务流产品化

后续重点：

```txt
Lucy 分配任务
Ray 执行
Lucy 验收
Tiger 发布
任务状态流转记录
任务流程可视化
```

---

### MVP-5：自动化接入与生态

后续重点：

```txt
远程 Agent 自动发现
Agent 模板
Agent Marketplace
一键接入
团队共享 Agent
```

---

## 16. 一句话总结

MVP-3 的核心目标是：

```txt
让普通用户可以像添加成员一样，把一个 Agent 加入项目。
```

从此 Vibe Office 不再依赖 Ray 手动接入 Agent，而是具备平台化接入能力。
