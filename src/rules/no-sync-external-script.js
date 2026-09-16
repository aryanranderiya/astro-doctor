import { lineOf, snippetOf, maskTemplate, scanTags, tagAttr } from "../utils.js";

export const meta = {
  name: "astro/no-sync-external-script",
  category: "Performance",
  severity: "warning",
  description:
    "Synchronous third-party <script src> in template blocks first render. Defer until idle/interaction, or load with async/defer.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index } of scanTags(clean)) {
    if (name.toLowerCase() !== "script") continue;
    const src = tagAttr(tag, "src");
    if (typeof src !== "string" || !/^https?:\/\//i.test(src)) continue;
    if (/\b(async|defer)\b/i.test(tag)) continue;
    // Dev-only tooling (react-scan, debug overlays) behind import.meta.env.DEV
    // is not a production defect — skip when conditionally rendered for dev.
    const ctx = source.slice(Math.max(0, index - 400), index);
    if (/import\.meta\.env\.DEV/.test(ctx)) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, index),
      message: `Sync third-party script blocks rendering — add async/defer, or lazy-load on idle/interaction like the GA pattern (requestIdleCallback + event trigger).`,
      snippet: snippetOf(source, index),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
