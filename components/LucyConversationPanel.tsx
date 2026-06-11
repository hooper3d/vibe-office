"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentName } from "@/types/agent";
import type { LucyPlan } from "@/types/task";

export type LucyConversationMessage = {
  id: string;
  role: "user" | "agent";
  agentName?: AgentName;
  content: string;
};

type LucyConversationPanelProps = {
  plan: LucyPlan | null;
  messages?: LucyConversationMessage[];
  running: boolean;
  activeAgent: AgentName;
  onGeneratePlan: () => void;
  onClose?: () => void;
  className?: string;
};

export function LucyConversationPanel({
  plan,
  messages = [],
  running,
  activeAgent,
  onGeneratePlan,
  onClose,
  className = ""
}: LucyConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [messages, running, plan]);

  const isClarifying = plan?.stage === "clarifying";
  const hasMessages = messages.length > 0;
  const activeInitial = activeAgent.slice(0, 1);
  const activeTone =
    activeAgent === "Lucy"
      ? "bg-violet-200 text-violet-700 shadow-[0_0_0_5px_rgba(167,139,250,0.16)]"
      : activeAgent === "Tiger"
        ? "bg-amber-100 text-amber-700 shadow-[0_0_0_5px_rgba(245,158,11,0.14)]"
        : activeAgent === "Musk"
          ? "bg-slate-200 text-slate-700 shadow-[0_0_0_5px_rgba(148,163,184,0.14)]"
          : "bg-blue-100 text-blue-700 shadow-[0_0_0_5px_rgba(96,165,250,0.14)]";

  return (
    <section className={`frost flex min-h-0 min-w-0 flex-col rounded-xl p-5 ${className}`}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-semibold ${activeTone}`}>
            {activeInitial}
          </div>
          <span className="truncate text-base font-semibold text-slate-100">{activeAgent}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
              title="收起对话"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {hasMessages
          ? messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-cyan-500/12 px-4 py-3 text-sm leading-6 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]"
                    : "w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-slate-800 bg-slate-950/22 px-4 py-3 text-sm leading-6 text-slate-200"
                }
              >
                {message.content.trim() ? message.content : <TypingDots />}
              </div>
            ))
          : null}

        {!hasMessages && plan?.requirement ? (
          <div className="ml-auto w-fit max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-cyan-500/12 px-4 py-3 text-sm leading-6 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]">
            {plan.requirement}
          </div>
        ) : null}

        {!hasMessages && plan ? (
          <div className="w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-slate-800 bg-slate-950/22 px-4 py-3">
            <p className="text-sm leading-6 text-slate-200">{plan.summary}</p>
            {plan.questions.length ? (
              <div className="mt-3 space-y-2">
                {plan.questions.map((question) => (
                  <p key={question} className="rounded-lg bg-violet-500/8 px-3 py-2 text-sm leading-6 text-slate-300">
                    {question}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!hasMessages && !plan ? (
          <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-slate-500">
            还没有和 {activeAgent} 的对话。
          </div>
        ) : null}
      </div>

      {plan ? (
        <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
          <p className="min-w-0 text-xs leading-5 text-slate-500">{plan.recommendation}</p>
          <button
            type="button"
            onClick={onGeneratePlan}
            disabled={running || !isClarifying}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-violet-500/14 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/22 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            生成计划
          </button>
        </div>
      ) : hasMessages ? (
        <div className="mt-4 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onGeneratePlan}
            disabled={running}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-violet-500/14 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/22 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            交给 Lucy 拆解
          </button>
        </div>
      ) : null}
    </section>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex h-5 items-center gap-1" aria-label="Agent 正在输入">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:240ms]" />
    </span>
  );
}
