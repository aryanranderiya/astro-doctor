import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-unbounded-collection",
  category: "Performance",
  severity: "warning",
  description:
    "await getCollection() with no filter AND no bound (slice/limit/take) on a prerender=false (per-request) route re-scans and serializes the whole collection on every hit. Filter, bound, or precompute.",
};

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  if (!/export\s+const\s+prerender\s*=\s*false/.test(frontmatter)) return [];
  const diagnostics = [];
  for (const m of frontmatter.matchAll(/await\s+getCollection\s*\(\s*(['"`][^'"`]+['"`])(\s*,[^)]*)?\)/g)) {
    const idx = m.index ?? 0;
    const hasFilter = !!m[2];
    // A bound looks like .slice(/.limit(/take(/first(/paginate( on the result
    // chain within ~600 chars after the call.
    const after = frontmatter.slice(idx, idx + 600);
    const hasBound = /\.\s*(slice|limit|take|first|paginate|sliceAndDice)\s*\(/.test(after);
    if (hasFilter && hasBound) continue;
    const why = !hasFilter
      ? "no filter and no bound"
      : "filtered but unbounded (no slice/limit)";
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Unbounded getCollection(${m[1]}) on a per-request route (${why}) — full scan + serialize per hit. Add a filter (( { data } ) => …) and bound the result (.slice(0, N)), paginate, or use getEntry(Astro.params.id) for detail pages.`,
      snippet: snippetOf(source, idx),
    });
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
