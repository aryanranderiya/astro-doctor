import { lineOf, snippetOf, maskTemplate } from "../utils.js";
import { getDoc, legacyIslandInMap } from "../parse.js";

export const meta = {
  name: "astro/no-island-in-map",
  category: "Performance",
  severity: "error",
  description:
    "An island inside .map() creates N astro-island loaders + N hydration roots. Lift the island above the list and pass rows as data.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const clean = maskTemplate(source);
  if (!clean.includes(".map(")) return [];
  const diagnostics = [];
  for (const tag of doc.tags) {
    const dir = tag.attrs.find((a) => a.name.startsWith("client:"));
    if (!dir) continue;
    const inside = doc.fallback
      ? legacyIslandInMap(clean, tag.index)
      : tag.inMap;
    if (!inside) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: tag.line,
      message: `<${tag.name} ${dir.name}> looks rendered inside .map() — N islands hydrate separately. Hoist to a single island above the list and pass rows={...} as data.`,
      snippet: snippetOf(source, tag.index),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
