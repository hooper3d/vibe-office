import { promises as fs } from "fs";
import path from "path";
import { EventType, type AGUIEvent } from "@ag-ui/core";
import { readPlanWorkflow } from "@/lib/plan-workflow-store";

const WORKSPACE_ROOT = process.cwd();
const OPS_DIR = path.join(WORKSPACE_ROOT, "ops");
const RUN_HISTORY_FILE = path.join(OPS_DIR, "RUN_HISTORY.jsonl");
const EVENT_STREAM_FILE = path.join(OPS_DIR, "EVENT_STREAM.jsonl");
const LAST_RESULT_FILE = path.join(OPS_DIR, "LAST_RESULT.json");
const PLAN_WORKFLOW_FILE = path.join(OPS_DIR, "PLAN_WORKFLOW.json");
const LEGACY_LUCY_PLAN_FILE = path.join(OPS_DIR, "LUCY_PLAN.json");
const MAX_EVENTS = 160;
const MAX_RUNS = 40;
const STALE_RUN_MS = Number(process.env.AG_UI_STALE_RUN_MS || 150_000);

export type PersistedEvent = AGUIEvent & {
  receivedAt: string;
};

export type RunRecord = {
  runId: string;
  threadId?: string;
  action?: string;
  targetAgent?: string;
  message?: string;
  status: "running" | "success" | "failed" | "needs_attention";
  startedAt?: string;
  finishedAt?: string;
};

type RunStartedEvent = AGUIEvent & {
  type: typeof EventType.RUN_STARTED;
  input?: Record<string, unknown> & {
    state?: {
      intent?: {
        action?: string;
        targetAgent?: string;
        taskId?: string;
      };
    };
  };
};

export type LastResult = {
  command?: string;
  outputText?: string;
  outputFile?: string;
  status?: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

async function ensureOpsDir() {
  await fs.mkdir(OPS_DIR, { recursive: true });
}

async function appendJsonLine(filePath: string, value: unknown) {
  await ensureOpsDir();
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonLines<T>(filePath: string, limit: number): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const records: T[] = [];
    const lines = content
      .split("\n")
      .filter(Boolean)
      .slice(-limit);

    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as T);
      } catch {
        // History is append-only runtime state. Ignore corrupted lines so the UI can keep loading.
      }
    }
    return records;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

function displayTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(iso));
}

export async function appendEventRecord(event: AGUIEvent) {
  const iso = nowIso();
  await appendJsonLine(EVENT_STREAM_FILE, {
    ...event,
    receivedAt: displayTime(iso)
  });
}

export async function appendRunRecord(record: RunRecord) {
  await appendJsonLine(RUN_HISTORY_FILE, record);
}

export async function writeLastResult(result: Omit<LastResult, "updatedAt">) {
  await ensureOpsDir();
  await fs.writeFile(
    LAST_RESULT_FILE,
    JSON.stringify(
      {
        ...result,
        updatedAt: nowIso()
      },
      null,
      2
    ),
    "utf8"
  );
}

export async function readRecentHistory() {
  const [events, runs, lastResult, planWorkflow] = await Promise.all([
    readJsonLines<PersistedEvent>(EVENT_STREAM_FILE, MAX_EVENTS),
    readJsonLines<RunRecord>(RUN_HISTORY_FILE, MAX_RUNS),
    fs
      .readFile(LAST_RESULT_FILE, "utf8")
      .then((content) => JSON.parse(content) as LastResult)
      .catch((error) => {
        const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
        if (code === "ENOENT") return null;
        throw error;
      }),
    readPlanWorkflow()
  ]);
  const recoveryEvents = buildStaleRunRecoveryEvents(events, runs);

  return {
    events: [...events, ...recoveryEvents],
    runs,
    lastResult,
    planWorkflow
  };
}

function isRunStartedEvent(event: PersistedEvent): event is PersistedEvent & RunStartedEvent {
  return event.type === EventType.RUN_STARTED;
}

function buildStaleRunRecoveryEvents(events: PersistedEvent[], runs: RunRecord[]): PersistedEvent[] {
  const latestByRun = new Map<string, RunRecord>();

  for (const run of runs) {
    latestByRun.set(run.runId, run);
  }

  return Array.from(latestByRun.values()).flatMap((run) => {
    if (run.status !== "running" || !run.startedAt) return [];
    if (Date.now() - new Date(run.startedAt).getTime() < STALE_RUN_MS) return [];

    const hasFinalEvent = events.some(
      (event) =>
        "runId" in event &&
        event.runId === run.runId &&
        (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR)
    );
    if (hasFinalEvent) return [];

    const startedEvent = events.find((event) => isRunStartedEvent(event) && event.runId === run.runId) as
      | (PersistedEvent & RunStartedEvent)
      | undefined;
    const intent = startedEvent?.input?.state?.intent;
    const action = intent?.action || run.action;
    const targetAgent = intent?.targetAgent || run.targetAgent || "Ray";
    const taskId = intent?.taskId || "task-001";
    const linkedAgents =
      action === "submit_requirement_to_planning_agent" || action === "dispatch_to_ray" ? ["Lucy", "Ray"] : [targetAgent];
    const receivedAt = displayTime(nowIso());

    return [
      {
        type: EventType.RUN_ERROR,
        message: "The local run stream timed out or disconnected. Status was restored to needs-attention.",
        runId: run.runId,
        receivedAt,
        timestamp: Date.now()
      },
      {
        type: EventType.STATE_DELTA,
        delta: [
          ...linkedAgents.map((agent) => ({ op: "replace", path: `/agents/${agent}/status`, value: "blocked" })),
          { op: "replace", path: `/tasks/${taskId}/status`, value: "blocked" }
        ],
        receivedAt,
        timestamp: Date.now()
      }
    ] satisfies PersistedEvent[];
  });
}

export async function resetRunHistory() {
  await ensureOpsDir();

  await Promise.all(
    [EVENT_STREAM_FILE, RUN_HISTORY_FILE, LAST_RESULT_FILE, PLAN_WORKFLOW_FILE, LEGACY_LUCY_PLAN_FILE].map((filePath) =>
      fs.unlink(filePath).catch((error) => {
        const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
        if (code !== "ENOENT") throw error;
      })
    )
  );
}
