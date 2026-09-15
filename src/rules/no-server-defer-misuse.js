import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-server-defer-misuse",
  category: "Correctness",
  severity: "warning",
  description:
    "server:defer is mutually exclusive with client:* and renders a blank hole without slot=\"fallback\". Pick one rendering model and always provide a skeleton.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  if (!clean.includes("server:defer")) return [];
  const diagnostics = [];
  const hasFallback =
    clean.includes('slot="fallback"') || clean.includes("slot='fallback'");
  for (const { name, tag, index } of scanTags(clean)) {
    const dirs = matchDirectives(tag);
    if (!dirs.includes("server:defer")) continue;
    if (dirs.some((d) => d.startsWith("client:"))) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: lineOf(source, index),
        message: `<${name}> mixes server:defer with a client:* directive — they are mutually exclusive (server island vs client hydration). Choose one.`,
        snippet: snippetOf(source, index),
      });
      continue;
    }
    if (!hasFallback) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, index),
        message: `<${name} server:defer> has no slot="fallback" child — users see a blank hole until the island resolves. Add <div slot="fallback">skeleton</div>.`,
        snippet: snippetOf(source, index),
      });
    }
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
