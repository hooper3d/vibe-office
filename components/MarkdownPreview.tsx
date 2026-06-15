"use client";

import { useMemo, type ReactNode } from "react";

type MarkdownPreviewProps = {
  content: string;
  className?: string;
};

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: Array<{ marker: string; text: string; depth: number }> }
  | { type: "table"; rows: string[][]; header: boolean }
  | { type: "code"; language?: string; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "space" };

function isSafeHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("/") || href.startsWith("#");
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableRow(line: string) {
  return line.includes("|") && splitTableRow(line).length > 1;
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push({ type: "space" });
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const codeFence = trimmed.match(/^```(\S*)/);
    if (codeFence) {
      const language = codeFence[1] || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language, text: codeLines.join("\n") });
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "heading", level: 4, text: trimmed.slice(4) });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "heading", level: 3, text: trimmed.slice(3) });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "heading", level: 2, text: trimmed.slice(2) });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (isTableRow(trimmed) && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) {
      const rows = [splitTableRow(trimmed)];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", rows, header: true });
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: Array<{ marker: string; text: string; depth: number }> = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!itemMatch) break;
        const marker = itemMatch[2];
        const itemOrdered = /\d+\./.test(marker);
        if (itemOrdered !== ordered) break;
        items.push({
          marker,
          text: itemMatch[3],
          depth: Math.min(Math.floor(itemMatch[1].length / 2), 3)
        });
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (
        !next ||
        next.startsWith("# ") ||
        next.startsWith("## ") ||
        next.startsWith("### ") ||
        next.startsWith("```") ||
        next.startsWith(">") ||
        /^---+$/.test(next) ||
        lines[index].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/) ||
        (isTableRow(next) && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim()))
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
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
        <code key={key} className="markdown-inline-code">
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
          <a key={key} href={href} target="_blank" rel="noreferrer">
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
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={`markdown-preview ${className}`}>
      {blocks.map((block, index) => {
        if (block.type === "space") return <div key={index} className="markdown-space" />;
        if (block.type === "hr") return <hr key={index} />;
        if (block.type === "heading" && block.level === 2) return <h2 key={index}>{renderInlineMarkdown(block.text)}</h2>;
        if (block.type === "heading" && block.level === 3) return <h3 key={index}>{renderInlineMarkdown(block.text)}</h3>;
        if (block.type === "heading") return <h4 key={index}>{renderInlineMarkdown(block.text)}</h4>;
        if (block.type === "quote") return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
        if (block.type === "code") {
          return (
            <pre key={index} className="markdown-code-block">
              {block.language ? <span className="markdown-code-language">{block.language}</span> : null}
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          return (
            <div key={index} className="markdown-list">
              {block.items.map((item, itemIndex) => (
                <div key={`${item.marker}-${itemIndex}`} className="markdown-list-row" style={{ paddingLeft: `${item.depth * 1.1}rem` }}>
                  <span className="markdown-list-marker">{block.ordered ? item.marker : "-"}</span>
                  <span>{renderInlineMarkdown(item.text)}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === "table") {
          const [headerRow, ...bodyRows] = block.rows;
          return (
            <div key={index} className="markdown-table-wrap">
              <table>
                {block.header ? (
                  <thead>
                    <tr>
                      {headerRow.map((cell, cellIndex) => (
                        <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {(block.header ? bodyRows : block.rows).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
