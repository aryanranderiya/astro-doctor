import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-client-only-without-fallback",
  category: "Correctness",
  severity: "error",
  description:
    "client:only skips SSR entirely — without slot=\"fallback\" crawlers and no-JS users get empty HTML. Prefer a hydrating directive or add a fallback.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  if (!clean.includes("client:only")) return [];
  if (clean.includes('slot="fallback"') || clean.includes("slot='fallback'")) return [];
  const diagnostics = [];
  for (const { name, tag, index } of scanTags(clean)) {
    if (!matchDirectives(tag).some((d) => d === "client:only")) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, index),
      message: `<${name} client:only> renders zero HTML on the server and no fallback was found. Add <p slot="fallback">…</p> or switch to client:visible/client:idle so SSR HTML exists.`,
      snippet: snippetOf(source, index),
    });
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
