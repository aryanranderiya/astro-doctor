import { lineOf, snippetOf, maskTemplate, splitFrontmatter, stripCodeNoise, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-large-island-props",
  category: "Performance",
  severity: "warning",
  description:
    "Island props are serialized into the HTML payload. Passing raw getCollection() results (with Markdown bodies) bloats every page — project to the fields the island renders, like mapProject().",
};

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const code = stripCodeNoise(
    frontmatter.replace(/^\s*import[^\n]*$/gm, (m) => " ".repeat(m.length))
  );
  // Names directly holding whole-collection results: const X = await getCollection(...)
  const rawNames = new Set();
  for (const m of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+getCollection\s*\(/g)) {
    rawNames.add(m[1]);
  }
  if (rawNames.size === 0) return [];
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index: idx } of scanTags(clean)) {
    if (!/^[A-Z]/.test(name)) continue;
    if (!matchDirectives(tag).some((d) => d.startsWith("client:"))) continue;
    // 1. Spread of a whole entry: <X client:* {...entry} {...post} />
    if (/\{\s*\.\.\.\s*(entry|post|project|convo|item|entry\.data)\s*\}/.test(tag)) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: lineOf(source, idx),
        message: `<${name}> spreads a whole collection entry into island props — including the Markdown body. Project to rendered fields first (slug/title/description/…).`,
        snippet: snippetOf(source, idx),
      });
      continue;
    }
    // 2. Raw collection array passed wholesale: items={allPosts} / items={projectEntries}
    for (const prop of tag.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
      if (rawNames.has(prop[2])) {
        diagnostics.push({
          rule: meta.name,
          category: meta.category,
          severity: meta.severity,
          file,
          line: lineOf(source, idx),
          message: `<${name}> passes raw getCollection() result '${prop[2]}' (with bodies) as island props — serialized into the HTML. .map() to rendered fields first.`,
          snippet: snippetOf(source, idx),
        });
        break;
      }
    }
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
