import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";
import { getStaticPathsSpan } from "../parse.js";

export const meta = {
  name: "astro/no-prerender-mismatch",
  category: "Correctness",
  severity: "error",
  description:
    "export const prerender = false opts out of static generation — getStaticPaths() in the same file is then dead code (and vice versa: request-time APIs need the opt-out).",
};

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const hasOptOut = /export\s+const\s+prerender\s*=\s*false/.test(frontmatter);
  const hasPaths = getStaticPathsSpan(stripCodeNoise(frontmatter)) !== null;
  if (!(hasOptOut && hasPaths)) return [];
  const idx = source.indexOf("getStaticPaths");
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `prerender = false and getStaticPaths() in the same file contradict each other — static paths are ignored on an on-demand route. Remove one (split into a static list page + SSR detail route if needed).`,
      snippet: snippetOf(source, idx),
    },
  ];
}
