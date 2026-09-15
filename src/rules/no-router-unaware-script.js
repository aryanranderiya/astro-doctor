import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-router-unaware-script",
  category: "Correctness",
  severity: "error",
  description:
    "With ClientRouter, DOMContentLoaded fires only on the first load — scripts that bind on it silently stop working after client-side navigation. Bind on astro:page-load (or guard with document.readyState).",
};

export function check(file, source) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  const diagnostics = [];
  // Per <script> block (opening tag may carry is:inline/src — inspect body).
  for (const m of body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const js = m[2] || "";
    if (!js.includes("DOMContentLoaded")) continue;
    if (/astro:(page-load|after-swap)/.test(js)) continue; // router-aware
    if (/readyState/.test(js)) continue; // runs immediately when already loaded
    const idx = frontmatterEnd + (m.index ?? 0) + m[0].indexOf("DOMContentLoaded");
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `DOMContentLoaded handler with no astro:page-load binding and no readyState guard — with ClientRouter this runs on first load only, then never again after navigation. Add document.addEventListener('astro:page-load', init) (and keep a readyState check for the first paint).`,
      snippet: snippetOf(source, idx),
    });
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
