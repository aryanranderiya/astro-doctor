import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-document-in-frontmatter",
  category: "Correctness",
  severity: "error",
  description:
    "Frontmatter (---) runs on the server at build/request time. document/window/localStorage throw or mismatch. Use a client <script> or island instead.",
};

// Unambiguous browser globals — bare mention is almost certainly real usage.
const STRICT_RE =
  /\b(document|window|navigator|localStorage|sessionStorage|matchMedia|IntersectionObserver|requestAnimationFrame)\b/g;
// Ambiguous words that are also common prop names (location, history) — only
// flag actual global access: `location.href`, `history.back()`, etc.
const DOT_RE = /\b(location|history)\s*(\.|\[)/g;

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const code = stripCodeNoise(
    frontmatter.replace(/^\s*import[^\n]*$/gm, (m) => " ".repeat(m.length))
  );
  const diagnostics = [];
  const push = (name, idx) => {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `'${name}' in frontmatter runs on the server and will throw at build/SSR. Move browser access into a client <script> (astro:page-load) or a client:* island.`,
      snippet: snippetOf(source, idx),
    });
  };
  let m;
  while ((m = STRICT_RE.exec(code)) !== null) push(m[1], m.index);
  while ((m = DOT_RE.exec(code)) !== null) push(m[1], m.index);
  return diagnostics;
}
