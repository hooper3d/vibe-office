import { useEffect, useState } from "react";
import { Bot, CheckCircle2, KeyRound, Loader2, Server, XCircle } from "lucide-react";
import type { AgentInstance, AgentRuntimeProvider } from "../domain/types";
import type { ConnectionTestState } from "../services/agentSetupDialogState";
import type { LocalTrustedAgentSafeStatus } from "../services/localTrustedAgentRegistry";

export function AgentProviderSettings({
  agent,
  localTrustedStatus,
  testMessage,
  testState,
  onRunTest,
}: {
  agent?: AgentInstance;
  localTrustedStatus?: LocalTrustedAgentSafeStatus;
  testMessage: string;
  testState: ConnectionTestState;
  onRunTest: (form: FormData) => void;
}) {
  const profileRuntimeProvider: AgentRuntimeProvider = agent?.runtimeProvider ?? "hermes";
  const defaultRuntimeBaseUrl = agent?.endpoint ?? "";
  const [runtimeBaseUrl, setRuntimeBaseUrl] = useState(defaultRuntimeBaseUrl);
  const [runtimeProvider, setRuntimeProvider] = useState<AgentRuntimeProvider>(profileRuntimeProvider);
  const generatedA2AEndpoint = getGeneratedA2AEndpoint(runtimeBaseUrl);
  const generatedAgentCardUrl = getGeneratedAgentCardUrl(runtimeBaseUrl);
  const providerHint = getProviderHint(runtimeProvider);
  const registryDiagnostic = getRegistryDiagnostic(agent, localTrustedStatus);
  const credentialDiagnostic = getCredentialDiagnostic(agent, localTrustedStatus);

  useEffect(() => {
    setRuntimeBaseUrl(defaultRuntimeBaseUrl);
    setRuntimeProvider(profileRuntimeProvider);
  }, [defaultRuntimeBaseUrl, agent?.id, profileRuntimeProvider]);

  return (
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
              <input name="model" defaultValue={agent?.model ?? ""} placeholder="Remote model or agent id" required />
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
              <span className="field-label-row">
                <span>API key</span>
                <span className={`credential-pill ${credentialDiagnostic.state}`}>{credentialDiagnostic.shortLabel}</span>
              </span>
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                defaultValue=""
                placeholder="Enter a new key to save locally"
              />
              <small className="field-note">{credentialDiagnostic.inputHint}</small>
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
                <input name="namespace" defaultValue={agent ? "vibe-office" : ""} placeholder="Optional namespace prefix" />
              </label>
              <label>
                Timeout
                <input name="timeout" defaultValue={agent?.timeoutSeconds ? `${agent.timeoutSeconds}s` : "60s"} placeholder="60s" />
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
          <DiagnosticRow detail={registryDiagnostic.detail} label="Local registry" state={registryDiagnostic.state} />
          <DiagnosticRow detail={credentialDiagnostic.detail} label="API key" state={credentialDiagnostic.state} />
          {testMessage ? <div className={`test-message ${testState}`}>{testMessage}</div> : null}
        </div>
      </div>
    </section>
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
    return "Use the provider's OpenAI-compatible base URL; some use /v1, while others expose /chat/completions from the root.";
  }
  if (provider === "anthropic") {
    return "Use an Anthropic-compatible messages endpoint. /v1/messages is generated when the base ends at /v1.";
  }
  return "Use a Hermes or native A2A-capable runtime. Chat compatibility is used when native A2A is unavailable.";
}

function getRegistryDiagnostic(agent?: AgentInstance, status?: LocalTrustedAgentSafeStatus): { state: ConnectionTestState; detail: string } {
  if (!agent && status?.registered) return { state: "passed", detail: "Saved locally for this draft." };
  if (!agent) return { state: "idle", detail: "Saved when the agent is tested or added." };
  if (!status) return { state: "idle", detail: "Checking local trusted layer." };
  if (!status.registered) return { state: "failed", detail: "Not saved locally." };

  const runtimeProvider = agent.runtimeProvider ?? "hermes";
  if (status.runtimeProvider !== runtimeProvider) {
    return { state: "failed", detail: `Saved as ${getProviderLabel(status.runtimeProvider)}.` };
  }
  if (status.model && status.model !== agent.model) {
    return { state: "failed", detail: "Saved model differs from this profile." };
  }
  return { state: "passed", detail: "Saved locally." };
}

function getCredentialDiagnostic(
  agent?: AgentInstance,
  status?: LocalTrustedAgentSafeStatus,
): { state: ConnectionTestState; detail: string; inputHint: string; shortLabel: string } {
  const runtimeProvider = agent?.runtimeProvider ?? status?.runtimeProvider ?? "hermes";
  if (!agent && !status) {
    return {
      state: "idle",
      detail: "Saved after testing or adding.",
      inputHint: "Enter a key, then test or add the agent to save it locally.",
      shortLabel: "Not saved",
    };
  }
  if (runtimeProvider === "hermes") {
    return {
      state: "passed",
      detail: "Not required.",
      inputHint: "Hermes agents can use the local runtime without a provider key.",
      shortLabel: "Optional",
    };
  }
  if (!status) {
    return {
      state: "idle",
      detail: "Checking local trusted layer.",
      inputHint: "Saved keys stay local and are not stored in browser history.",
      shortLabel: "Checking",
    };
  }
  if (!status.registered) {
    return {
      state: "failed",
      detail: "Agent is not saved locally.",
      inputHint: "Enter a key, then save changes to register this agent locally.",
      shortLabel: "Not saved",
    };
  }
  if (status.hasCredential) {
    return {
      state: "passed",
      detail: "Saved locally.",
      inputHint: "Leave blank to keep the saved local key, or enter a new key and save changes.",
      shortLabel: "Saved locally",
    };
  }
  return {
    state: "failed",
    detail: "Missing in local trusted layer.",
    inputHint: "Enter a key, then save changes before using this provider.",
    shortLabel: "Missing",
  };
}

function getProviderLabel(provider: AgentRuntimeProvider) {
  if (provider === "openai") return "OpenAI-compatible";
  if (provider === "anthropic") return "Anthropic-compatible";
  return "Hermes";
}

function DiagnosticRow({ detail, label, state }: { detail?: string; label: string; state: ConnectionTestState }) {
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
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
