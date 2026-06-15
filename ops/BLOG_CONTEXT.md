# Blog Context

博客主题：AI Agent Console 如何用 Project Context Hub 减少重复沟通

项目背景：
- 当前示例项目是 AG-UI 推广网页开发。
- 控制台负责统一入口和 AG-UI 事件通信。
- Project Context Hub 负责沉淀共享上下文。

开发过程摘要：
时间：2026-06-12T03:51:10.479Z
Agent：Ray
动作：dispatch_to_ray
任务：定义 Agent Office Canvas v1 交互边界
补充说明：无

可写入 Blog 的亮点：
- 用户只需要提出目标和关键决策。
- Ray 开发过程写入 DEV_LOG / HANDOFF。
- Lucy 读取共享上下文做统筹验收。
- Tiger 读取 BLOG_CONTEXT / RELEASE_NOTES 生成发布内容，不需要用户复述开发过程。

建议结构：
1. 为什么多 Agent 协作容易丢上下文。
2. Project Context Hub 如何作为共享记忆。
3. Ray / Lucy / Tiger 如何分工。
4. 下一步如何扩展到真实项目。
