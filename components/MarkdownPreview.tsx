"use client";

import { useMemo, type ReactNode } from "react";

type MarkdownPreviewProps = {
  content: string;
  className?: string;
};

function isSafeHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("/") || href.startsWith("#");
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-slate-950/70 px-1 py-0.5 text-[0.92em] text-cyan-100">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = link?.[1] || token;
      const href = link?.[2] || "";
      nodes.push(
        isSafeHref(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-cyan-300 underline-offset-4 hover:underline">
            {label}
          </a>
        ) : (
          label
        )
      );
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

export function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  const lines = useMemo(() => content.split(/\r?\n/), [content]);

  return (
    <div className={`markdown-preview ${className}`}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-3" />;
        if (/^---+$/.test(trimmed)) return <hr key={index} />;
        if (trimmed.startsWith("### ")) return <h4 key={index}>{renderInlineMarkdown(trimmed.slice(4))}</h4>;
        if (trimmed.startsWith("## ")) return <h3 key={index}>{renderInlineMarkdown(trimmed.slice(3))}</h3>;
        if (trimmed.startsWith("# ")) return <h2 key={index}>{renderInlineMarkdown(trimmed.slice(2))}</h2>;
        if (trimmed.startsWith("- ")) {
          return (
            <p key={index} className="markdown-list-item">
              <span className="text-slate-500">- </span>
              {renderInlineMarkdown(trimmed.slice(2))}
            </p>
          );
        }

        const ordered = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (ordered) {
          return (
            <p key={index} className="markdown-list-item">
              <span className="text-slate-500">{ordered[1]} </span>
              {renderInlineMarkdown(ordered[2])}
            </p>
          );
        }

        if (trimmed.startsWith("```")) {
          return (
            <p key={index} className="font-mono text-slate-500">
              {trimmed}
            </p>
          );
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}
