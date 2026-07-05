import type { FormEvent } from "react";
import type { Conversation, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { WorkspaceFileAttachment, WorkspaceFileReadResult } from "../services/workspaceFileClient";
import { FreeChatHistoryPanel, ProjectSelectionPanel } from "./ConversationViews";
import { BrowserPreview, ProjectOutputs } from "./OutputWorkspace";
import { TabButton } from "./OutputTabs";
import { WorkspaceFiles } from "./WorkspaceFiles";

export type OutputMode = "workspace" | "browser" | "outputs";

type ChatScope = "free" | "project";

export function OutputPanel({
  agents,
  artifacts,
  attachedWorkspaceFiles,
  browserUrl,
  busyActionId,
  chatScope,
  freeChatActiveConversationId,
  freeChatAgent,
  freeChatHistories,
  outputMode,
  previewOwnerAgentId,
  previewUrl,
  project,
  runs,
  tasks,
  onAttachFile,
  onBrowserUrlChange,
  onCancelTask,
  onCreateProject,
  onDetachFile,
  onEditProject,
  onNewFreeChat,
  onOpenPreview,
  onOutputModeChange,
  onRefreshTask,
  onRenameFreeChatConversation,
  onRetryTask,
  onSelectFreeChatConversation,
  onDeleteFreeChatConversation,
}: {
  agents: AgentInstance[];
  artifacts: ProjectArtifact[];
  attachedWorkspaceFiles: WorkspaceFileAttachment[];
  browserUrl: string;
  busyActionId: string;
  chatScope: ChatScope;
  freeChatActiveConversationId?: string;
  freeChatAgent?: AgentInstance;
  freeChatHistories: Array<{
    conversation: Conversation;
    messageCount: number;
    title: string;
  }>;
  outputMode: OutputMode;
  previewOwnerAgentId?: string;
  previewUrl: string;
  project?: Project;
  runs: ProjectRun[];
  tasks: ProjectTask[];
  onAttachFile: (file: WorkspaceFileReadResult) => void;
  onBrowserUrlChange: (value: string) => void;
  onCancelTask: (taskId: string) => void;
  onCreateProject: () => void;
  onDetachFile: (path: string) => void;
  onEditProject: (projectId: string) => void;
  onNewFreeChat: () => void;
  onOpenPreview: (event: FormEvent<HTMLFormElement>) => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onRefreshTask: (taskId: string) => void;
  onRenameFreeChatConversation: (conversationId: string, title: string) => void;
  onRetryTask: (taskId: string) => void;
  onSelectFreeChatConversation: (conversationId: string) => void;
  onDeleteFreeChatConversation: (conversationId: string) => void;
}) {
  return (
    <aside className="output-panel" aria-label="Output Workspace">
      {chatScope === "free" ? (
        <FreeChatHistoryPanel
          agent={freeChatAgent}
          activeConversationId={freeChatActiveConversationId}
          histories={freeChatHistories}
          onNewChat={onNewFreeChat}
          onRenameConversation={onRenameFreeChatConversation}
          onSelectConversation={onSelectFreeChatConversation}
          onDeleteConversation={onDeleteFreeChatConversation}
        />
      ) : project ? (
        <>
          <div className="tabs" role="tablist" aria-label="Output modes">
            <TabButton active={outputMode === "workspace"} onClick={() => onOutputModeChange("workspace")}>
              Workspace
            </TabButton>
            <TabButton active={outputMode === "browser"} onClick={() => onOutputModeChange("browser")}>
              Browser
            </TabButton>
            <TabButton active={outputMode === "outputs"} onClick={() => onOutputModeChange("outputs")}>
              Outputs
            </TabButton>
          </div>

          {outputMode === "workspace" ? (
            <div className="workspace-mode">
              <WorkspaceFiles
                project={project}
                attachedFiles={attachedWorkspaceFiles}
                onAttachFile={onAttachFile}
                onDetachFile={onDetachFile}
                onEditProject={() => onEditProject(project.id)}
              />
            </div>
          ) : null}
          {outputMode === "browser" ? (
            <BrowserPreview
              browserUrl={browserUrl}
              previewUrl={previewUrl}
              onBrowserUrlChange={onBrowserUrlChange}
              onOpenPreview={onOpenPreview}
            />
          ) : null}
          {outputMode === "outputs" ? (
            <ProjectOutputs
              agents={agents}
              runs={runs}
              tasks={tasks}
              artifacts={artifacts}
              previewUrl={previewUrl}
              previewOwnerAgentId={previewOwnerAgentId}
              busyActionId={busyActionId}
              onCancelTask={onCancelTask}
              onRefreshTask={onRefreshTask}
              onRetryTask={onRetryTask}
              onShowBrowser={() => onOutputModeChange("browser")}
            />
          ) : null}
        </>
      ) : (
        <ProjectSelectionPanel onCreateProject={onCreateProject} />
      )}
    </aside>
  );
}
