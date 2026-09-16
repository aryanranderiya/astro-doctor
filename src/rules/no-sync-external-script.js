import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-sync-external-script",
  category: "Performance",
  severity: "warning",
  description:
    "Synchronous third-party <script src> in template blocks first render. Defer until idle/interaction, or load with async/defer.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "element" || tag.name.toLowerCase() !== "script") continue;
    const src = tag.attrs.find((a) => a.name.toLowerCase() === "src");
    if (!src || typeof src.value !== "string" || !/^https?:\/\//i.test(src.value)) continue;
    if (tag.attrs.some((a) => /^(async|defer)$/i.test(a.name))) continue;
    // Dev-only tooling (react-scan, debug overlays) behind import.meta.env.DEV
    // is not a production defect — skip when conditionally rendered for dev.
    const ctx = source.slice(Math.max(0, tag.index - 400), tag.index);
    if (/import\.meta\.env\.DEV/.test(ctx)) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: tag.line,
      message: `Sync third-party script blocks rendering — add async/defer, or lazy-load on idle/interaction like the GA pattern (requestIdleCallback + event trigger).`,
      snippet: snippetOf(source, tag.index),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
