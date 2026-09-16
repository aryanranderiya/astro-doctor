import { lineOf, snippetOf, maskTemplate, splitFrontmatter, eachBodyScript } from "../utils.js";

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
  eachBodyScript(source, ({ attrs, tagStart }) => {
    if (!/\bdefine:vars\b/.test(attrs)) return;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, tagStart),
      message: `<script define:vars> receives request-derived data (searchParams/cookies/params). The </script> escaping is bypassable — pass via <div data-x={...}> + dataset/textContent instead, or only pass static values.`,
      snippet: snippetOf(source, tagStart),
    });
  });
  return diagnostics.slice(0, 3);
}
