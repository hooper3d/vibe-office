import { CircleHelp } from "lucide-react";

export function AgentSetupFieldLabel({ help, label }: { help: string; label: string }) {
  return (
    <span className="field-label">
      {label}
      <span className="field-help" tabIndex={0} title={help} aria-label={help}>
        <CircleHelp size={13} />
      </span>
    </span>
  );
}
