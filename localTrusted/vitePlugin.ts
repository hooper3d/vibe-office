import type { Plugin, ViteDevServer } from "vite";
import {
  getVerifiedTrustedAgentRecord,
  getLocalTrustedAgent,
  readLocalTrustedAgentRegistry,
  writeLocalTrustedAgentRegistry,
} from "./agentRegistry";
import {
  assertProviderTargetBelongsToAgent,
  getVerifiedProviderCommandRequest,
  getVerifiedProviderRequest,
  injectLocalTrustedCredential,
} from "./providerRequests";
import { readGeneratedMedia } from "./generatedMedia";
import {
  forwardProviderRequest,
  getSafeErrorMessage,
  readJsonBody,
  sendBinary,
  sendJson,
} from "./http";
import {
  listWorkspaceDirectory,
  readWorkspaceTextFile,
  searchWorkspaceFiles,
} from "./workspaceFiles";

export function localTrustedLayerPlugin(): Plugin {
  return {
    name: "vibe-office-local-workspace-file-layer",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/agent-local/agents/upsert", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const agent = getVerifiedTrustedAgentRecord(body.agent);
          const registry = await readLocalTrustedAgentRegistry();
          const existing = registry[agent.id];
          registry[agent.id] = {
            ...existing,
            ...agent,
            apiKey: agent.apiKey ?? existing?.apiKey,
          };
          await writeLocalTrustedAgentRegistry(registry);
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/agent-local/agents/delete", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local agent registry requests." });

        try {
          const body = await readJsonBody(req);
          const agentId = String(body.agentId || "").trim();
          if (!agentId) throw new Error("Agent id is required.");
          const registry = await readLocalTrustedAgentRegistry();
          delete registry[agentId];
          await writeLocalTrustedAgentRegistry(registry);
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/agent-local/command", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local provider commands." });

        try {
          const body = await readJsonBody(req);
          const providerRequest = await getVerifiedProviderCommandRequest(body);
          await forwardProviderRequest(res, providerRequest);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/agent-local/request", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for local provider requests." });

        try {
          const body = await readJsonBody(req);
          const providerRequest = getVerifiedProviderRequest(body);
          const trustedAgent = providerRequest.agentId ? await getLocalTrustedAgent(providerRequest.agentId) : undefined;
          if (trustedAgent) {
            assertProviderTargetBelongsToAgent(providerRequest.url, trustedAgent);
            injectLocalTrustedCredential(providerRequest.headers, trustedAgent);
          }
          await forwardProviderRequest(res, providerRequest);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/list", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const result = await listWorkspaceDirectory(String(body.root || ""), String(body.path || ""));
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/read", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const result = await readWorkspaceTextFile(String(body.root || ""), String(body.path || ""));
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });

      server.middlewares.use("/workspace-local/search", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST for workspace file requests." });

        try {
          const body = await readJsonBody(req);
          const result = await searchWorkspaceFiles(String(body.root || ""), String(body.query || ""));
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
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
          sendJson(res, 400, { error: getSafeErrorMessage(error) });
        }
      });
    },
  };
}
