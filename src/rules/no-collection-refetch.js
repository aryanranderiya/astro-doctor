import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-collection-refetch",
  category: "Performance",
  severity: "warning",
  description:
    "getStaticPaths() already loads the collection — a second top-level getCollection()/getEntry() outside it re-parses every entry per page at build. Compute once inside getStaticPaths and pass via props (prev/next/related included).",
};

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const pathsFn = frontmatter.match(/export\s+(async\s+)?function\s+getStaticPaths\s*\(/);
  if (!pathsFn || pathsFn.index === undefined) return [];
  // Find the end of the getStaticPaths function via brace balance.
  const code = stripCodeNoise(frontmatter);
  const openIdx = code.indexOf("{", pathsFn.index);
  if (openIdx === -1) return [];
  let depth = 0;
  let fnEnd = -1;
  for (let i = openIdx; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) {
        fnEnd = i;
        break;
      }
    }
  }
  if (fnEnd === -1) return [];
  const after = code.slice(fnEnd);
  const m = after.match(/await\s+(getCollection|getEntry)\s*\(/);
  if (!m || m.index === undefined) return [];
  const idx = fnEnd + m.index;
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Top-level await ${m[1]}() outside getStaticPaths() re-loads the collection for every generated page. Move it inside getStaticPaths() and pass the result (entry, prev/next, related) via props — see the now/[slug] pattern.`,
      snippet: snippetOf(source, idx),
    },
  ];
}
