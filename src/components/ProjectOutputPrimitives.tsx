import { ArrowRight, Globe2 } from "lucide-react";
import type { ReactNode } from "react";

export function OutputIndexButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button className={`output-agent-button ${active ? "active" : ""}`} onClick={onClick} type="button">
      <strong>{label}</strong>
      <span>{meta}</span>
    </button>
  );
}

export function OutputTypeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`output-type-button ${active ? "active" : ""}`} onClick={onClick} role="tab" aria-selected={active} type="button">
      {label}
    </button>
  );
}

export function OutputSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  return (
    <section className="output-section" aria-label={title}>
      <div className="output-section-heading">
        <h4>{title}</h4>
        <span>{count}</span>
      </div>
      {children}
    </section>
  );
}

export function PreviewOutputSection({
  hasPreview,
  previewUrl,
  onShowBrowser,
}: {
  hasPreview: boolean;
  previewUrl: string;
  onShowBrowser: () => void;
}) {
  return (
    <OutputSection title="Preview" count={hasPreview ? 1 : 0}>
      {hasPreview ? (
        <button className="preview-output-row" onClick={onShowBrowser} type="button">
          <Globe2 size={16} />
          <span>
            <strong>Browser preview</strong>
            <small>{previewUrl}</small>
          </span>
          <ArrowRight size={15} />
        </button>
      ) : (
        <div className="inline-empty">No browser preview opened yet.</div>
      )}
    </OutputSection>
  );
}
