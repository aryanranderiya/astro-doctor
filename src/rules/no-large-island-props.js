import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";
import { getDoc } from "../parse.js";

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
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "component") continue;
    if (!tag.attrs.some((a) => a.name.startsWith("client:"))) continue;
    const idx = tag.index;
    const name = tag.name;
    // 1. Spread of a whole entry: <X client:* {...entry} {...post} />
    const spreadAttr = tag.attrs.find((a) => a.kind === "spread");
    const spread = spreadAttr
      ? (spreadAttr.value || spreadAttr.name).replace(/^\.\.\./, "")
      : null;
    if (spread && /^(entry|post|project|convo|item|entry\.data)$/i.test(spread)) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: tag.line,
        message: `<${name}> spreads a whole collection entry into island props — including the Markdown body. Project to rendered fields first (slug/title/description/…).`,
        snippet: snippetOf(source, idx),
      });
      continue;
    }
    // 2. Raw collection array passed wholesale: items={allPosts}
    for (const attr of tag.attrs) {
      if (attr.kind !== "expression" || !rawNames.has(attr.value.trim())) continue;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: tag.line,
        message: `<${name}> passes raw getCollection() result '${attr.value.trim()}' (with bodies) as island props — serialized into the HTML. .map() to rendered fields first.`,
        snippet: snippetOf(source, idx),
      });
      break;
    }
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
