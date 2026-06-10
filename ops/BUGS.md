# Bugs And Risks

## Open

- RISK-001: Ray workspace-write 不应默认开启，避免用户误点按钮后产生非预期代码修改。
- RISK-002: 当前没有持久化数据库，刷新页面后 UI 事件列表会清空。
- RISK-003: 运行 Codex exec 依赖本机 Codex CLI 和用户登录状态。
- RISK-004: 如果 BLOG_CONTEXT 不及时更新，Tiger 仍可能缺少发布素材。

## Fixed

- BUG-001: `/api/agent` 之前会等 Codex exec 完成后才返回响应，导致前端看起来没有流式事件。已改为立即打开 SSE，并异步推送事件。
