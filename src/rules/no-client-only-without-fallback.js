import { lineOf, snippetOf, maskTemplate } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-client-only-without-fallback",
  category: "Correctness",
  severity: "error",
  description:
    "client:only skips SSR entirely — without slot=\"fallback\" crawlers and no-JS users get empty HTML. Prefer a hydrating directive or add a fallback.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const clean = maskTemplate(source);
  if (!clean.includes("client:only")) return [];
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (!tag.attrs.some((a) => a.name === "client:only")) continue;
    // Compiler AST knows the subtree; the scanner fallback checks the file.
    const covered = doc.fallback
      ? clean.includes('slot="fallback"') || clean.includes("slot='fallback'")
      : tag.subtreeHasFallback;
    if (covered) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: tag.line,
      message: `<${tag.name} client:only> renders zero HTML on the server and no fallback was found. Add <p slot="fallback">…</p> or switch to client:visible/client:idle so SSR HTML exists.`,
      snippet: snippetOf(source, tag.index),
    });
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
