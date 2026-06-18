import { FormEvent } from "react";
import {
  Loader2,
  MapPin,
  Tags,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { CAPABILITY_TAG_OPTIONS, NON_CAPABILITY_TAGS } from "../domain/agentProfile";
import type { AgentInstance } from "../domain/types";
import type { ConnectionTestState } from "../services/agentSetupDialogState";
import type { LocalTrustedAgentSafeStatus } from "../services/localTrustedAgentRegistry";
import { AgentAvatar, StatusDot } from "./AgentPrimitives";
import { AgentSetupFieldLabel } from "./AgentSetupFieldLabel";
import { CapabilityTagSelector, OfficeRoleSelector } from "./AgentProfileSelectors";
import { AgentProviderSettings } from "./AgentProviderSettings";

export function SetupWizard({
  testState,
  testMessage,
  isSaving,
  onClose,
  onRunTest,
  onResetTest,
  onSaveAgent,
  agent,
  localTrustedStatus,
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
  localTrustedStatus?: LocalTrustedAgentSafeStatus;
  onDeleteAgent: (agentId: string) => void;
  onAgentAvatarFile: (agentId: string, file?: File) => void;
}) {
  const profileAgent = agent;
  const profileName = profileAgent?.name ?? "New Agent";
  const profileNote = profileAgent?.role ?? "";
  const profileOfficeRole = profileAgent?.officeRole ?? (profileAgent ? (profileAgent.isChief ? "chief" : "operator") : undefined);
  const profileTags = (profileAgent?.tags ?? []).filter((tag) => !NON_CAPABILITY_TAGS.includes(tag));
  const capabilityOptions = Array.from(new Set([...CAPABILITY_TAG_OPTIONS, ...profileTags]));

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
                      <AgentSetupFieldLabel help="Shown in the left Agent list." label="Agent name" />
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
                    <AgentSetupFieldLabel help="Local responsibility note for routing and future prompt behavior." label="Role note" />
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

              <AgentProviderSettings
                agent={profileAgent}
                localTrustedStatus={localTrustedStatus}
                testMessage={testMessage}
                testState={testState}
                onRunTest={onRunTest}
              />
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
