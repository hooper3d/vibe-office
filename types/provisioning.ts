export type ProvisioningUserPath = "model_key_only" | "existing_hermes";

export type ProvisioningMode =
  | "dry_run"
  | "local_install"
  | "connect_existing"
  | "create_profiles_from_existing";

export type OfficeSetupStatus =
  | "empty"
  | "model_ready"
  | "office_previewed"
  | "hermes_ready"
  | "activation_review"
  | "office_active";

export type ProviderTemplate = {
  id: string;
  name: string;
  apiBaseUrl?: string;
  keyEnvName: string;
  defaultModel: string;
  compatibleWithOpenAI: boolean;
  setupHint: string;
};

export type AgentTemplate = {
  id: "coordinator" | "builder" | "publisher" | "operator" | string;
  displayName: string;
  role: string;
  profileName: string;
  isChief?: boolean;
  soulTemplate: string;
  defaultTools: string[];
  contextFiles: string[];
};

export type OfficeTemplate = {
  id: string;
  name: string;
  description: string;
  agents: AgentTemplate[];
};

export type ProvisioningAgentPlan = {
  profileName: string;
  displayName: string;
  role: string;
  isChief: boolean;
  apiBaseUrl?: string;
  port?: number;
  status: "planned" | "created" | "running" | "failed";
  contextFiles: string[];
  soulTemplate: string;
};

export type ProvisioningPlan = {
  providerId?: string;
  providerName?: string;
  officeTemplateId: string;
  officeTemplateName: string;
  mode: ProvisioningMode;
  userPath: ProvisioningUserPath;
  agents: ProvisioningAgentPlan[];
  commands: string[];
  warnings: string[];
  nextSteps: string[];
};

export type OfficeSetupAgent = {
  displayName: string;
  role: string;
  profileName: string;
  isChief: boolean;
};

export type OfficeActivationSettings = {
  chiefAgentName: string;
  allowProfileCreation: boolean;
  allowContextSharing: boolean;
  confirmedAt?: string;
};

export type OfficeSetupSession = {
  savedAt: string;
  status: OfficeSetupStatus;
  userPath: ProvisioningUserPath;
  mode: ProvisioningMode;
  providerId?: string;
  providerName?: string;
  hermesBaseUrl?: string;
  officeTemplateId: string;
  officeTemplateName: string;
  agents: OfficeSetupAgent[];
  activation: OfficeActivationSettings;
};

export type ProviderTestResult = {
  ok: boolean;
  providerId: string;
  providerName?: string;
  model?: string;
  latencyMs?: number;
  status?: number;
  message: string;
};

export type HermesTestResult = {
  ok: boolean;
  baseUrl: string;
  models: string[];
  latencyMs?: number;
  canCreateProfiles: boolean;
  diagnosticCode?:
    | "missing_base_url"
    | "api_unreachable"
    | "api_reachable_key_required"
    | "unauthorized_key"
    | "responses_unavailable"
    | "bad_response"
    | "connected";
  checkedEndpoints?: Array<{
    label: string;
    url: string;
    ok: boolean;
    status?: number;
    message: string;
  }>;
  message: string;
  notes: string[];
  nextSteps?: string[];
};
