import { useState } from "react";
import type { A2ACompatibilityMetadata } from "./providerTypes";

export type ConnectionTestState = "idle" | "running" | "passed" | "failed";

export function useAgentSetupDialogState() {
  const [showSetup, setShowSetup] = useState(false);
  const [setupAgentId, setSetupAgentId] = useState<string | null>(null);
  const [setupDraftAgentId, setSetupDraftAgentId] = useState<string | null>(null);
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [lastConnectionMetadata, setLastConnectionMetadata] = useState<A2ACompatibilityMetadata | null>(null);
  const [isSavingAgent, setIsSavingAgent] = useState(false);

  function resetConnectionTest() {
    if (testState !== "idle") {
      setTestState("idle");
    }
    setTestMessage("");
    setLastConnectionMetadata(null);
  }

  function closeSetup() {
    setShowSetup(false);
    setSetupAgentId(null);
    setSetupDraftAgentId(null);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
  }

  function openAddAgentDialog() {
    setSetupAgentId(null);
    setSetupDraftAgentId(`agent-${Date.now()}`);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
    setShowSetup(true);
  }

  function openAgentEditor(agentId: string) {
    setSetupAgentId(agentId);
    setSetupDraftAgentId(null);
    setTestState("idle");
    setTestMessage("");
    setLastConnectionMetadata(null);
    setShowSetup(true);
  }

  function markConnectionRunning() {
    setTestState("running");
    setTestMessage("");
  }

  function markConnectionFailed(message: string) {
    setTestState("failed");
    setLastConnectionMetadata(null);
    setTestMessage(message);
  }

  function markConnectionPassed(metadata: A2ACompatibilityMetadata, message: string) {
    setTestState("passed");
    setLastConnectionMetadata(metadata);
    setTestMessage(message);
  }

  return {
    closeSetup,
    isSavingAgent,
    lastConnectionMetadata,
    markConnectionFailed,
    markConnectionPassed,
    markConnectionRunning,
    openAddAgentDialog,
    openAgentEditor,
    resetConnectionTest,
    setIsSavingAgent,
    setupAgentId,
    setupDraftAgentId,
    showSetup,
    testMessage,
    testState,
  };
}
