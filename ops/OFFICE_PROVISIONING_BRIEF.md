# Vibe Office · Office Provisioning 分支开发文档

日期：2026-06-12
负责人：Ray
目标分支：`codex/office-provisioning`

## 1. 产品定位

Vibe Office 不做又一个复杂 Agent Builder，而是做面向普通用户和小团队的开源 AI 办公室。

核心一句话：

> 用户只带一个模型服务商 API Key，或接入已有 Hermes 实例，Vibe Office 帮他创建一组可协作的 Hermes Agent 办公室成员。

差异化：

- MIT 开源。
- BYOK，本地/自托管友好。
- Hermes Profiles 原生集成。
- Project Context Hub 提供跨 profile 的项目共享记忆。
- Artifact Registry 让 Agent 交付图片、文档、链接和部署结果。

## 2. 两类用户路径

### 路径 A：只提供模型 Key 的普通用户

适合对象：没有 Hermes 实例、不理解 profile / gateway / API Server 的普通用户和小团队。

用户只需要：

1. 选择模型服务商。
2. 填入模型服务商 API Key。
3. 点击创建 AI 办公室。

平台后台负责：

1. 验证模型 API Key。
2. 判断是否已有 Hermes。
3. 如果没有 Hermes，通过平台能力无感安装或生成安装计划。
4. 创建 Hermes profiles：Coordinator / Builder / Publisher / Operator。
5. 写入各 Agent 的 `SOUL.md`、`.env`、`config.yaml`。
6. 启动或登记每个 profile 的 API Server / Gateway。
7. 将 Agent 成员登记到 Vibe Office。
8. 将 Chief Agent 接入常用即时通讯渠道。

### 路径 B：已有 Hermes 实例的进阶用户

适合对象：已经安装或托管 Hermes，希望 Vibe Office 帮他快速创建分身/岗位 Agent 的用户。

用户提供：

1. Hermes Base URL。
2. Hermes API Key。
3. 可选：已有 profile 名称。
4. 可选：profile 创建或部署授权。

平台后台负责：

1. 测试 Hermes API 连通性。
2. 如果只提供单个 Hermes API，则先登记为 Chief Agent 或默认 Agent。
3. 如果用户授权 profile 创建，则按模板创建 Coordinator / Builder / Publisher / Operator 等分身。
4. 为每个 profile 写入不同岗位的 `SOUL.md` 和上下文注入规则。
5. 绑定到 Vibe Office 办公室成员卡片。
6. 接入 Project Context Hub，让隔离 profiles 在项目层共享记忆。

重要边界：

> Hermes API Key 只等于“可以聊天”；Hermes profile 创建/部署权限才等于“可以帮你创建办公室成员”。

## 3. 权限分级

### 只连接，不改动

用户提供 Hermes Base URL + Hermes API Key。

平台可以：

- 连接已有 Hermes。
- 测试健康状态。
- 把它登记为一个 Agent。
- 通过 API 发消息。

平台不能：

- 创建 profile。
- 修改 `SOUL.md`。
- 写 `.env` / `config.yaml`。
- 启动 gateway。
- 安装或重启服务。

### 授权创建办公室成员

用户显式授权 Vibe Office 管理 Hermes 环境。

授权方式：

- 本地授权：允许执行 `hermes profile create`、写配置、启动 gateway。
- 远端授权：提供 SSH / 部署 token / 受限 runner。
- 容器授权：提供指定 compose 项目的管理权限。
- 手动授权：平台生成命令，用户自己复制执行。

平台可以：

- 创建 Hermes profiles。
- 写入角色说明。
- 配置模型 Key。
- 分配端口。
- 生成 `API_SERVER_KEY`。
- 启动 API Server / Gateway。
- 接入即时通讯渠道。

## 4. 模型、安装向导和 Chief Agent

模型 API Key 不是总指挥，它只是底层智能资源。

办公室创建前，Vibe Office 使用 Onboarding Assistant 引导用户：

- 选择 provider。
- 验证 API Key。
- 判断是否已有 Hermes。
- 选择办公室模板。
- 生成成员创建计划。

办公室创建完成后，Chief Agent 接管总指挥和总调度，defaults to the Coordinator。

```txt
用户需求
  -> Chief Agent / Lucy 拆解
  -> Builder / Publisher / Operator execute
  -> Lucy 验收
  -> Project Context Hub 沉淀
  -> Artifact Registry 归档产物
```

## 5. Hermes Profiles + Project Context Hub

Hermes Profiles 提供 Agent 级隔离：

```txt
Coordinator profile -> 独立配置 / SOUL.md / 记忆 / 技能 / 会话 / Gateway
Builder profile  -> 独立配置 / SOUL.md / 记忆 / 技能 / 会话 / Gateway
```

Vibe Office 在此之上增加项目级共享记忆：

```txt
Hermes Profile Memory = 每个 Agent 的私人记忆
Project Context Hub   = 当前项目的团队共享记忆
```

产品表达：

> Hermes 给每个 Agent 独立大脑，Vibe Office 给整个团队共享记忆。

共享记忆文件：

- `PROJECT_BRIEF.md`
- `PROGRESS_SUMMARY.md`
- `DEV_LOG.md`
- `DECISIONS.md`
- `HANDOFF.md`
- `RELEASE_NOTES.md`
- `BLOG_CONTEXT.md`
- `ARTIFACTS.md`

