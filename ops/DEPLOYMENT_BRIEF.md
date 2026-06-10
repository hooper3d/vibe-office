# Deployment Brief — Vibe Office (AG-UI 推广网页)

写给 Musk，用于在硅谷服务器完成部署。

---

## 1. 项目概述

- 项目名：Vibe Office（原 AI Agent Console）
- 用途：单页推广网页，展示 AG-UI 事件通信 + Project Context Hub 共享上下文
- 访问者：产品和开发同学

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14.2.23（App Router） |
| UI | React 18.3 + Tailwind CSS 3.4 |
| 语言 | TypeScript 5.8 |
| 图标 | lucide-react 0.468 |
| 协议 | @ag-ui/core 0.0.56 |
| 运行时 | Node.js（>= 18） |

## 3. 环境要求

- Node.js >= 18.x
- npm >= 9.x
- 端口 3000（或自定义，见下方）

## 4. 环境变量

在项目根目录创建 `.env.local`。必需变量：

```bash
# ── Musk 自己的 Hermes API（硅谷本地）──
MUSK_HERMES_API_BASE_URL=http://127.0.0.1:18642/v1
MUSK_HERMES_API_SERVER_KEY=<你的 Hermes server key>
# MUSK_HERMES_MODEL=           # 可选，覆盖默认 model

# ── Tiger 的 Hermes API（远程）──
TIGER_HERMES_API_BASE_URL=http://<tiger-ip>:18643/v1
TIGER_HERMES_API_SERVER_KEY=<tiger 的 server key>
# TIGER_HERMES_MODEL=          # 可选，覆盖默认 model

# ── Lucy 的 Hermes API ──
# Lucy client 优先读 process.env，如果未设则回落读 ~/.hermes/.env 里的 API_SERVER_KEY
HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_SERVER_KEY=<lucy 的 server key>
# HERMES_LUCY_MODEL=           # 可选，覆盖 Lucy 默认 model
```

**Musk 的 Lucy 连接说明**：
- 如果你的 Hermes 就是 Lucy 本体（本地 8642 端口），保持 `HERMES_API_BASE_URL=http://127.0.0.1:8642/v1`，并把你的 `~/.hermes/.env` 放到部署用户的 home 目录（Lucy client 会回落读取）。
- 如果 Lucy 跑在另一台机器，把 `HERMES_API_BASE_URL` 改为可通达的地址。

**Tiger 连接说明**：
- 如果 Tiger 的 Hermes 不在同一网络，确保 `<tiger-ip>` 是可通达的公网或 VPN 地址。

没有其他外部 API 依赖（无数据库、无第三方服务）。

## 5. 构建 & 启动

```bash
# 1. 进入项目目录
cd /path/to/AG_UI

# 2. 安装依赖
npm install

# 3. 生产构建
npm run build

# 4. 启动生产服务（默认端口 3000）
npm run start
```

要指定端口：
```bash
PORT=8080 npm run start
```

## 6. 预期行为

启动后访问 `http://<server-ip>:3000/`，应看到：

1. **Header** — 顶部导航栏，左侧「Vibe Office」标题 + 「Alpha」小标签，右侧 AG-UI 连接状态指示器
2. **Hero 区** — 项目名称、一句话定位、副标题、主 CTA 按钮，深色风格，响应式
3. **Agent 列表卡片** — Lucy / Ray / Tiger / Musk 四个 Agent，Lucy 在上方，其余三个在下方，协作时有连线动画
4. **AG-UI Event Stream** — 实时事件流展示区，右上角有自动滚动开关
5. **Project Context Hub** — 左侧共享记忆面板，点击文件可预览 Markdown 内容
6. **Command Box** — 底部指令输入区

验证清单：
- [ ] 首页加载无报错（浏览器控制台无红色 error）
- [ ] Header 显示「Vibe Office Alpha」
- [ ] Agent 列表显示 4 个 Agent（Lucy / Ray / Tiger / Musk）
- [ ] Project Context Hub 可点击 PROJECT_BRIEF.md 查看内容
- [ ] 页面在移动端宽度下正常响应
- [ ] 深色主题一致，无明显样式错乱

## 7. 静态导出（可选）

如果 Musk 想用 Nginx 纯静态托管，可以改为静态导出：

```bash
# next.config.mjs 添加：
# const nextConfig = { output: 'export' };

npm run build
# 产物在 out/ 目录，直接用 Nginx serve
```

注意：静态导出后 API 路由不可用（/api/*），Hermes 通信功能会降级。对纯展示场景够用，如果需要完整交互，保持默认 server 模式。

## 8. 运维备注

- `npm run start` 是前台进程，建议用 pm2 / systemd / Docker 做进程守护
- 日志默认输出到 stdout/stderr
- 无状态服务，重启不丢数据（所有共享记忆在 ops/*.md 文件里，由 Git 管理）

---

Lucy 编写，2026-06-11。如有疑问通过 Hermes 找我。
