import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-too-many-islands",
  category: "Performance",
  severity: "warning",
  description:
    "Every client:* island ships its own loader + framework runtime. More than ~6 per page is a code smell — consolidate or replace static islands with <script> + custom elements.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  const found = [];
  for (const { tag, index } of scanTags(clean)) {
    if (matchDirectives(tag).some((d) => d.startsWith("client:"))) found.push(index);
  }
  if (found.length <= 4) return [];
  const severity = found.length > 7 ? "error" : meta.severity;
  const first = found[0];
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity,
      file,
      line: lineOf(source, first),
      message: `${found.length} hydrated islands in one file. Each island duplicates runtime cost — consolidate lists into a single island, drop static ones to plain .astro, or use client:media/rootMargin.`,
      snippet: snippetOf(source, first),
    },
  ];
}
