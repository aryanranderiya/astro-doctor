import { lineOf, snippetOf, maskTemplate } from "../utils.js";

export const meta = {
  name: "astro/no-inline-event-handler",
  category: "Maintainability",
  severity: "warning",
  description:
    "on*=\"...\" string handlers are eval-like, invisible to bundlers/CSP, and untestable. Bind in a client <script> or island instead (image fallbacks included).",
};

const RE =
  /\s(on(?:click|dblclick|error|load|submit|change|input|keydown|keyup|keypress|mouseover|mouseout|mouseenter|focus|blur|abort))\s*=\s*("[^"]*"|'[^']*')/gi;

export function check(file, source) {
  const clean = maskTemplate(source);
  const diagnostics = [];
  let m;
  while ((m = RE.exec(clean)) !== null) {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, m.index),
      message: `Inline ${m[1]}="..." handler — string-eval code that CSP blocks and tooling can't see. Move to a <script> addEventListener or island handler (or suppress with a reason if it is a deliberate no-JS fallback).`,
      snippet: snippetOf(source, m.index),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
