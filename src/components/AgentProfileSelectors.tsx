import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getOfficeRoleLabel, OFFICE_ROLE_OPTIONS } from "../domain/agentProfile";
import type { AgentOfficeRole } from "../domain/types";
import { AgentSetupFieldLabel } from "./AgentSetupFieldLabel";

export function CapabilityTagSelector({ options, selectedTags }: { options: string[]; selectedTags: string[] }) {
  const [currentTags, setCurrentTags] = useState(selectedTags);
  const selectedSummary = currentTags.length > 0 ? currentTags.join(", ") : "Select capabilities";

  useEffect(() => {
    setCurrentTags(selectedTags);
  }, [selectedTags]);

  function toggleTag(tag: string, checked: boolean) {
    setCurrentTags((current) => (checked ? Array.from(new Set([...current, tag])) : current.filter((item) => item !== tag)));
  }

  return (
    <div className="capability-selector" role="group" aria-label="Capability tags">
      <AgentSetupFieldLabel help="For filtering and your own reference only." label="Capability tags" />
      <details className="capability-select">
        <summary>
          <span className="selected-capabilities">{selectedSummary}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options">
          {options.map((tag) => (
            <label className="capability-option" key={tag}>
              <input
                checked={currentTags.includes(tag)}
                name="tags"
                type="checkbox"
                value={tag}
                onChange={(event) => toggleTag(tag, event.currentTarget.checked)}
              />
              <span>{tag}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function OfficeRoleSelector({ selectedRole }: { selectedRole?: AgentOfficeRole }) {
  const [currentRole, setCurrentRole] = useState<AgentOfficeRole | "">(selectedRole ?? "");
  const selectedLabel = currentRole ? getOfficeRoleLabel(currentRole) : "Select role";

  useEffect(() => {
    setCurrentRole(selectedRole ?? "");
  }, [selectedRole]);

  function selectRole(role: AgentOfficeRole, details: HTMLElement | null) {
    setCurrentRole(role);
    details?.removeAttribute("open");
  }

  return (
    <div className="office-role-selector">
      <AgentSetupFieldLabel help="Office identity for routing and your own organization." label="Office role" />
      <details className="capability-select single-select">
        <summary>
          <span className="selected-capabilities">{selectedLabel}</span>
          <ChevronDown size={16} />
        </summary>
        <div className="capability-options role-options">
          {OFFICE_ROLE_OPTIONS.map((option) => (
            <label className="capability-option role-option" key={option.value}>
              <input
                checked={currentRole === option.value}
                name="officeRole"
                required
                type="radio"
                value={option.value}
                onChange={(event) => selectRole(option.value, event.currentTarget.closest("details"))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
