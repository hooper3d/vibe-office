import type { AgentOfficeRole } from "./types";

export const NON_CAPABILITY_TAGS = ["local", "hermes", "runtime"];

export const CAPABILITY_TAG_OPTIONS = [
  "drafts",
  "releases",
  "summaries",
  "editing",
  "artifacts",
  "browser",
  "code",
  "planning",
];

export const OFFICE_ROLE_OPTIONS: Array<{ label: string; value: AgentOfficeRole }> = [
  { label: "Chief", value: "chief" },
  { label: "Builder", value: "builder" },
  { label: "Writer", value: "writer" },
  { label: "Operator", value: "operator" },
];

export function getOfficeRoleLabel(role?: AgentOfficeRole, isChief?: boolean) {
  const value = role ?? (isChief ? "chief" : "operator");
  return OFFICE_ROLE_OPTIONS.find((option) => option.value === value)?.label ?? "Operator";
}
