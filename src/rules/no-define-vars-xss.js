import { lineOf, snippetOf, maskTemplate, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-define-vars-xss",
  category: "Security",
  severity: "error",
  description:
    "define:vars serializes values into a <script> via JSON.stringify with a case-sensitive </script> filter (CVE-2026-41067 class). Never pass request-derived data through it — use data-* attributes + textContent.",
};

const TAINT_RE = /\b(searchParams|Astro\.params|Astro\.cookies|cookies\.get|Astro\.request|locals)\b/;

export function check(file, source) {
  const clean = maskTemplate(source);
  if (!clean.includes("define:vars")) return [];
  const { frontmatter } = splitFrontmatter(source);
  const tainted = TAINT_RE.test(frontmatter) || TAINT_RE.test(source);
  if (!tainted) return [];
  const diagnostics = [];
  for (const m of clean.matchAll(/<script\b[^>]*\bdefine:vars\b[^>]*>/gi)) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, m.index ?? 0),
      message: `<script define:vars> receives request-derived data (searchParams/cookies/params). The </script> escaping is bypassable — pass via <div data-x={...}> + dataset/textContent instead, or only pass static values.`,
      snippet: snippetOf(source, m.index ?? 0),
    });
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
