# Codex Runner Rules

## 默认模式

- Lucy：只读，用于验收、日报、风险分析。
- Tiger：只读，用于 Blog 草稿、发布摘要和网站发布内容。
- Ray：默认只读，除非显式开启写入环境变量。

## 写入开关

Ray 需要真实修改工作区时，启动服务前设置：

```bash
AG_UI_CODEX_WRITE_ACTIONS=1
```

Windows PowerShell 示例：

```powershell
$env:AG_UI_CODEX_WRITE_ACTIONS='1'
npm run dev -- --port 3000
```

## 运行约束

- 不启动长期服务。
- 不做破坏性 git 操作。
- 修改后必须说明改动和验证方式。
- 优先保持 MVP 简洁，不引入复杂编排系统。
- 未开启 `AG_UI_CODEX_WRITE_ACTIONS=1` 时，Ray 派发只写入 inbox 和生成指令，不启动开发 runner。
- 开启 `AG_UI_CODEX_WRITE_ACTIONS=1` 后，Lucy 派发给 Ray 的任务进入真实 workspace-write 执行链路。
- Lucy 发布需求可以标记 `P0 / P1 / P2`，但不改变 Lucy → Ray → Lucy 的主流程。
- Project Context Hub Markdown 写入是本 MVP 的核心能力，允许 runtime 直接写入 `ops/*.md` 共享记忆文件。
