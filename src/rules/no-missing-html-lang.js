import { lineOf, snippetOf, maskTemplate } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-missing-html-lang",
  category: "Accessibility",
  severity: "error",
  description:
    "Full-document .astro files (<html>) must declare lang (screen readers, crawlers) and render a <title>. Components without <html> are skipped.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const html = doc.tags.find((t) => t.kind === "element" && t.name.toLowerCase() === "html");
  if (!html) return [];
  const diagnostics = [];
  if (!html.attrs.some((a) => a.name.toLowerCase() === "lang")) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: html.line,
      message: `<html> without lang — screen readers mispronounce content and crawlers penalize. Use <html lang="en"> (or the page locale).`,
      snippet: snippetOf(source, html.index),
    });
  }
  const clean = maskTemplate(source);
  if (!/<title[\s>]/i.test(clean)) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: "warning",
      file,
      line: html.line,
      message: `Document shell has no <title> — every route needs a unique title for a11y/SEO. Set it in frontmatter (title prop) and render <title>{title}</title>.`,
      snippet: snippetOf(source, html.index),
    });
  }
  return diagnostics;
}