## 6. 即时通讯接入

第一版原则：

> 即时通讯渠道先接 Chief Agent，不直接暴露所有 Agent。

推荐路由：

```txt
飞书 / 企业微信 / Slack / Telegram / Email
        ↓
Chief Agent: Coordinator
        ↓
Coordinator routes the work
        ↓
Builder / Publisher / Operator execute
        ↓
Results return to the Coordinator
        ↓
发回原聊天渠道
```

第一批建议支持：

1. Telegram。
2. Slack。
3. 飞书或企业微信。
4. Email。

## 7. 分支范围

目标分支：`codex/office-provisioning`

第一阶段只做 dry-run onboarding，不真实安装 Hermes，不重构主工作台。

建议新增：

```txt
app/onboarding/page.tsx
components/onboarding/*
app/api/provision/*
lib/provider-config.ts
lib/hermes-provisioner.ts
lib/office-templates.ts
```

首页只允许增加轻入口，例如“创建办公室”。

## 8. MVP 阶段

### Phase 0：Dry Run

目标：不真实安装 Hermes，只生成创建计划，同时覆盖两类用户路径。

能力：

- 选择 Provider。
- 输入模型 API Key。
- 做轻量连通性测试。
- 选择办公室模板。
- 生成将创建的 Agent 列表。
- 生成 Hermes profile 命令预览。
- 测试已有 Hermes Base URL / API Key。
- 说明“接入单实例”和“创建 profiles 分身”的区别。

验收：

- 用户能看到 Coordinator / Builder / Publisher / Operator 将如何被创建。
- 平台不会写入用户 Hermes 目录。
- 平台不会启动真实进程。
- 已有 Hermes 用户能看到权限边界。

### Phase 1：本地 Profile 创建

目标：在本机或用户授权环境中创建 Hermes profiles。

验收：

- Coordinator / Builder / Publisher 至少三个 profile 可被 Vibe Office 调用。
- 每个 profile 身份和职责不同。
- profiles 之间记忆隔离。
- Project Context Hub 可作为共享记忆注入。

### Phase 2：Chief Agent + Messaging Gateway

目标：把 Chief Agent 接进客户常用即时通讯工具。

验收：

- 至少一个 Channel 能接入 Chief Agent。
- 用户能从聊天软件发送消息给 Coordinator。
- Coordinator 能回复，并在需要时把任务分发给 Builder / Publisher。

### Phase 3：共享记忆与产物闭环

目标：办公室成员协作时共享项目记忆和产物。

验收：

- Coordinator 能读取 Builder 的开发记录并验收。
- Publisher 能读取 Release Notes 生成发布内容。
- Builder 能读取 Coordinator 的决策文档继续开发。
- Publisher 图片产物可在产出箱中看到。

## 9. 推荐数据模型

```ts
type ProviderTemplate = {
  id: string;
  name: string;
  apiBaseUrl?: string;
  keyEnvName: string;
  defaultModel: string;
  compatibleWithOpenAI: boolean;
  setupHint: string;
};

type AgentTemplate = {
  id: "coordinator" | "builder" | "publisher" | "operator" | string;
  displayName: string;
  role: string;
  profileName: string;
  isChief?: boolean;
  soulTemplate: string;
  defaultTools: string[];
  contextFiles: string[];
};

type OfficeTemplate = {
  id: string;
  name: string;
  description: string;
  agents: AgentTemplate[];
};

type ProvisioningPlan = {
  providerId?: string;
  officeTemplateId: string;
  mode: "dry_run" | "local_install" | "connect_existing" | "create_profiles_from_existing";
  userPath: "model_key_only" | "existing_hermes";
  agents: Array<{
    profileName: string;
    displayName: string;
    role: string;
    apiBaseUrl?: string;
    port?: number;
    status: "planned" | "created" | "running" | "failed";
  }>;
  commands: string[];
  warnings: string[];
};
```

## 10. API 草案

```txt
POST /api/provision/provider/test
POST /api/provision/hermes/test
POST /api/provision/plan
POST /api/provision/apply
```

第一版 `apply` 必须受环境变量保护：

```txt
AG_UI_ENABLE_HERMES_PROVISIONING=1
```

## 11. 安全边界

- 模型 API Key 不进入前端 localStorage。
- Hermes API Server Key 由平台生成并保存。
- 所有 Key 在日志、Event Stream、DEV_LOG、错误信息里必须脱敏。
- 自动安装和 profile 创建必须有显式后端开关。
- 网页前端不能直接执行 shell 命令。
- 即时通讯凭证必须分渠道保存和脱敏展示。
- 不把本地绝对路径直接暴露给浏览器。

## 12. 合并策略

本分支要便于后期合入主线。

规则：

1. 新功能优先放在 `app/onboarding` 和 `app/api/provision`。
2. 不在第一阶段重构主工作台。
3. Provider、Agent、Office 模板放入独立 `lib/*`。
4. 真实执行能力放在 feature flag 后面。
5. Dry Run 先合，真实安装后合。
6. 即时通讯 Connector 分平台逐个合并。

## 13. 非目标

第一阶段不做：

- 云端多租户计费。
- 完整权限系统。
- 全平台即时通讯一次性接入。
- Agent 自主雇佣新 Agent。
- 复杂 Agent Builder。
- 可视化 Flow 编排器。
- 企业级审计控制台。


