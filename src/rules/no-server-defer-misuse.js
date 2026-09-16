import { lineOf, snippetOf, maskTemplate } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-server-defer-misuse",
  category: "Correctness",
  severity: "warning",
  description:
    "server:defer is mutually exclusive with client:* and renders a blank hole without slot=\"fallback\". Pick one rendering model and always provide a skeleton.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const clean = maskTemplate(source);
  if (!clean.includes("server:defer")) return [];
  const diagnostics = [];
  const fileHasFallback =
    clean.includes('slot="fallback"') || clean.includes("slot='fallback'");
  for (const tag of doc.tags) {
    const dirs = tag.attrs.map((a) => a.name).filter((n) => n.startsWith("server:") || n.startsWith("client:"));
    if (!dirs.includes("server:defer")) continue;
    if (dirs.some((d) => d.startsWith("client:"))) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: tag.line,
        message: `<${tag.name}> mixes server:defer with a client:* directive — they are mutually exclusive (server island vs client hydration). Choose one.`,
        snippet: snippetOf(source, tag.index),
      });
      continue;
    }
    const covered = doc.fallback ? fileHasFallback : tag.subtreeHasFallback;
    if (!covered) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: tag.line,
        message: `<${tag.name} server:defer> has no slot="fallback" child — users see a blank hole until the island resolves. Add <div slot="fallback">skeleton</div>.`,
        snippet: snippetOf(source, tag.index),
      });
    }
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
