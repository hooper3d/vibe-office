import type { CSSProperties, FormEvent, PointerEvent } from "react";
import type { Conversation, ConversationMessage, ProjectArtifact, ProjectRun, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { WorkspaceFileAttachment, WorkspaceFileReadResult } from "../services/workspaceFileClient";
import { ConversationWorkspace } from "./ConversationWorkspace";
import { OutputPanel, type OutputMode } from "./OutputPanel";

export type { OutputMode };

type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";

export function MainWorkspace({
  activeComposerHasPendingRequest,
  agents,
  attachedWorkspaceFiles,
  browserUrl,
  busyActionId,
  chatScope,
  chiefAgent,
  conversationMode,
  currentConversation,
  currentConversationHasPendingRequest,
  currentMessages,
  freeChatAgent,
  freeChatHistories,
  isComposerSubmitting,
  latestChiefTask,
  messageText,
  outputMode,
  previewOwnerAgentId,
  previewUrl,
  project,
  runs,
  scopedArtifacts,
  selectedAgent,
  selectedTaskParticipantCount,
  splitPercent,
  taskParticipantIds,
  taskRoomHasPendingRequest,
  taskRoomMessages,
  tasks,
  onAddAgent,
  onAttachFile,
  onBrowserUrlChange,
  onCancelTask,
  onCreateProject,
  onDetachWorkspaceFile,
  onEditProject,
  onMessageTextChange,
  onNewFreeChat,
  onOpenPreview,
  onOutputModeChange,
  onRefreshTask,
  onRenameFreeChatConversation,
  onRetryDirectMessage,
  onRetryTask,
  onRetryTaskRoomMessage,
  onSelectFreeChat,
  onSelectFreeChatConversation,
  onDeleteFreeChatConversation,
  onSplitterKeyNudge,
  onSplitterPointerDown,
  onSubmitMessage,
  onToggleTaskParticipant,
}: {
  activeComposerHasPendingRequest: boolean;
  agents: AgentInstance[];
  attachedWorkspaceFiles: WorkspaceFileAttachment[];
  browserUrl: string;
  busyActionId: string;
  chatScope: ChatScope;
  chiefAgent?: AgentInstance;
  conversationMode: ConversationMode;
  currentConversation?: Conversation;
  currentConversationHasPendingRequest: boolean;
  currentMessages: ConversationMessage[];
  freeChatAgent?: AgentInstance;
  freeChatHistories: Array<{
    conversation: Conversation;
    messageCount: number;
    title: string;
  }>;
  isComposerSubmitting: boolean;
  latestChiefTask?: ProjectTask;
  messageText: string;
  outputMode: OutputMode;
  previewOwnerAgentId?: string;
  previewUrl: string;
  project?: Project;
  runs: ProjectRun[];
  scopedArtifacts: ProjectArtifact[];
  selectedAgent?: AgentInstance;
  selectedTaskParticipantCount: number;
  splitPercent: number;
  taskParticipantIds: string[];
  taskRoomHasPendingRequest: boolean;
  taskRoomMessages: ConversationMessage[];
  tasks: ProjectTask[];
  onAddAgent: () => void;
  onAttachFile: (file: WorkspaceFileReadResult) => void;
  onBrowserUrlChange: (value: string) => void;
  onCancelTask: (taskId: string) => void;
  onCreateProject: () => void;
  onDetachWorkspaceFile: (path: string) => void;
  onEditProject: (projectId: string) => void;
  onMessageTextChange: (text: string) => void;
  onNewFreeChat: () => void;
  onOpenPreview: (event: FormEvent<HTMLFormElement>) => void;
  onOutputModeChange: (mode: OutputMode) => void;
  onRefreshTask: (taskId: string) => void;
  onRenameFreeChatConversation: (conversationId: string, title: string) => void;
  onRetryDirectMessage: (messageId: string) => void;
  onRetryTask: (taskId: string) => void;
  onRetryTaskRoomMessage: (messageId: string) => void;
  onSelectFreeChat: () => void;
  onSelectFreeChatConversation: (conversationId: string) => void;
  onDeleteFreeChatConversation: (conversationId: string) => void;
  onSplitterKeyNudge: (direction: "left" | "right") => void;
  onSplitterPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleTaskParticipant: (agentId: string, checked: boolean) => void;
}) {
  return (
    <main className="workspace">
      <div
        className="main-split"
        style={{
          "--conversation-fr": `${splitPercent}fr`,
          "--output-fr": `${100 - splitPercent}fr`,
        } as CSSProperties}
      >
        <ConversationWorkspace
          activeComposerHasPendingRequest={activeComposerHasPendingRequest}
          agents={agents}
          attachedWorkspaceFiles={attachedWorkspaceFiles}
          chatScope={chatScope}
          chiefAgent={chiefAgent}
          conversationMode={conversationMode}
          currentConversationHasPendingRequest={currentConversationHasPendingRequest}
          currentMessages={currentMessages}
          isComposerSubmitting={isComposerSubmitting}
          latestChiefTask={latestChiefTask}
          messageText={messageText}
          selectedAgent={selectedAgent}
          selectedTaskParticipantCount={selectedTaskParticipantCount}
          selectedWorkspaceProject={project}
          taskParticipantIds={taskParticipantIds}
          taskRoomHasPendingRequest={taskRoomHasPendingRequest}
          taskRoomMessages={taskRoomMessages}
          onAddAgent={onAddAgent}
          onDetachWorkspaceFile={onDetachWorkspaceFile}
          onMessageTextChange={onMessageTextChange}
          onRetryDirectMessage={onRetryDirectMessage}
          onRetryTaskRoomMessage={onRetryTaskRoomMessage}
          onSelectFreeChat={onSelectFreeChat}
          onSubmitMessage={onSubmitMessage}
          onToggleTaskParticipant={onToggleTaskParticipant}
        />

        <div
          className="splitter"
          role="separator"
          aria-label="Resize conversation and output panels"
          aria-orientation="vertical"
          aria-valuemin={35}
          aria-valuemax={70}
          aria-valuenow={Math.round(splitPercent)}
          tabIndex={0}
          onPointerDown={onSplitterPointerDown}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onSplitterKeyNudge("left");
            if (event.key === "ArrowRight") onSplitterKeyNudge("right");
          }}
        >
          <span />
        </div>

        <OutputPanel
          agents={agents}
          artifacts={scopedArtifacts}
          attachedWorkspaceFiles={attachedWorkspaceFiles}
          browserUrl={browserUrl}
          busyActionId={busyActionId}
          chatScope={chatScope}
          freeChatActiveConversationId={currentConversation?.id}
          freeChatAgent={freeChatAgent}
          freeChatHistories={freeChatHistories}
          outputMode={outputMode}
          previewOwnerAgentId={previewOwnerAgentId}
          previewUrl={previewUrl}
          project={project}
          runs={runs}
          tasks={tasks}
          onAttachFile={onAttachFile}
          onBrowserUrlChange={onBrowserUrlChange}
          onCancelTask={onCancelTask}
          onCreateProject={onCreateProject}
          onDetachFile={onDetachWorkspaceFile}
          onEditProject={onEditProject}
          onNewFreeChat={onNewFreeChat}
          onOpenPreview={onOpenPreview}
          onOutputModeChange={onOutputModeChange}
          onRefreshTask={onRefreshTask}
          onRenameFreeChatConversation={onRenameFreeChatConversation}
          onRetryTask={onRetryTask}
          onSelectFreeChatConversation={onSelectFreeChatConversation}
          onDeleteFreeChatConversation={onDeleteFreeChatConversation}
        />
      </div>
    </main>
  );
}
