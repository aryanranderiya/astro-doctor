import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise, eachBodyScript, isRerunnableScript } from "../utils.js";

export const meta = {
  name: "astro/no-duplicate-nav-listeners",
  category: "Correctness",
  severity: "warning",
  description:
    "is:inline scripts re-execute on every ClientRouter navigation (bundled module scripts run once ever). Registering astro:* listeners unconditionally in one stacks duplicate handlers per visit — guard the registration.",
};

const NAV_EVENT_RE =
  /addEventListener\s*\(\s*['"]astro:(?:page-load|after-swap|before-swap|before-preparation)['"]/g;

// A guard must CONTROL the registration, not merely exist in the block:
//  - wrapping if:  if (!window.__xBound) { … addEventListener … }
//  - early return: if (w.__xBound) return; …
// Conditions are paren-balanced (TS casts contain braces), and the guard must
// sit at the block's top level — a `return` inside a helper guards nothing.
function isGuarded(rawJs, idx) {
  const js = stripCodeNoise(rawJs);
  const before = js.slice(0, idx);
  let i = 0;
  while (true) {
    const m = /\bif\s*\(/.exec(before.slice(i));
    if (!m) break;
    const condOpen = i + m.index + m[0].length - 1;
    let depth = 0;
    let condEnd = -1;
    for (let j = condOpen; j < before.length; j++) {
      if (before[j] === "(") depth++;
      else if (before[j] === ")") {
        depth--;
        if (depth === 0) {
          condEnd = j;
          break;
        }
      }
    }
    if (condEnd === -1) break;
    const cond = before.slice(condOpen, condEnd + 1);
    // top-level only: brace depth at the `if`
    let bdepth = 0;
    for (let j = 0; j < i + m.index; j++) {
      if (before[j] === "{") bdepth++;
      else if (before[j] === "}") bdepth--;
    }
    const rest = before.slice(condEnd + 1).trimStart();
    // Top level, or one IIFE deep (inline scripts are conventionally wrapped
    // in `(function(){…})()` — a helper-function `return` guards nothing, but
    // guard-named early-returns inside named helpers are rare; accepted risk.)
    if (bdepth <= 1 && /__\w+|loaded|bound|initialized|didInit/.test(cond)) {
      if (/^return\b/.test(rest)) return true;
      // inside the if/else body if braces never balance out before idx
      let dd = 0;
      for (const ch of rest) {
        if (ch === "{") dd++;
        else if (ch === "}") dd--;
      }
      if (dd > 0) return true;
    }
    i = condEnd + 1;
  }
  return false;
}

function callSpan(js, start) {
  let depth = 0;
  let opened = false;
  for (let i = start; i < Math.min(js.length, start + 600); i++) {
    if (js[i] === "(") {
      depth++;
      opened = true;
    } else if (js[i] === ")") {
      depth--;
      if (opened && depth === 0) return js.slice(start, i + 1);
    }
  }
  return js.slice(start, start + 600);
}

export function check(file, source) {
  const diagnostics = [];
  // Head scripts are excluded: identical head scripts are carried over without
  // re-running, and per-page head scripts are rare — body scripts are where
  // ClientRouter re-execution stacks handlers.
  const headSpans = [];
  {
    const { frontmatterEnd } = splitFrontmatter(source);
    const body = source.slice(frontmatterEnd);
    for (const m of body.matchAll(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi)) {
      headSpans.push([frontmatterEnd + (m.index ?? 0), frontmatterEnd + (m.index ?? 0) + m[0].length]);
    }
  }
  const inHead = (off) => headSpans.some(([s, e]) => off >= s && off < e);
  eachBodyScript(source, (block) => {
    if (inHead(block.tagStart)) return;
    const { attrs, js } = block;
    // docs.astro.build (View Transitions + Scripts): default bundled module
    // scripts run ONCE ever; only is:inline / data-astro-rerun scripts
    // re-execute when the incoming page is new.
    if (!isRerunnableScript(attrs)) return;
    if (!NAV_EVENT_RE.test(js)) return;
    NAV_EVENT_RE.lastIndex = 0;
    for (const e of js.matchAll(NAV_EVENT_RE)) {
      const eIdx = e.index ?? 0;
      const span = callSpan(js, eIdx);
      // { once: true } or AbortSignal on THIS registration = intentional.
      if (/once\s*:\s*true/.test(span)) continue;
      if (/signal\s*:/.test(span)) continue;
      if (isGuarded(js, eIdx)) continue;
      const idx = block.start + eIdx;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `Unconditional astro:* listener registration in an is:inline script — this block re-executes on every ClientRouter navigation, stacking a duplicate handler per visit (N navs = N handlers). Guard with a __bound flag / dataset marker, or scope work so repeats are free.`,
        snippet: snippetOf(source, idx),
      });
    }
  });
  return diagnostics.slice(0, 8);
}
