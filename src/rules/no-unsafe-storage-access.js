import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-unsafe-storage-access",
  category: "Correctness",
  severity: "warning",
  description:
    "localStorage/sessionStorage access throws (SecurityError) when storage is blocked — an unguarded read in a head script kills the whole block (theme stuck, no fallback). Wrap in try/catch with defaults.",
};

function tryRanges(code) {
  // Ranges of `try { ... }` bodies via brace balance (code must be
  // string/comment-stripped so braces in prose don't count).
  const ranges = [];
  for (const m of code.matchAll(/\btry\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") {
        depth--;
        if (depth === 0) {
          ranges.push([m.index, i]);
          break;
        }
      }
    }
  }
  return ranges;
}

export function check(file, source) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  const diagnostics = [];
  for (const m of body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const js = m[2] || "";
    if (!/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)\b/.test(js)) continue;
    const blockStart = frontmatterEnd + (m.index ?? 0) + m[0].indexOf(js);
    const stripped = stripCodeNoise(js);
    const ranges = tryRanges(stripped);
    const inTry = (off) => ranges.some(([s, e]) => off >= s && off <= e);
    for (const s of stripped.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)\b/g)) {
      if (inTry(s.index ?? 0)) continue;
      const idx = blockStart + (s.index ?? 0);
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `${s[1]}.${s[2]}() outside try/catch — throws when storage is blocked and kills the enclosing script. Wrap with a safe helper (try/catch + default value).`,
        snippet: snippetOf(source, idx),
      });
      if (diagnostics.length >= 6) return diagnostics;
    }
  }
  return diagnostics;
}
