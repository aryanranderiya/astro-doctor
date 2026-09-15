import path from "node:path";
import { lineOf, snippetOf } from "../utils.js";

export const meta = {
  name: "astro/no-untracked-todo",
  category: "Maintainability",
  severity: "warning",
  description:
    "TODO/FIXME without an issue link rots — convert to a tracked task or link it (TODO(#123), TODO: https://…). Prose and Markdown are excluded.",
};

const TODO_RE = /\b(TODO|FIXME)\b(?!\s*:\s*https?:)(?!\s*\(#\d+\))/g;
const LINKED_RE = /(TODO|FIXME)\s*(\(\s*#\d+\s*\)|:\s*https?:)/;

export function checkAll(files, read) {
  const diagnostics = [];
  for (const file of files) {
    const ext = path.extname(file);
    if (![".astro", ".tsx", ".ts", ".jsx", ".mjs", ".js"].includes(ext)) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    let m;
    TODO_RE.lastIndex = 0;
    while ((m = TODO_RE.exec(source)) !== null) {
      // Link must be on the SAME match (same line) — never bleed into neighbors.
      const lineEnd = source.indexOf("\n", m.index);
      const ctx = source.slice(m.index, lineEnd === -1 ? m.index + 80 : lineEnd);
      if (LINKED_RE.test(ctx)) continue;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, m.index),
        message: `Untracked ${m[1]} — convert to a tracked issue/task or link it (${m[1]}(#123)). Unlinked TODOs rot silently.`,
        snippet: snippetOf(source, m.index),
      });
      if (diagnostics.length >= 10) return diagnostics;
    }
  }
  return diagnostics;
}
