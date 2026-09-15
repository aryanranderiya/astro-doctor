import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-draft-leak",
  category: "Correctness",
  severity: "warning",
  description:
    "Draft-convention collections (blog/posts/writings) queried without a draft filter ship unpublished content to prod pages/RSS/sitemap.",
};

// Only collections that conventionally carry a `draft` flag. Other
// collections (projects, movies, books, now...) often have no draft concept —
// flagging them would be noise. Extend via config when yours differs.
const DRAFT_COLLECTIONS_RE = /getCollection\s*\(\s*['"`](blog|posts?|articles?|writings?|notes|essays)['"`]/;

export function check(file, source) {
  if (!file.replaceAll("\\", "/").includes("/pages/")) return [];
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  if (!DRAFT_COLLECTIONS_RE.test(frontmatter)) return [];
  const code = stripCodeNoise(frontmatter);
  if (/draft/.test(code)) return []; // already filtering (comments ignored)
  const m = frontmatter.match(/await\s+getCollection\s*\(/);
  if (!m || m.index === undefined) return [];
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, m.index),
      message: `getCollection() on a draft-convention collection with no draft handling in a page — drafts can leak to prod. Use getCollection('blog', ({ data }) => data.draft !== true) (gate on import.meta.env.PROD if previews need drafts).`,
      snippet: snippetOf(source, m.index),
    },
  ];
}
