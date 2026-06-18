import { ArrowUp, Paperclip, X } from "lucide-react";
import type { FormEvent } from "react";
import type { ConversationMessage, ProjectTask } from "../domain/projectScope";
import type { AgentInstance, Project } from "../domain/types";
import type { WorkspaceFileAttachment } from "../services/workspaceFileClient";
import { DirectChat, NoAgentState, NoProjectState, TaskRoom } from "./ConversationViews";

type ConversationMode = "single" | "task-room";
type ChatScope = "free" | "project";

export function ConversationWorkspace({
  activeComposerHasPendingRequest,
  agents,
  attachedWorkspaceFiles,
  chatScope,
  chiefAgent,
  conversationMode,
  currentConversationHasPendingRequest,
  currentMessages,
  isComposerSubmitting,
  latestChiefTask,
  messageText,
  selectedAgent,
  selectedTaskParticipantCount,
  selectedWorkspaceProject,
  taskParticipantIds,
  taskRoomHasPendingRequest,
  taskRoomMessages,
  onAddAgent,
  onDetachWorkspaceFile,
  onMessageTextChange,
  onRetryDirectMessage,
  onRetryTaskRoomMessage,
  onSelectFreeChat,
  onSubmitMessage,
  onToggleTaskParticipant,
}: {
  activeComposerHasPendingRequest: boolean;
  agents: AgentInstance[];
  attachedWorkspaceFiles: WorkspaceFileAttachment[];
  chatScope: ChatScope;
  chiefAgent?: AgentInstance;
  conversationMode: ConversationMode;
  currentConversationHasPendingRequest: boolean;
  currentMessages: ConversationMessage[];
  isComposerSubmitting: boolean;
  latestChiefTask?: ProjectTask;
  messageText: string;
  selectedAgent?: AgentInstance;
  selectedTaskParticipantCount: number;
  selectedWorkspaceProject?: Project;
  taskParticipantIds: string[];
  taskRoomHasPendingRequest: boolean;
  taskRoomMessages: ConversationMessage[];
  onAddAgent: () => void;
  onDetachWorkspaceFile: (path: string) => void;
  onMessageTextChange: (text: string) => void;
  onRetryDirectMessage: (messageId: string) => void;
  onRetryTaskRoomMessage: (messageId: string) => void;
  onSelectFreeChat: () => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleTaskParticipant: (agentId: string, checked: boolean) => void;
}) {
  return (
    <section className="conversation-panel" aria-label="Conversation">
      <div className="panel-header">
        <div>
          <h2>{conversationMode === "task-room" ? "Coordinate agents" : selectedAgent?.name ?? "No agent connected"}</h2>
        </div>
      </div>

      {conversationMode === "single" && selectedAgent ? (
        <DirectChat
          messages={currentMessages}
          scope={chatScope}
          isResponding={isComposerSubmitting || currentConversationHasPendingRequest}
          onRetryMessage={onRetryDirectMessage}
        />
      ) : conversationMode === "single" ? (
        <NoAgentState onAddAgent={onAddAgent} />
      ) : selectedWorkspaceProject ? (
        <TaskRoom
          agents={agents}
          chief={chiefAgent}
          messages={taskRoomMessages}
          participantIds={taskParticipantIds}
          projectTask={latestChiefTask}
          isResponding={isComposerSubmitting || taskRoomHasPendingRequest}
          onToggleParticipant={onToggleTaskParticipant}
          onRetryMessage={onRetryTaskRoomMessage}
        />
      ) : (
        <NoProjectState onSelectProject={onSelectFreeChat} />
      )}

      <form className="composer" onSubmit={onSubmitMessage}>
        <label className="sr-only" htmlFor="message">
          Message
        </label>
        {attachedWorkspaceFiles.length > 0 ? (
          <div className="attached-context-row" aria-label="Attached workspace context">
            {attachedWorkspaceFiles.map((file) => (
              <span className="attached-context-chip" key={file.path}>
                <Paperclip size={13} />
                <span>{file.path}</span>
                <button type="button" onClick={() => onDetachWorkspaceFile(file.path)} aria-label={`Remove ${file.path}`}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="composer-row">
          <textarea
            id="message"
            value={messageText}
            onChange={(event) => onMessageTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={getComposerPlaceholder({
              chatScope,
              chiefAgent,
              conversationMode,
              selectedAgent,
              selectedTaskParticipantCount,
              selectedWorkspaceProject,
            })}
            disabled={isComposerSubmitting || activeComposerHasPendingRequest}
          />
          <button
            className="primary-icon-button composer-send-button"
            type="submit"
            aria-label="Send message"
            disabled={
              isComposerSubmitting ||
              activeComposerHasPendingRequest ||
              (conversationMode === "single"
                ? !selectedAgent || (chatScope === "project" && !selectedWorkspaceProject)
                : !selectedWorkspaceProject || !chiefAgent || selectedTaskParticipantCount === 0) ||
              messageText.trim().length === 0
            }
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

function getComposerPlaceholder({
  chatScope,
  chiefAgent,
  conversationMode,
  selectedAgent,
  selectedTaskParticipantCount,
  selectedWorkspaceProject,
}: {
  chatScope: ChatScope;
  chiefAgent?: AgentInstance;
  conversationMode: ConversationMode;
  selectedAgent?: AgentInstance;
  selectedTaskParticipantCount: number;
  selectedWorkspaceProject?: Project;
}) {
  if (conversationMode === "single") {
    if (!selectedAgent) return "Add an agent provider first";
    if (chatScope === "free") return `Chat with ${selectedAgent.name}`;
    return selectedWorkspaceProject ? `Ask ${selectedAgent.name} in ${selectedWorkspaceProject.name}` : "Select a project first";
  }

  if (!selectedWorkspaceProject) return "Select a project first";
  if (!chiefAgent) return "Assign one connected agent as Chief first";
  if (selectedTaskParticipantCount === 0) return "Select at least one participant first";
  return `Start a Chief-led task in ${selectedWorkspaceProject.name}`;
}
