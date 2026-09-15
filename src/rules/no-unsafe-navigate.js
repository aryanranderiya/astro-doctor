import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-unsafe-navigate",
  category: "Security",
  severity: "error",
  description:
    "navigate() performs no sanitization (docs: ?redirect=javascript:… executes). Only navigate to same-origin paths or an allowlist — never raw query input.",
};

const NAVIGATE_RE = /(?<![\w$.])navigate\s*\(\s*([^,)]+)(?:\s*,[^)]*)?\)/g;
const TAINT_RE = /\b(searchParams|location\.search|Astro\.params|params\.get|input\.value|query)\b/;
const GUARD_RE = /startsWith\s*\(\s*["']\/["']|allowlist|allowedPaths|includes\s*\(/;

export function check(file, source) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  // Self-closing <script … /> tags carry no body — blank them so the
  // body matcher below cannot pair them with a later </script>.
  const code = body.replace(/<script\b[^>]*\/\s*>/gi, (m) => " ".repeat(m.length));
  const diagnostics = [];
  for (const m of code.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const js = m[2] || "";
    const jsOff = frontmatterEnd + (m.index ?? 0) + m[0].indexOf(js);
    NAVIGATE_RE.lastIndex = 0;
    let n;
    while ((n = NAVIGATE_RE.exec(js)) !== null) {
      const target = n[1] || "";
      if (!TAINT_RE.test(target)) continue;
      const ctx = js.slice(Math.max(0, n.index - 400), n.index + target.length + 100);
      if (GUARD_RE.test(ctx)) continue;
      const idx = jsOff + n.index;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `navigate(${target.trim().slice(0, 40)}…) uses request/input data — navigate() does not sanitize (javascript: URLs execute). Allowlist paths or enforce same-origin before navigating.`,
        snippet: snippetOf(source, idx),
      });
      if (diagnostics.length >= 3) break;
    }
    NAVIGATE_RE.lastIndex = 0;
  }
  return diagnostics;
}
