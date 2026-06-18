import { FormEvent, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  KeyRound,
  Loader2,
  MapPin,
  Server,
  Tags,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { CAPABILITY_TAG_OPTIONS, getOfficeRoleLabel, NON_CAPABILITY_TAGS, OFFICE_ROLE_OPTIONS } from "../domain/agentProfile";
import type { AgentInstance, AgentOfficeRole, AgentRuntimeProvider } from "../domain/types";
import { AgentAvatar, StatusDot } from "./AgentPrimitives";

export type ConnectionTestState = "idle" | "running" | "passed" | "failed";

export function SetupWizard({
  testState,
  testMessage,
  isSaving,
  onClose,
  onRunTest,
  onResetTest,
  onSaveAgent,
  agent,
  onDeleteAgent,
  onAgentAvatarFile,
}: {
  testState: ConnectionTestState;
  testMessage: string;
  isSaving: boolean;
  onClose: () => void;
  onRunTest: (form: FormData) => void;
  onResetTest: () => void;
  onSaveAgent: (event: FormEvent<HTMLFormElement>) => void;
  agent?: AgentInstance;
  onDeleteAgent: (agentId: string) => void;
  onAgentAvatarFile: (agentId: string, file?: File) => void;
}) {
  const profileAgent = agent;
  const profileName = profileAgent?.name ?? "New Agent";
  const profileNote = profileAgent?.role ?? "";
  const profileOfficeRole = profileAgent?.officeRole ?? (profileAgent ? (profileAgent.isChief ? "chief" : "operator") : undefined);
  const profileRuntimeProvider: AgentRuntimeProvider = profileAgent?.runtimeProvider ?? "hermes";
  const profileTags = (profileAgent?.tags ?? []).filter((tag) => !NON_CAPABILITY_TAGS.includes(tag));
  const capabilityOptions = Array.from(new Set([...CAPABILITY_TAG_OPTIONS, ...profileTags]));
  const defaultRuntimeBaseUrl = profileAgent?.endpoint ?? "";
  const [runtimeBaseUrl, setRuntimeBaseUrl] = useState(defaultRuntimeBaseUrl);
  const [runtimeProvider, setRuntimeProvider] = useState<AgentRuntimeProvider>(profileRuntimeProvider);
  const generatedA2AEndpoint = getGeneratedA2AEndpoint(runtimeBaseUrl);
  const generatedAgentCardUrl = getGeneratedAgentCardUrl(runtimeBaseUrl);
  const providerHint = getProviderHint(runtimeProvider);

  useEffect(() => {
    setRuntimeBaseUrl(defaultRuntimeBaseUrl);
    setRuntimeProvider(profileRuntimeProvider);
  }, [defaultRuntimeBaseUrl, profileAgent?.id, profileRuntimeProvider]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup-header agent-dialog-header">
          <div>
            <h2 id="setup-title">{profileAgent ? "Edit Agent" : "Add Agent"}</h2>
            <p>
              {profileAgent
                ? "Update this model-backed agent and its optional runtime details."
                : "Connect a model-backed agent. Add richer runtime capabilities later."}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={profileAgent ? "Close Edit Agent" : "Close Add Agent"}>
            <XCircle size={18} />
          </button>
        </div>

        <form className="setup-form" onSubmit={onSaveAgent} onChange={onResetTest}>
          <section className="profile-section" aria-label="Agent profile">
            <div className="profile-panel">
              <section className="profile-block identity-block" aria-label="Basic setup">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <UserRound size={18} />
                    </span>
                    <span>Basic setup</span>
                  </span>
                  <span className="avatar-stack">
                    {profileAgent ? (
                      <label className="avatar-edit" aria-label={`Change avatar for ${profileAgent.name}`} title="Change avatar">
                        <AgentAvatar agent={profileAgent} size="large" />
                        <input
                          accept="image/*"
                          className="file-input"
                          name={`avatarFile-${profileAgent.id}`}
                          type="file"
                          onChange={(event) => {
                            onAgentAvatarFile(profileAgent.id, event.currentTarget.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <span className="avatar large empty-avatar" aria-hidden="true">
                        <UserRound size={24} />
                      </span>
                    )}
                    <span className="avatar-status">
                      <StatusDot status={profileAgent?.status ?? "offline"} />
                      {profileAgent?.status ?? "offline"}
                    </span>
                  </span>
                </div>
                <div className="profile-block-content identity-content">
                  <div className="identity-fields">
                    <label>
                      <FieldLabel help="Shown in the left Agent list." label="Agent name" />
                      <input name="name" defaultValue={profileName} placeholder="New Agent" required />
                    </label>
                    <OfficeRoleSelector selectedRole={profileOfficeRole} />
                    <CapabilityTagSelector options={capabilityOptions} selectedTags={profileTags} />
                  </div>
                </div>
              </section>

              <section className="profile-block" aria-label="Behavior">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <Tags size={18} />
                    </span>
                    <span>Behavior</span>
                  </span>
                </div>
                <div className="profile-block-content">
                  <label className="notes-field">
                    <FieldLabel help="Local responsibility note for routing and future prompt behavior." label="Role note" />
                    <textarea name="role" defaultValue={profileNote} placeholder="What should this agent do, avoid, or hand off?" />
                  </label>
                </div>
              </section>

              <section className="profile-block" aria-label="Instance address">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <MapPin size={18} />
                    </span>
                    <span>Instance address</span>
                  </span>
                </div>
                <div className="profile-block-content form-grid compact-grid">
                  <label>
                    Instance location
                    <input name="location" defaultValue={profileAgent?.location ?? ""} placeholder="Remote site, office, or region" />
                  </label>
                  <label>
                    Host / IP
                    <input name="ipAddress" defaultValue={profileAgent?.ipAddress ?? ""} placeholder="Public or private IP, optional" />
                  </label>
                </div>
              </section>

              <section className="profile-block runtime-block" aria-label="Model provider">
                <div className="profile-block-title">
                  <span className="profile-title-line">
                    <span className="profile-block-icon">
                      <Server size={18} />
                    </span>
                    <span>Model provider</span>
                  </span>
                </div>
                <div className="profile-block-content runtime-content">
                  <div className="runtime-group">
                    <span className="runtime-group-title">Connection</span>
                    <div className="form-grid runtime-user-fields">
                      <label>
                        Provider type
                        <select
                          name="runtimeProvider"
                          value={runtimeProvider}
                          aria-label="Runtime type"
                          onChange={(event) => setRuntimeProvider(event.currentTarget.value as AgentRuntimeProvider)}
                        >
                          <option value="hermes">Hermes</option>
                          <option value="openai">OpenAI-compatible</option>
                          <option value="anthropic">Anthropic-compatible</option>
                        </select>
                      </label>
                      <label>
                        Model or Agent ID
                        <input name="model" defaultValue={profileAgent?.model ?? ""} placeholder="Remote model or agent id" required />
                      </label>
                      <label>
                        Base URL
                        <input
                          name="endpoint"
                          value={runtimeBaseUrl}
                          onChange={(event) => setRuntimeBaseUrl(event.currentTarget.value)}
                          placeholder="https://agent.example.com/v1"
                          required
                        />
                      </label>
                      <label>
                        API key
                        <input name="apiKey" type="password" defaultValue={profileAgent?.apiKey ?? ""} placeholder="Optional API key" />
                      </label>
                    </div>
                    <p className="runtime-provider-hint">{providerHint}</p>
                  </div>

                  <details className="advanced-runtime-settings">
                    <summary>Advanced settings</summary>
                    <div className="runtime-group">
                      <span className="runtime-group-title">Local runtime</span>
                      <div className="form-grid technical-fields">
                        <label>
                          Namespace prefix
                          <input name="namespace" defaultValue={profileAgent ? "vibe-office" : ""} placeholder="Optional namespace prefix" />
                        </label>
                        <label>
                          Timeout
                          <input name="timeout" defaultValue={profileAgent?.timeoutSeconds ? `${profileAgent.timeoutSeconds}s` : "60s"} placeholder="60s" />
                        </label>
                      </div>
                    </div>
                    <div className="runtime-group">
                      <span className="runtime-group-title">Generated integration endpoints</span>
                      <div className="form-grid technical-fields">
                        <label>
                          Task endpoint
                          <input name="a2aEndpoint" value={generatedA2AEndpoint} placeholder="Generated after Base URL" readOnly required />
                        </label>
                        <label>
                          Capability URL
                          <input name="agentCardUrl" value={generatedAgentCardUrl} placeholder="Generated after Base URL" readOnly required />
                        </label>
                      </div>
                    </div>
                  </details>

                  <div className="runtime-status-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={(event) => {
                        const form = event.currentTarget.form;
                        if (!form || !form.reportValidity()) return;
                        onRunTest(new FormData(form));
                      }}
                      disabled={testState === "running"}
                    >
                      {testState === "running" ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
                      Test connection
                    </button>
                  </div>

                  <div className="diagnostics">
                    <DiagnosticRow label="Provider reachable" state={testState} />
                    <DiagnosticRow label="Model response ready" state={testState} />
                    <DiagnosticRow label="Profile metadata ready" state={testState} />
                    {testMessage ? <div className={`test-message ${testState}`}>{testMessage}</div> : null}
                  </div>
                </div>
              </section>
            </div>
          </section>

          <div className="setup-actions">
            {profileAgent ? (
              <button type="button" className="danger-action-button" onClick={() => onDeleteAgent(profileAgent.id)} disabled={isSaving}>
                <Trash2 size={16} />
                Delete agent
              </button>
            ) : null}
            <span className="setup-action-spacer" />
            <button type="button" className="secondary-button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSaving || (!profileAgent && testState !== "passed")}>
              {isSaving ? <Loader2 className="spin" size={16} /> : null}
              {isSaving ? "Saving" : profileAgent ? "Save changes" : "Add agent"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FieldLabel({ help, label }: { help: string; label: string }) {
  return (
    <span className="field-label">
      {label}
      <span className="field-help" tabIndex={0} title={help} aria-label={help}>
        <CircleHelp size={13} />
      </span>
    </span>
  );
}

function CapabilityTagSelector({ options, selectedTags }: { options: string[]; selectedTags: string[] }) {
  const [currentTags, setCurrentTags] = useState(selectedTags);
  const selectedSummary = currentTags.length > 0 ? currentTags.join(", ") : "Select capabilities";

  function toggleTag(tag: string, checked: boolean) {
    setCurrentTags((current) => (checked ? Array.from(new Set([...current, tag])) : current.filter((item) => item !== tag)));
  }

  return (
    <div className="capability-selector" role="group" aria-label="Capability tags">
      <FieldLabel help="For filtering and your own reference only." label="Capability tags" />
      <details className="capability-select">
        <summary>
          <span className="selected-capabilities">{selectedSummary}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options">
          {options.map((tag) => (
            <label className="capability-option" key={tag}>
              <input
                checked={currentTags.includes(tag)}
                name="tags"
                type="checkbox"
                value={tag}
                onChange={(event) => toggleTag(tag, event.currentTarget.checked)}
              />
              <span>{tag}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function OfficeRoleSelector({ selectedRole }: { selectedRole?: AgentOfficeRole }) {
  const [currentRole, setCurrentRole] = useState<AgentOfficeRole | "">(selectedRole ?? "");
  const selectedLabel = currentRole ? getOfficeRoleLabel(currentRole) : "Select role";

  useEffect(() => {
    setCurrentRole(selectedRole ?? "");
  }, [selectedRole]);

  function selectRole(role: AgentOfficeRole, details: HTMLElement | null) {
    setCurrentRole(role);
    details?.removeAttribute("open");
  }

  return (
    <div className="office-role-selector">
      <FieldLabel help="Office identity for routing and your own organization." label="Office role" />
      <details className="capability-select single-select">
        <summary>
          <span className="selected-capabilities">{selectedLabel}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options role-options">
          {OFFICE_ROLE_OPTIONS.map((option) => (
            <label className="capability-option role-option" key={option.value}>
              <input
                checked={currentRole === option.value}
                name="officeRole"
                required
                type="radio"
                value={option.value}
                onChange={(event) => selectRole(option.value, event.currentTarget.closest("details"))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function getRuntimeRoot(endpoint: string) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return trimmed
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

function getGeneratedA2AEndpoint(endpoint: string) {
  const root = getRuntimeRoot(endpoint);
  return root ? `${root}/a2a` : "";
}

function getGeneratedAgentCardUrl(endpoint: string) {
  const root = getRuntimeRoot(endpoint);
  return root ? `${root}/.well-known/agent-card.json` : "";
}

function getProviderHint(provider: AgentRuntimeProvider) {
  if (provider === "openai") {
    return "Use an OpenAI-compatible chat/completions endpoint, usually ending at /v1.";
  }
  if (provider === "anthropic") {
    return "Use an Anthropic-compatible messages endpoint. /v1/messages is generated when the base ends at /v1.";
  }
  return "Use a Hermes or native A2A-capable runtime. Chat compatibility is used when native A2A is unavailable.";
}

function DiagnosticRow({ label, state }: { label: string; state: ConnectionTestState }) {
  const icon =
    state === "passed" ? (
      <CheckCircle2 size={16} />
    ) : state === "failed" ? (
      <XCircle size={16} />
    ) : state === "running" ? (
      <Loader2 className="spin" size={16} />
    ) : (
      <Bot size={16} />
    );
  return (
    <div className={`diagnostic-row ${state}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
