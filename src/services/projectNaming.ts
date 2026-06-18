export function slugifyProjectName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `project-${Date.now()}`;
}

export function deriveProjectNameFromDirectory(directory: string) {
  return (
    directory
      .trim()
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() ?? ""
  );
}
