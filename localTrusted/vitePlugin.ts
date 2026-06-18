import type { Plugin, ViteDevServer } from "vite";
import { executeAgentRegistryCommand } from "./agentRegistryCommands";
import {
  getVerifiedProviderCommandRequest,
} from "./providerRequests";
import { readGeneratedMedia } from "./generatedMedia";
import {
  forwardProviderRequest,
  readJsonBody,
  sendBinary,
  sendJson,
  sendSafeError,
} from "./http";
import {
  executeWorkspaceCommand,
} from "./workspaceFiles";

export function localTrustedLayerPlugin(): Plugin {
  return {
    name: "vibe-office-local-workspace-file-layer",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/agent-local/agents/upsert", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const result = await executeAgentRegistryCommand({ command: "agent.upsert", payload: body });
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendSafeError(res, 400, error, "Local agent registry request failed.");
        }
      });

      server.middlewares.use("/agent-local/agents/delete", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const result = await executeAgentRegistryCommand({ command: "agent.delete", payload: body });
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendSafeError(res, 400, error, "Local agent registry request failed.");
        }
      });

      server.middlewares.use("/agent-local/agents/status", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent status requests." });

        try {
          const body = await readJsonBody(req);
          const result = await executeAgentRegistryCommand({ command: "agent.status", payload: body });
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendSafeError(res, 400, error, "Local agent status request failed.");
        }
      });

      server.middlewares.use("/agent-local/registry-command", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry commands." });

        try {
          const body = await readJsonBody(req);
          const result = await executeAgentRegistryCommand(body);
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendSafeError(res, 400, error, "Local agent registry command failed.");
        }
      });

      server.middlewares.use("/agent-local/command", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local provider commands." });

        try {
          const body = await readJsonBody(req);
          const providerRequest = await getVerifiedProviderCommandRequest(body);
          await forwardProviderRequest(res, providerRequest);
        } catch (error) {
          sendSafeError(res, 400, error, "Local provider command failed.");
        }
      });

      server.middlewares.use("/workspace-local/command", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file commands." });

        try {
          const body = await readJsonBody(req);
          const result = await executeWorkspaceCommand(body);
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendSafeError(res, 400, error, "Workspace file request failed.");
        }
      });

      server.middlewares.use("/workspace-local/media", async (req, res) => {
        if (req.method !== "GET") return sendJson(res, 405, { error: "Use GET for workspace media requests." });

        try {
          const result = await readGeneratedMedia(req.url || "/");
          if (result.kind === "json") {
            return sendJson(res, result.status, result.body);
          }
          sendBinary(res, result.status, result.body, result.contentType);
        } catch (error) {
          sendSafeError(res, 400, error, "Workspace media request failed.");
        }
      });
    },
  };
}
