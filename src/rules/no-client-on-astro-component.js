import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-client-on-astro-component",
  category: "Correctness",
  severity: "error",
  description:
    ".astro components have no client runtime — client:* on them is a build error. Only framework components (.tsx/.jsx/.vue/.svelte) can hydrate.",
};

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  // Extract imports with strings INTACT (the .astro path matters) but
  // comments blanked so commented-out imports don't count.
  const noComments = frontmatter
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;{])\/\/[^\n]*/g, (m) => m[0] + m.slice(1).replace(/[^\n]/g, " "));
  // Map local component names imported from .astro files.
  const astroNames = new Set();
  for (const m of noComments.matchAll(
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+\.astro)['"]/g
  )) {
    if (m[1]) astroNames.add(m[1]);
    for (const part of (m[2] ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) astroNames.add(name);
    }
  }
  if (astroNames.size === 0) return [];
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "component") continue;
    const base = tag.name.split(".")[0];
    if (!astroNames.has(base)) continue;
    const dir = tag.attrs.find((a) => a.name.startsWith("client:"));
    if (!dir) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: tag.line,
      message: `<${tag.name} ${dir.name}> targets a .astro component — .astro has no client runtime, so this fails to build. Extract the interactive part into a framework island (.tsx) or drive it with a client <script>.`,
      snippet: snippetOf(source, tag.index),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
