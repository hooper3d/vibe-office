import type { AgentName } from "@/types/agent";
import type { TaskPriority } from "@/types/task";

export type WorkflowExecutionMode = "execute_now";

export type WorkflowTriage = {
  priority: TaskPriority;
  mode: WorkflowExecutionMode;
  owner: AgentName;
  reason: string;
};

const p0Patterns = /P0|p0|紧急|严重|阻塞|白屏|崩溃|打不开|无法打开|数据丢|安全|上线/;
const p1Patterns = /P1|p1|bug|异常|报错|失败|超时|需处理|修复|错误|遮挡|溢出|错位|不对|实现|删除|调整|修改|改成|改为|换成|加上|标题|文案|文字|标签|小标签|版本/;

export function triageRequirement(message?: string): WorkflowTriage {
  const text = (message || "").trim();
  const priority: TaskPriority = p0Patterns.test(text) ? "P0" : p1Patterns.test(text) ? "P1" : "P2";

  return {
    priority,
    mode: "execute_now",
    owner: "Ray",
    reason: "Lucy 已确认这是需要 Ray 执行的需求，进入开发与验收链路。"
  };
}

export function triageSummary(triage: WorkflowTriage) {
  const modeText: Record<WorkflowExecutionMode, string> = {
    execute_now: "立即执行"
  };

  return `${triage.priority} · ${modeText[triage.mode]} · ${triage.owner}：${triage.reason}`;
}
