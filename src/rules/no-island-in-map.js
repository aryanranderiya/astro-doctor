import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-island-in-map",
  category: "Performance",
  severity: "error",
  description:
    "An island inside .map() creates N astro-island loaders + N hydration roots. Lift the island above the list and pass rows as data.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  if (!clean.includes(".map(")) return [];
  const diagnostics = [];
  for (const { name, tag, index: idx } of scanTags(clean)) {
    const dir = matchDirectives(tag).find((d) => d.startsWith("client:"));
    if (!dir) continue;
    // Walk back to the nearest `.map(` and check the parens are still open
    // (unbalanced `(` count) with an arrow body — i.e. we are inside the
    // loop callback. Closed parens (e.g. a section after the list) skip.
    const windowStart = Math.max(0, idx - 2000);
    const before = clean.slice(windowStart, idx);
    const mapPos = before.lastIndexOf(".map(");
    if (mapPos === -1) continue;
    const after = before.slice(mapPos);
    if (!after.includes("=>")) continue;
    let depth = 0;
    for (const ch of after) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    if (depth <= 0) continue; // map() already closed — island is a sibling
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `<${name} ${dir}> looks rendered inside .map() — N islands hydrate separately. Hoist to a single island above the list and pass rows={...} as data.`,
      snippet: snippetOf(source, idx),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
