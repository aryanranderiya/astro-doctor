import { lineOf, snippetOf, eachBodyScript } from "../utils.js";

export const meta = {
  name: "astro/no-unsafe-navigate",
  category: "Security",
  severity: "error",
  description:
    "navigate() performs no sanitization (docs: ?redirect=javascript:… executes). Only navigate to same-origin paths or an allowlist — never raw query input.",
};

const NAVIGATE_RE = /(?<![\w$.])navigate\s*\(\s*([^,)]+)(?:\s*,[^)]*)?\)/g;
const TAINT_RE = /\b(searchParams|location\.search|Astro\.params|params\.get|input\.value|query)\b/;
const GUARD_RE = /startsWith\s*\(\s*["']\/["']|allowlist|allowedPaths|includes\s*\(/;

function resolveIdent(js, name, callIdx) {
  // Single-arg dataflow (intra-block): `const to = <expr>; … navigate(to)`.
  // Returns the initializer text, or null when unknown (reassigned in between
  // or declared too far away) — unknown means "don't flag", not "clean".
  const decl = new RegExp(
    `(?:const|let)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*([^;]+);`
  );
  const windowStart = Math.max(0, callIdx - 800);
  const before = js.slice(windowStart, callIdx);
  const dm = decl.exec(before);
  if (!dm) return null;
  const afterDecl = before.slice(dm.index + dm[0].length);
  // reassigned after declaration? then provenance is unknown
  if (new RegExp(`(^|[^\\w$.])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=(?!=|>)`).test(afterDecl)) {
    return null;
  }
  return dm[1];
}

export function check(file, source) {
  const diagnostics = [];
  eachBodyScript(source, ({ js, start: jsOff }) => {
    NAVIGATE_RE.lastIndex = 0;
    let n;
    while ((n = NAVIGATE_RE.exec(js)) !== null) {
      const target = n[1] || "";
      let tainted = TAINT_RE.test(target);
      let shown = target;
      if (!tainted && /^[A-Za-z_$][\w$]*$/.test(target.trim())) {
        const init = resolveIdent(js, target.trim(), n.index);
        if (init && TAINT_RE.test(init)) {
          tainted = true;
          shown = `${target.trim()} (= ${init.trim().slice(0, 30)})`;
        }
      }
      if (!tainted) continue;
      const ctx = js.slice(Math.max(0, n.index - 400), n.index + target.length + 100);
      if (GUARD_RE.test(ctx)) continue;
      const idx = jsOff + n.index;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `navigate(${shown.trim().slice(0, 40)}…) uses request/input data — navigate() does not sanitize (javascript: URLs execute). Allowlist paths or enforce same-origin before navigating.`,
        snippet: snippetOf(source, idx),
      });
      if (diagnostics.length >= 3) return;
    }
    NAVIGATE_RE.lastIndex = 0;
  });
  return diagnostics;
}
