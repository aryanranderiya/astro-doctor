import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-secret-in-define-vars",
  category: "Security",
  severity: "error",
  description:
    "define:vars serializes values into client HTML. Passing secret/token/password-named values (other than PUBLIC_ env) ships credentials to the browser.",
};

const SECRET_WORDS = /\b(secret|token|password|passwd|pwd|private\s*key|api\s*key|client\s*secret)\b/i;

function looksSecret(s) {
  // split camelCase + snake/kebab so apiToken / db_password match \b words
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return SECRET_WORDS.test(words) || SECRET_WORDS.test(s);
}

export function check(file, source) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  const diagnostics = [];
  for (const m of body.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1] || "";
    const dv = attrs.match(/\bdefine:vars\s*=\s*\{\{([\s\S]*?)\}\}/);
    if (!dv) continue;
    const inner = dv[1];
    // entries look like `name` or `name: expr`
    for (const e of inner.matchAll(/([A-Za-z_$][\w$]*)(?:\s*:\s*([^,}]+))?/g)) {
      const key = e[1];
      const val = (e[2] ?? key).trim();
      if (/^PUBLIC_/i.test(val)) continue;
      if (!looksSecret(key) && !looksSecret(val)) continue;
      const idx = frontmatterEnd + (m.index ?? 0) + m[0].indexOf(e[0]);
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `define:vars passes '${(e[0] || "").trim().slice(0, 40)}' to client HTML — secret-named values ship to the browser. Read secrets in frontmatter/endpoints and pass only derived, public results.`,
        snippet: snippetOf(source, idx),
      });
    }
    if (diagnostics.length >= 3) break;
  }
  return diagnostics;
}
