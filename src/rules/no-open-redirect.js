import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-open-redirect",
  category: "Security",
  severity: "error",
  description:
    "Astro.redirect() to a request-controlled URL is an open redirect (phishing). Only redirect to same-origin paths or an allowlist.",
};

const REDIRECT_RE = /Astro\s*\.\s*redirect\s*\(\s*([^,)]+)(?:\s*,[^)]*)?\)/g;
const TAINT_RE = /\b(searchParams|Astro\.params|params\.get|request\.|cookies|locals)\b/;
const STRONG_GUARD_RE = /allowlist|allowedPaths|allowed\s*:|new URL\(.*Astro\.url/;
const SLASH_GUARD_RE = /startsWith\s*\(\s*["']\/["']/;
const NOSLASHSLASH_RE = /!\s*\w[\w.()]*\.startsWith\s*\(\s*["']\/\//;

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter || !frontmatter.includes("Astro.redirect")) return [];
  const diagnostics = [];
  let m;
  while ((m = REDIRECT_RE.exec(frontmatter)) !== null) {
    const target = (m[1] || "").trim();
    if (!TAINT_RE.test(target)) continue;
    // Same-origin by construction: `"/..."`, `'/...'`, `` `/...` `` — the
    // leading slash pins it to this origin (no protocol/host control).
    if (/^[`'"]\//.test(target)) continue;
    // look back ~400 chars for a same-origin guard
    const ctx = frontmatter.slice(Math.max(0, m.index - 400), m.index + target.length + 100);
    if (STRONG_GUARD_RE.test(ctx)) continue;
    if (SLASH_GUARD_RE.test(ctx)) {
      // startsWith('/') alone still allows protocol-relative `//evil.com`.
      if (NOSLASHSLASH_RE.test(ctx)) continue;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "warning",
        file,
        line: lineOf(source, m.index),
        message: `Astro.redirect(${target.trim().slice(0, 40)}…) checks startsWith('/') but still allows protocol-relative '//evil.com' — also require !x.startsWith('//') or an allowlist.`,
        snippet: snippetOf(source, m.index),
      });
      continue;
    }
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, m.index),
      message: `Astro.redirect(${target.trim().slice(0, 40)}…) uses request input — open redirect. Validate same-origin (startsWith('/') && !startsWith('//')) or an allowlist before redirecting.`,
      snippet: snippetOf(source, m.index),
    });
  }
  return diagnostics;
}
