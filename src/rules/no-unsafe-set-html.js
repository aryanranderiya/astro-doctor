import { lineOf, snippetOf, stripComments } from "../utils.js";

export const meta = {
  name: "astro/no-unsafe-set-html",
  category: "Security",
  severity: "warning",
  description:
    "set:html renders raw HTML with no escaping. Flag anything that is not JSON-LD or visibly sanitized.",
};

function extractSetHtmlExprs(source) {
  // Find `set:html={` then balance braces to get the full expression.
  const out = [];
  const re = /set:html\s*=\s*\{/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const startExpr = m.index + m[0].length;
    let depth = 1;
    let i = startExpr;
    let inStr = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (inStr) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") inStr = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ expr: source.slice(startExpr, i).trim(), index: m.index });
  }
  return out;
}

export function check(file, source) {
  const clean = stripComments(source);
  // run extraction on clean source but report lines against original (same length, blanked comments)
  const diagnostics = [];
  for (const { expr, index } of extractSetHtmlExprs(clean)) {
    const lower = expr.toLowerCase();
    if (expr.includes("JSON.stringify")) continue; // ld+json pattern
    if (/sanitiz|purify|escape|encodeashtml|xss/.test(lower)) continue;
    if (/^["'`][\s\S]*["'`]$/.test(expr) && !expr.includes("${")) continue; // fully static string
    const tagStart = clean.lastIndexOf("<", index);
    const tagEnd = clean.indexOf(">", index);
    const tag = tagStart !== -1 && tagEnd !== -1 ? clean.slice(tagStart, tagEnd + 1) : "";
    const isLdJson = /type\s*=\s*["']application\/ld\+json["']/.test(tag);
    if (isLdJson) continue;
    // Raw HTML payloads from external APIs (tweet embeds, CMS rich-text) are
    // untrusted by definition — that is XSS, not style. Own markdown/captions
    // stay warnings.
    const tainted = /textHtml|moreHtml|innerHTML|outerHTML|\.html\b|\.body\b|dangerouslySet/i.test(expr);
    const severity = tainted ? "error" : meta.severity;
    const extra = tainted
      ? ` This looks like third-party HTML — sanitize with DOMPurify/sanitize-html or render as text.`
      : ``;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity,
      file,
      line: lineOf(source, index),
      message: `set:html={${expr.length > 60 ? expr.slice(0, 57) + "…" : expr}} renders unescaped HTML. Confirm the value is authored by you or sanitized (e.g. DOMPurify.sanitize) — never raw user/CMS input.${extra}`,
      snippet: snippetOf(source, index),
    });
  }
  return diagnostics;
}
