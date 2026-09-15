import { lineOf, snippetOf, maskTemplate, scanTags } from "../utils.js";

export const meta = {
  name: "astro/no-missing-html-lang",
  category: "Accessibility",
  severity: "error",
  description:
    "Full-document .astro files (<html>) must declare lang (screen readers, crawlers) and render a <title>. Components without <html> are skipped.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  const html = scanTags(clean).find((t) => t.name.toLowerCase() === "html");
  if (!html) return [];
  const diagnostics = [];
  if (!/\blang\s*=/i.test(html.tag)) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, html.index),
      message: `<html> without lang — screen readers mispronounce content and crawlers penalize. Use <html lang="en"> (or the page locale).`,
      snippet: snippetOf(source, html.index),
    });
  }
  if (!/<title[\s>]/i.test(clean)) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: "warning",
      file,
      line: lineOf(source, html.index),
      message: `Document shell has no <title> — every route needs a unique title for a11y/SEO. Set it in frontmatter (title prop) and render <title>{title}</title>.`,
      snippet: snippetOf(source, html.index),
    });
  }
  return diagnostics;
}
