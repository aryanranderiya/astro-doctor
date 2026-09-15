import { lineOf, snippetOf, eachBodyScript, isRerunnableScript, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-missing-reinit-on-nav",
  category: "Correctness",
  severity: "warning",
  description:
    "Default bundled scripts run once ever. A plain script that CREATES DOM (widgets, injected scripts) without an astro:page-load hook leaves swapped-in pages uninitialized after ClientRouter navigation.",
};

// Creation inside an event callback runs on user action / per navigation —
// unaffected by one-shot script timing. Only top-level (load-time) creation
// goes missing after a swap. Listener names live in string literals, so match
// them on comment-stripped (not string-blanked) code; indices align because
// both transforms preserve length.
function stripCommentsOnly(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;{])\/\/[^\n]*/g, (m) => m[0] + m.slice(1).replace(/[^\n]/g, " "));
}

function insideCallback(js, strippedJs, idx) {
  const code = stripCommentsOnly(js);
  const start = Math.max(0, idx - 800);
  const before = code.slice(start, idx);
  const re = /addEventListener\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  let last = null;
  while ((m = re.exec(before)) !== null) last = m;
  if (!last) return false;
  const ev = last[1];
  const eventDriven =
    /^(?:click|dblclick|submit|change|input|keydown|keyup|keypress|mousedown|mouseup|mousemove|mouseenter|mouseleave|focus|blur|touchstart|touchend|pointerdown|scroll|resize)$/.test(ev) ||
    ev.startsWith("astro:");
  if (!eventDriven) return false;
  // Depth over the string-blanked slice so braces in prose don't count.
  const slice = strippedJs.slice(start + last.index + last[0].length, idx);
  let depth = 0;
  for (const ch of slice) {
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
  }
  return depth > 0;
}

export function check(file, source) {
  const diagnostics = [];
  eachBodyScript(source, ({ attrs, js, start }) => {
    // is:inline scripts re-run per navigation — covered by
    // no-duplicate-nav-listeners / no-unguarded-script-injection instead.
    if (isRerunnableScript(attrs)) return;
    if (!/createElement|insertAdjacentHTML|replaceChildren/.test(js)) return;
    if (!/appendChild|append\s*\(|insertBefore|innerHTML\s*=(?!=)/.test(js)) return;
    if (/astro:(page-load|after-swap|before-swap)/.test(js)) return;
    const stripped = stripCodeNoise(js);
    for (const t of stripped.matchAll(/createElement|insertAdjacentHTML|replaceChildren/g)) {
      const tIdx = t.index ?? 0;
      if (insideCallback(js, stripped, tIdx)) continue;
      const idx = start + tIdx;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `One-shot script creates DOM with no astro:page-load re-init — bundled scripts run once ever, so after a ClientRouter navigation the new page never gets this content. Re-run setup on astro:page-load (guarded), or move to an is:inline script.`,
        snippet: snippetOf(source, idx),
      });
      break; // one per block is enough signal
    }
  });
  return diagnostics.slice(0, 3);
}
