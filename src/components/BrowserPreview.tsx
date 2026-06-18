import { ArrowLeft, ArrowRight, ExternalLink, Globe2, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";

export function BrowserPreview({
  browserUrl,
  previewUrl,
  onBrowserUrlChange,
  onOpenPreview,
}: {
  browserUrl: string;
  previewUrl: string;
  onBrowserUrlChange: (value: string) => void;
  onOpenPreview: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasPreview = previewUrl.length > 0;
  const canEmbed = previewUrl.startsWith("http://localhost") || previewUrl.startsWith("http://127.0.0.1");

  return (
    <div className="browser-workspace">
      <form className="browser-toolbar" id="browser-url-form" onSubmit={onOpenPreview}>
        <button type="button" className="icon-button" aria-label="Go back">
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Go forward">
          <ArrowRight size={16} />
        </button>
        <button type="submit" className="icon-button" aria-label="Refresh preview">
          <RefreshCw size={16} />
        </button>
        <label className="url-input">
          <input
            aria-label="Preview URL"
            value={browserUrl}
            onChange={(event) => onBrowserUrlChange(event.target.value)}
            placeholder="Open URL"
          />
        </label>
        <a className="icon-button" href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open externally">
          <ExternalLink size={16} />
        </a>
      </form>

      <div className="browser-frame">
        {!hasPreview ? (
          <div className="empty-state">
            <Globe2 size={32} />
            <button className="secondary-button" type="submit" form="browser-url-form">
              Open URL
            </button>
          </div>
        ) : canEmbed ? (
          <iframe title="Browser preview" src={previewUrl} />
        ) : (
          <div className="empty-state">
            <Globe2 size={32} />
            <a className="secondary-button" href={previewUrl} target="_blank" rel="noreferrer">
              Open external
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
