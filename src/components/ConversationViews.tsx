import { Check, FileText, Folder, MessageSquare, Pencil, Plus, RefreshCw, Trash2, UserRoundCog, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { A2APart } from "../domain/a2a";
import type { Conversation, ConversationFailureKind, ConversationMessage, ProjectTask } from "../domain/projectScope";
import type { AgentInstance } from "../domain/types";
import { sanitizeAgentErrorText } from "../services/agentErrorText";
import { AgentAvatar } from "./AgentPrimitives";

type ChatScope = "free" | "project";

export function DirectChat({
  messages,
  scope,
  isResponding,
  onRetryMessage,
}: {
  messages: ConversationMessage[];
  scope: ChatScope;
  isResponding: boolean;
  onRetryMessage: (messageId: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, isResponding]);

  return (
    <div className="conversation-body" ref={bodyRef}>
      {messages.length === 0 && !isResponding ? (
        <div className="empty-state compact-empty">
          <MessageSquare size={32} />
          <h3>No messages yet</h3>
          <p>{scope === "free" ? "Start a free chat with this agent. No project context is attached." : "Start a project-scoped chat with this connected agent."}</p>
        </div>
      ) : (
        <>
          <MessageRows messages={messages} onRetryMessage={onRetryMessage} />
          {isResponding ? <TypingIndicator /> : null}
        </>
      )}
    </div>
  );
}

export function FreeChatHistoryPanel({
  agent,
  activeConversationId,
  histories,
  onNewChat,
  onRenameConversation,
  onSelectConversation,
  onDeleteConversation,
}: {
  agent?: AgentInstance;
  activeConversationId?: string;
  histories: Array<{
    conversation: Conversation;
    messageCount: number;
    title: string;
  }>;
  onNewChat: () => void;
  onRenameConversation: (conversationId: string, title: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  function startRename(item: { conversation: Conversation; title: string }) {
    setEditingConversationId(item.conversation.id);
    setEditingTitle(item.conversation.customTitle ?? item.title);
  }

  function cancelRename() {
    setEditingConversationId(null);
    setEditingTitle("");
  }

  function saveRename(conversationId: string) {
    const title = editingTitle.trim();
    if (!title) return;
    onRenameConversation(conversationId, title);
    cancelRename();
  }

  function deleteConversation(item: { conversation: Conversation; title: string }) {
    if (!window.confirm(`Delete "${item.title}"? This removes the chat from local history.`)) return;
    if (editingConversationId === item.conversation.id) cancelRename();
    onDeleteConversation(item.conversation.id);
  }

  return (
    <section className="free-chat-panel" aria-label="Chat history">
      <div className="free-chat-header">
        <div className="free-chat-title">
          <span className="profile-block-icon">
            <MessageSquare size={18} />
          </span>
          <div>
            <h3>Chat history</h3>
            <p>{agent ? `${agent.name} free chats` : "Select an agent"}</p>
          </div>
        </div>
        <button type="button" className="icon-text-button" onClick={onNewChat} disabled={!agent}>
          <Plus size={15} />
          New chat
        </button>
      </div>
      <div className="free-chat-history-list">
        {histories.length > 0 ? (
          histories.map((item) => {
            const isEditing = editingConversationId === item.conversation.id;
            return (
              <div
                className={`free-chat-history-item ${item.conversation.id === activeConversationId ? "active" : ""} ${isEditing ? "editing" : ""}`}
                key={item.conversation.id}
              >
                {isEditing ? (
                  <form
                    className="free-chat-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveRename(item.conversation.id);
                    }}
                  >
                    <label className="sr-only" htmlFor={`free-chat-title-${item.conversation.id}`}>
                      Chat title
                    </label>
                    <input
                      id={`free-chat-title-${item.conversation.id}`}
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelRename();
                      }}
                      autoFocus
                    />
                    <button className="history-icon-button" type="submit" aria-label="Save chat title" disabled={!editingTitle.trim()}>
                      <Check size={14} />
                    </button>
                    <button className="history-icon-button" type="button" onClick={cancelRename} aria-label="Cancel rename">
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="free-chat-history-select"
                      onClick={() => onSelectConversation(item.conversation.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.messageCount} messages</span>
                    </button>
                    <div className="free-chat-history-actions" aria-label={`${item.title} actions`}>
                      <button className="history-icon-button" type="button" onClick={() => startRename(item)} aria-label={`Rename ${item.title}`} title="Rename">
                        <Pencil size={14} />
                      </button>
                      <button
                        className="history-icon-button danger"
                        type="button"
                        onClick={() => deleteConversation(item)}
                        aria-label={`Delete ${item.title}`}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <div className="inline-empty">No free chat history yet.</div>
        )}
      </div>
    </section>
  );
}

export function ProjectSelectionPanel({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <section className="free-chat-panel" aria-label="Project workspace selection">
      <div className="free-chat-header">
        <span className="profile-block-icon">
          <Folder size={18} />
        </span>
        <div>
          <h3>No project selected</h3>
          <p>Select a project from the left list when you are ready to work with project scope.</p>
        </div>
      </div>
      <button className="secondary-button" type="button" onClick={onCreateProject}>
        <Plus size={16} />
        Create project
      </button>
    </section>
  );
}

export function NoProjectState({ onSelectProject }: { onSelectProject: () => void }) {
  return (
    <div className="conversation-body">
      <div className="empty-state compact-empty">
        <Folder size={32} />
        <h3>No project selected</h3>
        <p>Select a project from the left list, or continue in Free chat.</p>
        <button className="secondary-button" type="button" onClick={onSelectProject}>
          Free chat
        </button>
      </div>
    </div>
  );
}

export function NoAgentState({ onAddAgent }: { onAddAgent: () => void }) {
  return (
    <div className="conversation-body">
      <div className="empty-state compact-empty">
        <UserRoundCog size={32} />
        <h3>No agents connected</h3>
        <p>Connect a real agent provider before starting direct chat or Chief-led tasks.</p>
        <button className="secondary-button" onClick={onAddAgent}>
          Add agent
        </button>
      </div>
    </div>
  );
}

export function TaskRoom({
  agents,
  chief,
  messages,
  participantIds,
  projectTask,
  isResponding,
  onToggleParticipant,
  onRetryMessage,
}: {
  agents: AgentInstance[];
  chief?: AgentInstance;
  messages: ConversationMessage[];
  participantIds: string[];
  projectTask?: ProjectTask;
  isResponding: boolean;
  onToggleParticipant: (agentId: string, checked: boolean) => void;
  onRetryMessage: (messageId: string) => void;
}) {
  const participants = agents.filter((agent) => agent.id !== chief?.id && agent.status === "online");
  const bodyRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, projectTask?.updatedAt, isResponding]);

  return (
    <div className="conversation-body" ref={bodyRef}>
      <div className="task-summary">
        <div>
          <h3>{projectTask?.title ?? `${chief?.name ?? "Chief"} task room`}</h3>
          <p>
            {projectTask?.summary ??
              (chief ? "Submit a project-scoped task to Chief and choose the participant agents for the first round." : "Assign one connected agent as Chief before starting a task room.")}
          </p>
        </div>
        <span className="mode-badge">{projectTask?.state ?? (chief ? "idle" : "unsupported")}</span>
      </div>
      {chief ? (
        <div className="assignment-row chief-assignment">
          <AgentAvatar agent={chief} size="small" />
          <div>
            <strong>{chief.name}</strong>
            <span>Chief owner</span>
          </div>
          <span className={chief.status === "online" ? "status-badge success" : "status-badge danger"}>{chief.status}</span>
        </div>
      ) : null}
      <div className="assignment-list">
        {participants.length > 0 ? (
          participants.map((agent) => (
            <label className="assignment-row selectable-assignment" key={agent.id}>
              <AgentAvatar agent={agent} size="small" />
              <div>
                <strong>{agent.name}</strong>
                <span>{agent.tags.join(" / ")}</span>
              </div>
              <input
                type="checkbox"
                checked={participantIds.includes(agent.id)}
                onChange={(event) => onToggleParticipant(agent.id, event.currentTarget.checked)}
                aria-label={`Select ${agent.name} for task room`}
              />
            </label>
          ))
        ) : (
          <div className="inline-empty">Connect another online agent to delegate Task Room work.</div>
        )}
      </div>
      <div className="task-room-transcript">
        {messages.length > 0 || isResponding ? (
          <>
            <MessageRows messages={messages} onRetryMessage={onRetryMessage} />
            {isResponding ? <TypingIndicator /> : null}
          </>
        ) : (
          <div className="inline-empty">Task Room messages will appear here after you submit a Chief-led task.</div>
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function getDisplayMessageText(message: ConversationMessage) {
  const text = getPartText(message.contentParts);
  return message.role === "system" ? sanitizeAgentErrorText(text) : text;
}

function getPartText(parts: A2APart[]) {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "data") return JSON.stringify(part.data, null, 2);
      return part.file.name ?? part.file.uri ?? "File";
    })
    .join("\n");
}

function getFailureKindLabel(kind?: ConversationFailureKind) {
  if (kind === "timeout") return "Timeout";
  if (kind === "network") return "Network";
  if (kind === "auth") return "Auth";
  if (kind === "not_found") return "Endpoint";
  if (kind === "context") return "Context";
  if (kind === "interrupted") return "Interrupted";
  return "Failed";
}

function MessageRows({
  messages,
  onRetryMessage,
}: {
  messages: ConversationMessage[];
  onRetryMessage?: (messageId: string) => void;
}) {
  return messages.map((message) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";
    const content = getDisplayMessageText(message);
    const canRetry = isUser && message.status === "failed" && Boolean(onRetryMessage);
    const failureLabel = message.status === "failed" && message.errorText ? getFailureKindLabel(message.errorKind) : "";
    return (
      <div className={`message-row ${isUser ? "user-message" : "agent-message"}`} key={message.id}>
        <div className={`${isUser ? "message-bubble" : "agent-output"} ${message.status} ${isSystem ? "system" : ""}`}>
          {isUser ? <p>{content}</p> : <MarkdownContent content={content} />}
          {message.errorText ? (
            <div className="message-error-meta">
              {failureLabel ? <span className="message-error-kind">{failureLabel}</span> : null}
              <p className="message-error-text">{sanitizeAgentErrorText(message.errorText)}</p>
            </div>
          ) : null}
          {message.workspaceContext && message.workspaceContext.length > 0 ? (
            <div className="message-context-strip" aria-label="Workspace files sent with this message">
              {message.workspaceContext.map((file) => (
                <span className="message-context-chip" key={`${message.id}-${file.path}`}>
                  <FileText size={12} />
                  {file.path}
                </span>
              ))}
            </div>
          ) : null}
          {canRetry ? (
            <button
              className="message-retry-button"
              type="button"
              onClick={() => onRetryMessage?.(message.id)}
            >
              <RefreshCw size={13} />
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  });
}

function TypingIndicator() {
  return (
    <div className="message-row agent-message typing-row" role="status" aria-label="Agent is responding">
      <div className="agent-output typing-indicator" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
