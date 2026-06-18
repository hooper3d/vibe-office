export type WorkspaceFileEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  size?: number;
  updatedAt?: string;
};

export type WorkspaceFileListResult = {
  rootName: string;
  path: string;
  parentPath?: string;
  entries: WorkspaceFileEntry[];
};

export type WorkspaceFileReadResult = {
  path: string;
  content: string;
  size: number;
  updatedAt?: string;
  truncated: boolean;
};

export type WorkspaceFileSearchMatch = {
  path: string;
  lineNumber: number;
  preview: string;
};

export type WorkspaceFileSearchResult = {
  query: string;
  matches: WorkspaceFileSearchMatch[];
  truncated: boolean;
};

export type WorkspaceFileAttachment = {
  path: string;
  content: string;
  size: number;
  updatedAt?: string;
  attachedAt: string;
};

export type LocalTrustedWorkspaceCommand =
  | {
      command: "workspace.list";
      payload: {
        root: string;
        path?: string;
      };
    }
  | {
      command: "workspace.read";
      payload: {
        root: string;
        path: string;
      };
    }
  | {
      command: "workspace.search";
      payload: {
        root: string;
        query: string;
      };
    };

export async function listWorkspaceFiles(root: string, path = "") {
  return workspaceCommand<WorkspaceFileListResult>({
    command: "workspace.list",
    payload: { root, path },
  });
}

export async function readWorkspaceFile(root: string, path: string) {
  return workspaceCommand<WorkspaceFileReadResult>({
    command: "workspace.read",
    payload: { root, path },
  });
}

export async function searchWorkspaceFiles(root: string, query: string) {
  return workspaceCommand<WorkspaceFileSearchResult>({
    command: "workspace.search",
    payload: { root, query },
  });
}

export function mediaFileUrl(path: string) {
  return `/workspace-local/media?path=${encodeURIComponent(path)}`;
}

export function createLocalTrustedWorkspaceCommandRequest(command: LocalTrustedWorkspaceCommand): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  };
}

async function workspaceCommand<T>(command: LocalTrustedWorkspaceCommand): Promise<T> {
  const response = await fetch("/workspace-local/command", createLocalTrustedWorkspaceCommandRequest(command));

  const body = (await response.json().catch(() => ({}))) as { error?: string | { message?: string } };
  if (!response.ok) {
    throw new Error(getWorkspaceCommandErrorMessage(body) || "Workspace file request failed.");
  }

  return body as T;
}

function getWorkspaceCommandErrorMessage(body: { error?: string | { message?: string } }) {
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error.message === "string") return body.error.message;
  return "";
}
