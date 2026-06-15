export type RuntimeMode = "embedded" | "external";

export type RuntimeHealthStatus = "ready" | "checking" | "not_installed" | "needs_key" | "unreachable" | "failed";

export type RuntimeHealthTone = "ready" | "checking" | "attention" | "error";

export type RuntimeQuickStartStepStatus = "done" | "action" | "waiting" | "error";

export type EmbeddedHermesConfig = {
  enabled: boolean;
  managedByVibeOffice: boolean;
  baseUrl: string;
  healthUrl: string;
  apiKeyEnvName: string;
  runtimeDir: string;
};

export type AguiConnectorConfig = {
  enabled: boolean;
  managedByVibeOffice: boolean;
  baseUrl: string;
};

export type LocalRuntimeConfig = {
  mode: RuntimeMode;
  developerMode: boolean;
  hermes: EmbeddedHermesConfig;
  aguiConnector: AguiConnectorConfig;
};

export type LocalWorkspaceConfig = {
  appVersion: string;
  portablePreview: boolean;
  workspaceRoot: string;
  defaultProjectId: string;
  runtime: LocalRuntimeConfig;
};

export type LocalUserProfile = {
  id: string;
  displayName: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type RuntimeComponentHealth = {
  id: "workspace" | "context-hub" | "logs" | "embedded-hermes" | "agui-connector";
  label: string;
  status: RuntimeHealthStatus;
  tone: RuntimeHealthTone;
  message: string;
  detail?: string;
};

export type LocalRuntimeHealth = {
  checkedAt: string;
  mode: RuntimeMode;
  developerMode: boolean;
  summary: RuntimeHealthStatus;
  components: RuntimeComponentHealth[];
};

export type RuntimeQuickStartStep = {
  id: RuntimeComponentHealth["id"];
  label: string;
  status: RuntimeQuickStartStepStatus;
  healthStatus: RuntimeHealthStatus;
  message: string;
};

export type RuntimeQuickStartState = {
  checkedAt: string;
  ready: boolean;
  title: string;
  summary: string;
  primaryAction: "open_office" | "prepare_runtime" | "enter_developer_mode" | "repair";
  steps: RuntimeQuickStartStep[];
};

export type LocalWorkspaceSnapshot = {
  config: LocalWorkspaceConfig;
  user: LocalUserProfile;
  health: LocalRuntimeHealth;
  quickStart: RuntimeQuickStartState;
};
