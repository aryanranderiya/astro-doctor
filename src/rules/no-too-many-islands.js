import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-too-many-islands",
  category: "Performance",
  severity: "warning",
  description:
    "Every client:* island ships its own loader + framework runtime. More than ~6 per page is a code smell — consolidate or replace static islands with <script> + custom elements.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const found = doc.tags.filter((t) => t.attrs.some((a) => a.name.startsWith("client:")));
  if (found.length <= 4) return [];
  const severity = found.length > 7 ? "error" : meta.severity;
  const first = found[0];
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity,
      file,
      line: first.line,
      message: `${found.length} hydrated islands in one file. Each island duplicates runtime cost — consolidate lists into a single island, drop static ones to plain .astro, or use client:media/rootMargin.`,
      snippet: snippetOf(source, first.index),
    },
  ];
}
