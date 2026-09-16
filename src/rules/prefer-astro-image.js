import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/prefer-astro-image",
  category: "Performance",
  severity: "warning",
  description:
    "Raw <img> without dimensions/loading causes layout shift and misses Astro image optimization. Prefer astro:assets Image or add width/height/loading.",
};

function numAttr(attrs, name) {
  const hit = attrs.find((a) => a.name.toLowerCase() === name);
  if (!hit) return null;
  const m = String(hit.value).match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function hasAttr(attrs, name) {
  return attrs.some((a) => a.name.toLowerCase() === name);
}

export function check(file, source) {
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "element" || tag.name.toLowerCase() !== "img") continue;
    const { attrs } = tag;
    const w = numAttr(attrs, "width");
    const h = numAttr(attrs, "height");
    const isTiny = w !== null && h !== null && w <= 64 && h <= 64;
    const issues = [];
    if (!hasAttr(attrs, "alt")) issues.push("missing alt (a11y)");
    if (!hasAttr(attrs, "width") || !hasAttr(attrs, "height"))
      issues.push("missing width/height (causes CLS)");
    // Tiny inline icons (flags, logos ≤64px) are above-the-fold and should be
    // eager — do not demand loading="lazy" for them. Only flag loading for
    // larger or unknown-size images.
    if (!hasAttr(attrs, "loading") && !hasAttr(attrs, "fetchpriority") && !isTiny)
      issues.push('missing loading="lazy" or fetchpriority (offscreen images should lazy-load)');
    if (issues.length === 0) continue;
    const severity = !hasAttr(attrs, "alt") ? "error" : meta.severity;
    diagnostics.push({
      rule: meta.name,
      category: hasAttr(attrs, "alt") ? meta.category : "Accessibility",
      severity,
      file,
      line: tag.line,
      message: `<img> ${issues.join("; ")}. Import { Image } from "astro:assets" or add the attributes.`,
      snippet: snippetOf(source, tag.index),
    });
  }
  return diagnostics;
}
