import { lineOf, snippetOf, maskTemplate, scanTags } from "../utils.js";

export const meta = {
  name: "astro/prefer-astro-image",
  category: "Performance",
  severity: "warning",
  description:
    "Raw <img> without dimensions/loading causes layout shift and misses Astro image optimization. Prefer astro:assets Image or add width/height/loading.",
};

function numAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"(\\d+)"|'(\\d+)'|\\{(\\d+)\\})`, "i"));
  if (!m) return null;
  return parseInt(m[1] ?? m[2] ?? m[3], 10);
}

export function check(file, source) {
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index } of scanTags(clean)) {
    if (name.toLowerCase() !== "img") continue;
    const hasWidth = /\bwidth\s*=/i.test(tag);
    const hasHeight = /\bheight\s*=/i.test(tag);
    const hasAlt = /\balt\s*=/i.test(tag);
    const hasLoading = /\bloading\s*=/i.test(tag);
    const hasFetchPriority = /\bfetchpriority\s*=/i.test(tag);
    const w = numAttr(tag, "width");
    const h = numAttr(tag, "height");
    const isTiny = w !== null && h !== null && w <= 64 && h <= 64;
    const issues = [];
    if (!hasAlt) issues.push("missing alt (a11y)");
    if (!hasWidth || !hasHeight) issues.push("missing width/height (causes CLS)");
    // Tiny inline icons (flags, logos ≤64px) are above-the-fold and should be
    // eager — do not demand loading="lazy" for them. Only flag loading for
    // larger or unknown-size images.
    if (!hasLoading && !hasFetchPriority && !isTiny)
      issues.push('missing loading="lazy" or fetchpriority (offscreen images should lazy-load)');
    if (issues.length === 0) continue;
    const severity = !hasAlt ? "error" : meta.severity;
    diagnostics.push({
      rule: meta.name,
      category: hasAlt ? meta.category : "Accessibility",
      severity,
      file,
      line: lineOf(source, index),
      message: `<img> ${issues.join("; ")}. Import { Image } from "astro:assets" or add the attributes.`,
      snippet: snippetOf(source, index),
    });
  }
  return diagnostics;
}
