import path from "node:path";
import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-unknown-collection",
  category: "Correctness",
  severity: "error",
  description:
    "getCollection()/getEntry() with a name missing from content.config.ts collections silently returns nothing (or throws at build). Typos fail late — catch them here.",
};

function definedCollections(configSource) {
  const names = new Set();
  const m = configSource.match(/export\s+const\s+collections\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null; // config shape unrecognized — skip rather than guess
  const block = m[1];
  for (const part of block.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const qm = t.match(/^['"`]([^'"`]+)['"]\s*:/);
    if (qm) {
      names.add(qm[1]);
      continue;
    }
    // Unquoted `key: value` pairs name something else — only bare shorthand
    // identifiers (`blog,`) are collection names.
    const sm = t.match(/^([A-Za-z_$][\w$]*)$/);
    if (sm) names.add(sm[1]);
  }
  return names;
}

export function checkAll(files, read, ctx = {}) {
  const root = ctx.root ?? process.cwd();
  let configSource = null;
  try {
    configSource = read(path.join(root, "src", "content.config.ts"));
  } catch {
    return [];
  }
  if (!configSource) return [];
  const defined = definedCollections(configSource);
  if (!defined) return [];
  const diagnostics = [];
  for (const file of files) {
    if (!file.endsWith(".astro")) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    const { frontmatter } = splitFrontmatter(source);
    if (!frontmatter) continue;
    const code = stripCodeNoise(frontmatter);
    // NOTE: string contents are blanked above (only the opening quote survives),
    // so locate calls here but re-slice literal values from the original
    // frontmatter at the same (length-preserved) indices.
    for (const m of code.matchAll(/\b(?:getCollection|getEntry|getEntries)\s*\(\s*(['"])/g)) {
      const raw = frontmatter.slice(m.index, m.index + 160);
      const v = raw.match(/\(\s*(['"])([^'"]+)\1/);
      if (!v) continue;
      if (defined.has(v[2])) continue;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, m.index),
        message: `Collection '${v[2]}' is not in content.config.ts collections (${[...defined].join(", ") || "none"}) — this returns nothing or fails the build. Fix the typo.`,
        snippet: snippetOf(source, m.index),
      });
      if (diagnostics.length >= 5) return diagnostics;
    }
  }
  return diagnostics;
}
