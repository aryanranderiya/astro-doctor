import { lineOf, snippetOf, eachBodyScript } from "../utils.js";

export const meta = {
  name: "astro/no-unhandled-promise",
  category: "Correctness",
  severity: "warning",
  description:
    "A .then() chain with no .catch() (or rejection callback) fails silently — dynamic imports, view-transition promises, and fetches leave dead UI with no error surface.",
};

export function check(file, source) {
  const diagnostics = [];
  eachBodyScript(source, ({ js, start: jsOff }) => {
    for (const t of js.matchAll(/\.then\s*\(/g)) {
      const tIdx = t.index ?? 0;
      // Balance parens from the .then( opener to find its argument list.
      const open = tIdx + t[0].length - 1;
      let depth = 0;
      let topComma = false;
      let end = -1;
      let inS = null;
      for (let i = open; i < Math.min(js.length, open + 800); i++) {
        const c = js[i];
        if (inS) {
          if (c === "\\") i++;
          else if (c === inS) inS = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") inS = c;
        else if (c === "(" || c === "{") depth++;
        else if (c === ")" || c === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        } else if (c === "," && depth === 1) topComma = true;
      }
      if (end === -1) continue;
      if (topComma) continue; // .then(ok, err) handles rejection natively
      // Look for .catch( chained after this .then(...) call.
      const after = js.slice(end, end + 400);
      if (/^\s*\.\s*catch\s*\(/.test(after)) continue;
      // `vt.finished.then(clear).catch(clear)`-style: catch later in chain
      if (/\.\s*catch\s*\(/.test(after.slice(0, 120))) continue;
      const idx = jsOff + tIdx;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `.then() with no rejection handling — a failed dynamic import/fetch leaves dead UI and an unhandledrejection. Append .catch(fallback) (or pass a second callback).`,
        snippet: snippetOf(source, idx),
      });
      if (diagnostics.length >= 4) return;
    }
  });
  return diagnostics;
}
