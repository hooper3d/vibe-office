"use client";

import {
  CheckCircle2,
  Code2,
  Crown,
  Database,
  KeyRound,
  Megaphone,
  Network,
  Play,
  Rocket,
  ServerCog,
  Wrench,
  Workflow,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { officeTemplates } from "@/lib/office-templates";
import { providerTemplates } from "@/lib/provider-config";
import type {
  HermesTestResult,
  OfficeSetupAgent,
  OfficeSetupSession,
  OfficeSetupStatus,
  ProvisioningAgentPlan,
  ProviderTestResult,
  ProvisioningMode,
  ProvisioningPlan,
  ProvisioningUserPath
} from "@/types/provisioning";

type PlanResponse = {
  ok: boolean;
  plan?: ProvisioningPlan;
  error?: string;
};

type SavedOfficeSetupInputs = {
  userPath?: ProvisioningUserPath;
  providerId?: string;
  officeTemplateId?: string;
  customBaseUrl?: string;
  hermesBaseUrl?: string;
  chiefAgentName?: string;
};

type SavedOfficeSetupSecrets = {
  apiKey?: string;
  hermesApiKey?: string;
};

type LegacyOfficeDraft = {
  savedAt: string;
  userPath: ProvisioningUserPath;
  mode: ProvisioningMode;
  providerId?: string;
  hermesBaseUrl?: string;
  officeTemplateId: string;
  agents: OfficeSetupAgent[];
};

type SessionChangeOptions = {
  close?: boolean;
  allowProfileCreation?: boolean;
  allowContextSharing?: boolean;
  chiefAgentName?: string;
};

const OFFICE_SETUP_INPUTS_STORAGE_KEY = "vibe-office-provisioning-setup-inputs-v1";
const OFFICE_SETUP_SECRETS_STORAGE_KEY = "vibe-office-provisioning-setup-secrets-v1";
const OFFICE_SETUP_SESSION_STORAGE_KEY = "vibe-office-provisioning-setup-session-v1";
const LEGACY_OFFICE_DRAFT_STORAGE_KEY = "vibe-office-provisioning-office-draft-v1";

function isProvisioningStatus(value: unknown): value is OfficeSetupStatus {
  return (
    value === "empty" ||
    value === "model_ready" ||
    value === "office_previewed" ||
    value === "hermes_ready" ||
    value === "activation_review" ||
    value === "office_active"
  );
}

function ResultPill({ ok, label }: { ok?: boolean; label: string }) {
  if (ok === undefined) {
    return <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-400">{label}</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-normal text-slate-500">{children}</label>;
}

function agentVisual(profileName: string) {
  if (profileName.includes("coordinator")) return { Icon: Crown, label: "Lead", tone: "border-emerald-300/35 bg-[#0b2a26] text-emerald-200" };
  if (profileName.includes("builder")) return { Icon: Code2, label: "Build", tone: "border-sky-300/30 bg-[#0b2231] text-sky-200" };
  if (profileName.includes("publisher")) return { Icon: Megaphone, label: "Publish", tone: "border-violet-300/30 bg-[#171a33] text-violet-200" };
  return { Icon: Wrench, label: "Operate", tone: "border-amber-300/30 bg-[#252516] text-amber-200" };
}

function TeamAgentNode({
  agent,
  emphasized = false,
  className = ""
}: {
  agent: ProvisioningAgentPlan;
  emphasized?: boolean;
  className?: string;
}) {
  const visual = agentVisual(agent.profileName);
  const AgentIcon = visual.Icon;

  return (
    <div
      title={agent.role}
      className={`relative z-10 flex h-[116px] w-full max-w-[156px] flex-col items-center justify-center gap-2 justify-self-center rounded-xl border px-3 py-4 text-center ${visual.tone} ${
        emphasized ? "!border-emerald-300 shadow-[0_0_26px_rgba(16,185,129,0.14)]" : ""
      } ${className}`}
    >
      {emphasized ? (
        <span className="absolute -top-7 rounded-full border border-amber-300/30 bg-[#2b2711] px-2.5 py-1 text-[10px] font-semibold text-amber-100">
          Leader
        </span>
      ) : null}
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-950/35">
        <AgentIcon className="h-5 w-5" />
      </span>
      <div className="w-full min-w-0">
        <p className="w-full truncate text-sm font-semibold leading-5 text-slate-100">{agent.displayName}</p>
        <p className="mt-1 w-full truncate text-xs leading-4 text-slate-400">{agent.isChief ? "Chief Agent" : visual.label}</p>
      </div>
    </div>
  );
}

function TeamCollaborationMap({ agents }: { agents: ProvisioningAgentPlan[] }) {
  const leader = agents.find((agent) => agent.isChief) || agents[0];
  const members = agents.filter((agent) => agent.profileName !== leader.profileName).slice(0, 3);

  return (
    <div className="relative grid h-full min-h-[300px] grid-cols-3 grid-rows-[104px_minmax(96px,1fr)_104px] gap-x-8 gap-y-4 p-12 max-md:grid-cols-1 max-md:grid-rows-none max-md:p-4">
      <div className="pointer-events-none absolute inset-16 z-0 max-md:hidden" aria-hidden="true">
        <svg className="h-full w-full text-[#5b7cff]/45" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.42" strokeDasharray="1 2.4">
            <path d="M50 18 C50 30 50 38 50 45" />
            <path d="M50 58 C37 62 24 73 16 88" />
            <path d="M50 58 C50 70 50 78 50 88" />
            <path d="M50 58 C63 62 76 73 84 88" />
          </g>
        </svg>
      </div>

      <TeamAgentNode agent={leader} emphasized className="col-start-2 row-start-1 max-md:col-start-auto max-md:row-start-auto" />

      <div className="relative z-20 col-start-2 row-start-2 flex h-[108px] w-full max-w-[176px] flex-col items-center justify-center gap-2 self-center justify-self-center rounded-xl border border-cyan-300/35 bg-[#082333] px-3 py-4 text-center shadow-[0_0_24px_rgba(34,211,238,0.14)] max-md:col-start-auto max-md:row-start-auto">
        <Database className="h-6 w-6 shrink-0 text-cyan-200" />
        <div className="w-full min-w-0">
          <p className="w-full text-xs font-semibold leading-5 text-cyan-100">Project Context Hub</p>
          <p className="mt-1 w-full text-[10px] font-medium leading-4 text-cyan-100/55">Shared memory</p>
        </div>
      </div>

      {members.map((agent, index) => (
        <TeamAgentNode
          key={agent.profileName}
          agent={agent}
          className={`${["col-start-1", "col-start-2", "col-start-3"][index] || "col-start-2"} row-start-3 max-md:col-start-auto max-md:row-start-auto`}
        />
      ))}
    </div>
  );
}

function sessionAgentsFromPlan(plan: ProvisioningPlan | null, fallback: OfficeSetupAgent[]) {
  if (!plan) return fallback;
  return plan.agents.map((agent) => ({
    displayName: agent.displayName,
    role: agent.role,
    profileName: agent.profileName,
    isChief: agent.isChief
  }));
}

function planFromSession(session: OfficeSetupSession): ProvisioningPlan {
  return {
    providerId: session.providerId,
    providerName: session.providerName,
    officeTemplateId: session.officeTemplateId,
    officeTemplateName: session.officeTemplateName,
    mode: session.mode,
    userPath: session.userPath,
    agents: session.agents.map((agent) => ({
      ...agent,
      status: "planned",
      contextFiles: [],
      soulTemplate: ""
    })),
    commands: [],
    warnings: [],
    nextSteps: []
  };
}

function sessionFromLegacyDraft(draft: LegacyOfficeDraft): OfficeSetupSession {
  return {
    savedAt: draft.savedAt,
    status: draft.userPath === "existing_hermes" ? "activation_review" : "office_previewed",
    userPath: draft.userPath,
    mode: draft.mode,
    providerId: draft.providerId,
    hermesBaseUrl: draft.hermesBaseUrl,
    officeTemplateId: draft.officeTemplateId,
    officeTemplateName: officeTemplates.find((item) => item.id === draft.officeTemplateId)?.name || "Product Team",
    agents: draft.agents,
    activation: {
      chiefAgentName: draft.agents.find((agent) => agent.isChief)?.displayName || "Chief",
      allowProfileCreation: draft.mode === "create_profiles_from_existing",
      allowContextSharing: true
    }
  };
}

export function ProvisioningOnboarding({
  embedded = false,
  onOfficeSetupSaved
}: {
  embedded?: boolean;
  onOfficeSetupSaved?: (session: OfficeSetupSession | null, options?: SessionChangeOptions) => void;
}) {
  const [userPath, setUserPath] = useState<ProvisioningUserPath>("model_key_only");
  const [providerId, setProviderId] = useState(providerTemplates[1]?.id || providerTemplates[0]?.id || "openai");
  const [officeTemplateId, setOfficeTemplateId] = useState(officeTemplates[0]?.id || "default-product-team");
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [hermesBaseUrl, setHermesBaseUrl] = useState("http://127.0.0.1:8642/v1");
  const [hermesApiKey, setHermesApiKey] = useState("");
  const [chiefAgentName, setChiefAgentName] = useState("Chief");
  const [allowProfileCreation, setAllowProfileCreation] = useState(false);
  const [allowContextSharing, setAllowContextSharing] = useState(true);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [providerTest, setProviderTest] = useState<ProviderTestResult | null>(null);
  const [hermesTest, setHermesTest] = useState<HermesTestResult | null>(null);
  const [plan, setPlan] = useState<ProvisioningPlan | null>(null);
  const [setupStatus, setSetupStatus] = useState<OfficeSetupStatus>("empty");
  const [busy, setBusy] = useState<"provider" | "hermes" | "plan" | "activate" | null>(null);
  const [formLoaded, setFormLoaded] = useState(false);

  const provider = useMemo(
    () => providerTemplates.find((item) => item.id === providerId) || providerTemplates[0],
    [providerId]
  );
  const officeTemplate = useMemo(
    () => officeTemplates.find((item) => item.id === officeTemplateId) || officeTemplates[0],
    [officeTemplateId]
  );
  const mode: ProvisioningMode =
    userPath === "existing_hermes" ? (allowProfileCreation ? "create_profiles_from_existing" : "connect_existing") : "dry_run";
  const chiefName = chiefAgentName.trim() || "Chief";
  const previewReady = Boolean(plan);
  const accessReady = userPath === "model_key_only" ? Boolean(providerTest?.ok) : Boolean(hermesTest?.ok);

  useEffect(() => {
    try {
      const rawInputs = window.localStorage.getItem(OFFICE_SETUP_INPUTS_STORAGE_KEY);
      const rawSecrets = window.sessionStorage.getItem(OFFICE_SETUP_SECRETS_STORAGE_KEY);
      const rawSession = window.localStorage.getItem(OFFICE_SETUP_SESSION_STORAGE_KEY);
      const rawLegacyDraft = window.localStorage.getItem(LEGACY_OFFICE_DRAFT_STORAGE_KEY);

      const savedInputs = rawInputs ? (JSON.parse(rawInputs) as SavedOfficeSetupInputs) : null;
      const savedSecrets = rawSecrets ? (JSON.parse(rawSecrets) as SavedOfficeSetupSecrets) : null;
      const savedSession = rawSession ? (JSON.parse(rawSession) as OfficeSetupSession) : null;
      const legacyDraft = rawLegacyDraft ? (JSON.parse(rawLegacyDraft) as LegacyOfficeDraft) : null;
      const restoredSession =
        savedSession && isProvisioningStatus(savedSession.status)
          ? savedSession
          : legacyDraft?.savedAt && Array.isArray(legacyDraft.agents)
            ? sessionFromLegacyDraft(legacyDraft)
            : null;

      if (savedInputs?.userPath) setUserPath(savedInputs.userPath);
      if (savedInputs?.providerId && providerTemplates.some((item) => item.id === savedInputs.providerId)) {
        setProviderId(savedInputs.providerId);
      }
      if (savedInputs?.officeTemplateId && officeTemplates.some((item) => item.id === savedInputs.officeTemplateId)) {
        setOfficeTemplateId(savedInputs.officeTemplateId);
      }
      if (typeof savedInputs?.customBaseUrl === "string") setCustomBaseUrl(savedInputs.customBaseUrl);
      if (typeof savedInputs?.hermesBaseUrl === "string") setHermesBaseUrl(savedInputs.hermesBaseUrl);
      if (typeof savedInputs?.chiefAgentName === "string" && savedInputs.chiefAgentName.trim()) {
        setChiefAgentName(savedInputs.chiefAgentName);
      }
      if (typeof savedSecrets?.apiKey === "string") setApiKey(savedSecrets.apiKey);
      if (typeof savedSecrets?.hermesApiKey === "string") setHermesApiKey(savedSecrets.hermesApiKey);

      if (restoredSession) {
        setUserPath(restoredSession.userPath);
        if (restoredSession.providerId && providerTemplates.some((item) => item.id === restoredSession.providerId)) {
          setProviderId(restoredSession.providerId);
        }
        if (officeTemplates.some((item) => item.id === restoredSession.officeTemplateId)) {
          setOfficeTemplateId(restoredSession.officeTemplateId);
        }
        if (typeof restoredSession.hermesBaseUrl === "string") setHermesBaseUrl(restoredSession.hermesBaseUrl);
        if (restoredSession.activation.chiefAgentName.trim()) setChiefAgentName(restoredSession.activation.chiefAgentName);
        setAllowProfileCreation(restoredSession.activation.allowProfileCreation);
        setAllowContextSharing(restoredSession.activation.allowContextSharing);
        setSetupStatus(restoredSession.status);

        if (
          restoredSession.status === "office_previewed" ||
          restoredSession.status === "activation_review" ||
          restoredSession.status === "office_active"
        ) {
          setPlan(planFromSession(restoredSession));
        }

        if (restoredSession.status === "model_ready" || restoredSession.status === "office_previewed") {
          setProviderTest({
            ok: true,
            providerId: restoredSession.providerId || "openai",
            providerName: restoredSession.providerName,
            message: "Model access was checked earlier in this browser session."
          });
        }

        if (
          restoredSession.status === "hermes_ready" ||
          restoredSession.status === "activation_review" ||
          restoredSession.status === "office_active"
        ) {
          setHermesTest({
            ok: true,
            baseUrl: restoredSession.hermesBaseUrl || "http://127.0.0.1:8642/v1",
            models: [],
            canCreateProfiles: restoredSession.activation.allowProfileCreation,
            message: "Hermes access was checked earlier in this browser session.",
            notes: []
          });
        }
      }
    } finally {
      setFormLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!formLoaded) return;

    const savedInputs: SavedOfficeSetupInputs = {
      userPath,
      providerId,
      officeTemplateId,
      customBaseUrl,
      hermesBaseUrl,
      chiefAgentName
    };
    const savedSecrets: SavedOfficeSetupSecrets = {
      apiKey,
      hermesApiKey
    };

    window.localStorage.setItem(OFFICE_SETUP_INPUTS_STORAGE_KEY, JSON.stringify(savedInputs));
    window.sessionStorage.setItem(OFFICE_SETUP_SECRETS_STORAGE_KEY, JSON.stringify(savedSecrets));
  }, [apiKey, chiefAgentName, customBaseUrl, formLoaded, hermesApiKey, hermesBaseUrl, officeTemplateId, providerId, userPath]);

  function fallbackAgents(nextUserPath: ProvisioningUserPath, nextChiefAgentName: string) {
    if (nextUserPath === "existing_hermes") {
      return [
        {
          displayName: nextChiefAgentName,
          role: "Connected Hermes Chief Agent",
          profileName: "existing-hermes",
          isChief: true
        }
      ];
    }

    return [
      {
        displayName: "Office Guide",
        role: "Guided onboarding conversation",
        profileName: "setup-assistant",
        isChief: true
      }
    ];
  }

  function buildSetupSession(nextStatus: OfficeSetupStatus, options?: SessionChangeOptions): OfficeSetupSession {
    const nextChiefAgentName = options?.chiefAgentName?.trim() || chiefName;
    const nextAllowProfileCreation = options?.allowProfileCreation ?? allowProfileCreation;
    const nextAllowContextSharing = options?.allowContextSharing ?? allowContextSharing;
    const nextMode: ProvisioningMode =
      userPath === "existing_hermes" ? (nextAllowProfileCreation ? "create_profiles_from_existing" : "connect_existing") : "dry_run";
    const sessionAgents =
      nextStatus === "office_previewed" || nextStatus === "activation_review" || nextStatus === "office_active"
        ? sessionAgentsFromPlan(plan, fallbackAgents(userPath, nextChiefAgentName))
        : fallbackAgents(userPath, nextChiefAgentName);

    return {
      savedAt: new Date().toISOString(),
      status: nextStatus,
      userPath,
      mode: nextMode,
      providerId: userPath === "model_key_only" ? providerId : undefined,
      providerName: userPath === "model_key_only" ? provider?.name : undefined,
      hermesBaseUrl: userPath === "existing_hermes" ? hermesBaseUrl.trim() : undefined,
      officeTemplateId,
      officeTemplateName: officeTemplate?.name || "Product Team",
      agents: sessionAgents,
      activation: {
        chiefAgentName: userPath === "existing_hermes" ? nextChiefAgentName : "Chief",
        allowProfileCreation: nextAllowProfileCreation,
        allowContextSharing: nextAllowContextSharing,
        confirmedAt: nextStatus === "office_active" ? new Date().toISOString() : undefined
      }
    };
  }

  function saveSetupSession(nextStatus: OfficeSetupStatus, options?: SessionChangeOptions) {
    const session = buildSetupSession(nextStatus, options);
    window.localStorage.setItem(OFFICE_SETUP_SESSION_STORAGE_KEY, JSON.stringify(session));
    window.localStorage.removeItem(LEGACY_OFFICE_DRAFT_STORAGE_KEY);
    setSetupStatus(nextStatus);
    onOfficeSetupSaved?.(session, { close: options?.close });
    return session;
  }

  function clearSetupSession() {
    window.localStorage.removeItem(OFFICE_SETUP_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_OFFICE_DRAFT_STORAGE_KEY);
    setSetupStatus("empty");
    onOfficeSetupSaved?.(null, { close: false });
  }

  function resetForPath(nextPath: ProvisioningUserPath) {
    setUserPath(nextPath);
    setProviderTest(null);
    setHermesTest(null);
    setPlan(null);
    setActivationConfirmed(false);
    clearSetupSession();
  }

  function invalidateSavedProgress(nextStatus: OfficeSetupStatus = "empty") {
    setPlan(null);
    setActivationConfirmed(false);

    if (nextStatus === "empty") {
      clearSetupSession();
      return;
    }

    saveSetupSession(nextStatus, { close: false });
  }

  async function testProvider() {
    setBusy("provider");
    setProviderTest(null);

    try {
      const response = await fetch("/api/provision/provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId,
          apiKey,
          apiBaseUrl: providerId === "custom-openai" ? customBaseUrl : undefined,
          model: provider.defaultModel
        })
      });
      const result = (await response.json()) as ProviderTestResult;
      setProviderTest(result);

      if (result.ok) {
        setHermesTest(null);
        setPlan(null);
        setActivationConfirmed(false);
        saveSetupSession("model_ready", { close: false });
      } else {
        clearSetupSession();
      }
    } finally {
      setBusy(null);
    }
  }

  async function testHermes() {
    setBusy("hermes");
    setHermesTest(null);

    try {
      const response = await fetch("/api/provision/hermes/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: hermesBaseUrl,
          apiKey: hermesApiKey
        })
      });
      const result = (await response.json()) as HermesTestResult;
      setHermesTest(result);

      if (result.ok) {
        setProviderTest(null);
        setPlan(null);
        setActivationConfirmed(false);
        saveSetupSession("hermes_ready", { close: false });
      } else {
        clearSetupSession();
      }
    } finally {
      setBusy(null);
    }
  }

  async function generatePlan() {
    setBusy("plan");

    try {
      const response = await fetch("/api/provision/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userPath,
          mode,
          providerId: userPath === "model_key_only" ? providerId : undefined,
          officeTemplateId,
          hermesBaseUrl: userPath === "existing_hermes" ? hermesBaseUrl : undefined
        })
      });
      const result = (await response.json()) as PlanResponse;
      if (result.ok && result.plan) {
        setPlan(result.plan);
        saveSetupSession("office_previewed", { close: false });
      }
    } finally {
      setBusy(null);
    }
  }

  function enterSetupAssistant() {
    saveSetupSession(previewReady ? "office_previewed" : "model_ready", { close: true });
  }

  function openActivationReview() {
    saveSetupSession("activation_review", { close: false });
  }

  function activateOffice() {
    setBusy("activate");
    saveSetupSession("office_active", { close: true });
    setBusy(null);
  }

  const currentStatusCopy = useMemo(() => {
    if (setupStatus === "office_active") {
      return {
        title: "Office is active",
        body:
          userPath === "existing_hermes"
            ? `${chiefName} is now the active Chief Agent for this office.`
            : "Your onboarding session is active and ready to keep building the office."
      };
    }

    if (setupStatus === "activation_review") {
      return {
        title: "Activation review is open",
        body: "Confirm what Vibe Office may activate or share before the Chief Agent goes online."
      };
    }

    if (setupStatus === "office_previewed") {
      return {
        title: "Office preview is ready",
        body:
          userPath === "model_key_only"
            ? "You can continue in the guided conversation, or adjust the office plan first."
            : "Review the team shape, then move to activation permissions."
      };
    }

    if (setupStatus === "hermes_ready") {
      return {
        title: "Hermes is connected",
        body: "The next step is to preview the office and review activation permissions."
      };
    }

    if (setupStatus === "model_ready") {
      return {
        title: "Model access is ready",
        body: "You can preview the office now, or continue in the guided conversation at any time."
      };
    }

    return {
      title: "Start with access",
      body: "Connect a model provider or an existing Hermes instance first."
    };
  }, [chiefName, setupStatus, userPath]);

  const content = (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.95fr)_minmax(0,1.25fr)] gap-5 overflow-hidden max-lg:grid-cols-1">
      <section className="scrollbar-thin flex min-h-0 flex-col gap-4 overflow-auto pr-1">
        <div className="frost flex flex-1 flex-col rounded-xl p-4">
          <div className="flex min-h-10 shrink-0 items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sm font-bold text-sky-100">
              1
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-50">Set up access</h1>
              <p className="mt-0.5 truncate text-xs text-slate-400">Choose how this office should get its first AI access.</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-slate-300" />
            <h2 className="text-sm font-semibold text-slate-100">Access path</h2>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => resetForPath("model_key_only")}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                userPath === "model_key_only"
                  ? "border-sky-300/45 bg-sky-400/20 text-sky-100"
                  : "border-slate-800 bg-slate-950/22 text-slate-300 hover:border-slate-700"
              }`}
            >
              <KeyRound className="mb-1 h-4 w-4" />
              <span className="block text-sm font-semibold">Use a model provider key</span>
              <span className="block text-xs text-slate-500">Start with a guided conversation</span>
            </button>
            <button
              type="button"
              onClick={() => resetForPath("existing_hermes")}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                userPath === "existing_hermes"
                  ? "border-emerald-300/45 bg-emerald-400/20 text-emerald-100"
                  : "border-slate-800 bg-slate-950/22 text-slate-300 hover:border-slate-700"
              }`}
            >
              <ServerCog className="mb-1 h-4 w-4" />
              <span className="block text-sm font-semibold">Connect an existing Hermes</span>
              <span className="block text-xs text-slate-500">Move toward Chief Agent activation</span>
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {userPath === "model_key_only" ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <FieldLabel>Model provider</FieldLabel>
                  <select
                    value={providerId}
                    onChange={(event) => {
                      setProviderId(event.target.value);
                      setProviderTest(null);
                      invalidateSavedProgress("empty");
                    }}
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none"
                  >
                    {providerTemplates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-slate-500">{provider.setupHint}</p>
                </div>

                {providerId === "custom-openai" ? (
                  <div className="grid gap-1.5">
                    <FieldLabel>Base URL</FieldLabel>
                    <input
                      value={customBaseUrl}
                      onChange={(event) => {
                        setCustomBaseUrl(event.target.value);
                        setProviderTest(null);
                        invalidateSavedProgress("empty");
                      }}
                      placeholder="https://example.com/v1"
                      className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    />
                  </div>
                ) : null}

                <div className="grid gap-1.5">
                  <FieldLabel>Model API key</FieldLabel>
                  <input
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setProviderTest(null);
                      invalidateSavedProgress("empty");
                    }}
                    type="password"
                    placeholder={provider.keyEnvName}
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={testProvider}
                    disabled={busy === "provider"}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Network className="h-4 w-4" />
                    {busy === "provider" ? "Checking" : "Check model key"}
                  </button>
                  {providerTest ? <ResultPill ok={providerTest.ok} label={providerTest.ok ? "Model ready" : "Needs attention"} /> : null}
                </div>
                {providerTest ? <p className="text-xs leading-5 text-slate-500">{providerTest.message}</p> : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <FieldLabel>Hermes address</FieldLabel>
                  <input
                    value={hermesBaseUrl}
                    onChange={(event) => {
                      setHermesBaseUrl(event.target.value);
                      setHermesTest(null);
                      invalidateSavedProgress("empty");
                    }}
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none"
                  />
                </div>
                <div className="grid gap-1.5">
                  <FieldLabel>Hermes access key</FieldLabel>
                  <input
                    value={hermesApiKey}
                    onChange={(event) => {
                      setHermesApiKey(event.target.value);
                      setHermesTest(null);
                      invalidateSavedProgress("empty");
                    }}
                    type="password"
                    placeholder="Bearer token"
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  />
                </div>
                <div className="grid gap-1.5">
                  <FieldLabel>Chief Agent name</FieldLabel>
                  <input
                    value={chiefAgentName}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setChiefAgentName(nextValue);
                      setActivationConfirmed(false);
                      if (setupStatus === "activation_review") {
                        saveSetupSession("activation_review", { close: false, chiefAgentName: nextValue });
                      } else if (setupStatus === "office_active") {
                        saveSetupSession("office_active", { close: false, chiefAgentName: nextValue });
                      }
                    }}
                    placeholder="Chief"
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  />
                  <p className="text-xs leading-5 text-slate-500">This name will be used in the activation review before anything goes live.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={testHermes}
                    disabled={busy === "hermes"}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Network className="h-4 w-4" />
                    {busy === "hermes" ? "Checking" : "Check Hermes"}
                  </button>
                  {hermesTest ? <ResultPill ok={hermesTest.ok} label={hermesTest.ok ? "Hermes ready" : "Needs attention"} /> : null}
                </div>
                {hermesTest ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/24 px-3 py-2 text-xs leading-5 text-slate-500">
                    <p>{hermesTest.message}</p>
                    {hermesTest.models.length ? <p className="truncate">Available model: {hermesTest.models.join(", ")}</p> : null}
                    <p>The next step is an activation review. Vibe Office will not activate or create anything without permission.</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="frost rounded-xl p-4">
          <div className="flex min-h-10 shrink-0 items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sm font-bold text-sky-100">
              2
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-50">Plan your office</h2>
              <p className="mt-0.5 truncate text-xs text-slate-400">Choose the office shape Vibe Office should prepare.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-1.5">
            <FieldLabel>Office style</FieldLabel>
            <select
              value={officeTemplateId}
              onChange={(event) => {
                setOfficeTemplateId(event.target.value);
                const nextStatus = userPath === "model_key_only" ? (providerTest?.ok ? "model_ready" : "empty") : hermesTest?.ok ? "hermes_ready" : "empty";
                invalidateSavedProgress(nextStatus);
              }}
              className="h-9 rounded-lg border border-slate-800 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none"
            >
              {officeTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <p className="line-clamp-2 text-xs leading-5 text-slate-500">{officeTemplate.description}</p>
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/24 px-3 py-3">
            <p className="text-sm font-semibold text-slate-100">{currentStatusCopy.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{currentStatusCopy.body}</p>
          </div>

          <div className="mt-4 shrink-0 border-t border-slate-800/70 pt-4">
            <button
              type="button"
              onClick={generatePlan}
              disabled={!accessReady || busy === "plan"}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              {busy === "plan" ? "Preparing" : "Preview your office"}
            </button>
            {!accessReady ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">Check your access first so Vibe Office can prepare a real next step.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="flex h-full min-h-0 flex-col gap-5">
        <div className="frost flex min-h-0 flex-1 flex-col rounded-xl p-5">
          <div className="flex min-h-10 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sm font-bold text-sky-100">
                3
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-50">Preview your office</h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">Review the office before anything is activated.</p>
              </div>
            </div>
            {previewReady ? <ResultPill ok label="Preview ready" /> : null}
          </div>

          {plan ? (
            <div className="mt-5 grid min-h-0 flex-1">
              <TeamCollaborationMap agents={plan.agents} />
            </div>
          ) : (
            <div className="mt-5 grid min-h-0 flex-1 place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/18 text-center">
              <div className="max-w-sm px-6">
                <ServerCog className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-4 text-sm font-semibold text-slate-200">No office preview yet</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Once access is checked, Vibe Office can preview the office team and show the next real action.
                </p>
              </div>
            </div>
          )}
        </div>

        {(userPath === "model_key_only" && accessReady) || (userPath === "existing_hermes" && previewReady) ? (
          <div className="frost shrink-0 rounded-xl p-4">
            <div className="flex min-h-10 shrink-0 items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sm font-bold text-sky-100">
                4
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-50">
                  {userPath === "model_key_only" ? "Continue guided setup" : "Review activation"}
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  {userPath === "model_key_only"
                    ? "Use your working model key to keep onboarding in a real conversation."
                    : "Confirm exactly what Vibe Office may activate, create, or share."}
                </p>
              </div>
            </div>

            {userPath === "model_key_only" ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">Guided conversation</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    The assistant can help you connect Hermes, prepare a local install, adjust the office template, and explain permissions before anything is installed, written, or activated.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={enterSetupAssistant}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-950 transition hover:bg-white"
                >
                  <Rocket className="h-4 w-4" />
                  {previewReady ? "Continue guide" : "Open guide"}
                </button>
              </div>
            ) : setupStatus === "activation_review" || setupStatus === "office_active" ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/24 px-3 py-3 text-sm text-slate-200">
                  <p className="font-semibold text-slate-100">Activation summary</p>
                  <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-500">
                    <p>Hermes instance: {hermesBaseUrl}</p>
                    <p>Chief Agent: {chiefName}</p>
                    <p>Office style: {officeTemplate.name}</p>
                    <p>Additional office members: {allowProfileCreation ? `${officeTemplate.agents.length - 1} may be created later with permission` : "Not allowed yet"}</p>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/24 p-3">
                  <input
                    type="checkbox"
                    checked={allowProfileCreation}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAllowProfileCreation(checked);
                      setActivationConfirmed(false);
                      saveSetupSession("activation_review", { close: false, allowProfileCreation: checked });
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-100">Vibe Office may create or modify Hermes profiles later</span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      Keep this off if you want to activate only the Chief Agent for now.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/24 p-3">
                  <input
                    type="checkbox"
                    checked={allowContextSharing}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAllowContextSharing(checked);
                      setActivationConfirmed(false);
                      saveSetupSession("activation_review", { close: false, allowContextSharing: checked });
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-100">Vibe Office may share Project Context Hub files with the Chief Agent</span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      This controls whether shared project memory is injected into the active office flow.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-cyan-300/25 bg-cyan-500/8 p-3">
                  <input
                    type="checkbox"
                    checked={activationConfirmed}
                    onChange={(event) => setActivationConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-cyan-100">I approve this activation</span>
                    <span className="mt-0.5 block text-xs leading-4 text-cyan-100/70">
                      Vibe Office may activate {chiefName} as the Chief Agent using the permissions above.
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-2xl text-xs leading-5 text-slate-500">
                    Nothing is activated until you confirm here. If you are not ready yet, keep reviewing or go back and change the connection details.
                  </p>
                  <button
                    type="button"
                    onClick={activateOffice}
                    disabled={!activationConfirmed || busy === "activate"}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Rocket className="h-4 w-4" />
                    {busy === "activate" ? "Activating" : "Activate Chief Agent"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">Chief Agent activation review</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Review the Hermes instance, the Chief Agent identity, profile permissions, and Project Context Hub sharing before anything goes live.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openActivationReview}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-950 transition hover:bg-white"
                >
                  <Rocket className="h-4 w-4" />
                  Review activation
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );

  if (embedded) {
    return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl">{content}</section>;
  }

  return <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-8 py-7 max-md:px-5">{content}</main>;
}
