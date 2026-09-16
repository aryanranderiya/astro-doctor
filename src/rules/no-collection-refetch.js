import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";
import { getStaticPathsSpan } from "../parse.js";

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
  const code = stripCodeNoise(frontmatter);
  const span = getStaticPathsSpan(code);
  if (!span) return [];
  const after = code.slice(span.end);
  const m = after.match(/await\s+(getCollection|getEntry)\s*\(/);
  if (!m || m.index === undefined) return [];
  const idx = span.end + m.index;
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
