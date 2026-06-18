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

export async function listWorkspaceFiles(root: string, path = "") {
  return workspaceRequest<WorkspaceFileListResult>("/workspace-local/list", { root, path });
}

export async function readWorkspaceFile(root: string, path: string) {
  return workspaceRequest<WorkspaceFileReadResult>("/workspace-local/read", { root, path });
}

export async function searchWorkspaceFiles(root: string, query: string) {
  return workspaceRequest<WorkspaceFileSearchResult>("/workspace-local/search", { root, query });
}

export function mediaFileUrl(path: string) {
  return `/workspace-local/media?path=${encodeURIComponent(path)}`;
}

async function workspaceRequest<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Workspace file request failed.");
  }

  return body as T;
}
