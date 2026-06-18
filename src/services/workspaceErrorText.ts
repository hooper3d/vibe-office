export function getUserFacingWorkspaceError(error: unknown, fallback: string) {
  return sanitizeWorkspaceErrorText(error instanceof Error ? error.message : fallback, fallback);
}

export function sanitizeWorkspaceErrorText(text: string, fallback = "Workspace file request failed.") {
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  if (/failed to fetch|networkerror|network request failed/i.test(trimmed)) {
    return "Workspace file service is not reachable. Check the local trusted layer, then retry.";
  }

  if (/project directory is not available|root.*required|directory.*required/i.test(trimmed)) {
    return "Project folder is not available. Bind a local folder, then retry.";
  }

  if (/not found|enoent|404/i.test(trimmed)) {
    return "Workspace file was not found. Refresh the file list, then retry.";
  }

  if (/permission|access denied|eperm|eacces|forbidden|403/i.test(trimmed)) {
    return "Workspace file access was denied. Check folder permissions, then retry.";
  }

  if (/outside|scope|allowed/i.test(trimmed)) {
    return "Workspace file is outside the bound project folder.";
  }

  return trimmed;
}
