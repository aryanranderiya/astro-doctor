import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-client-load-abuse",
  category: "Performance",
  severity: "warning",
  description:
    "client:load ships JS + framework runtime immediately and blocks the main thread. Default to client:visible/client:idle; reserve client:load for above-the-fold interactive chrome.",
};

const WARN_AT = 2;
const ERROR_AT = 4;

export function check(file, source) {
  const doc = getDoc(source, file);
  const loads = doc.tags.filter((t) => t.attrs.some((a) => a.name === "client:load"));
  if (loads.length < WARN_AT) return [];
  const severity = loads.length >= ERROR_AT ? "error" : meta.severity;
  const first = loads[0];
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity,
      file,
      line: first.line,
      message: `${loads.length}x client:load in one file — each one hydrates immediately on page load. Downgrade below-the-fold islands to client:visible (or client:idle for non-critical chrome).`,
      snippet: snippetOf(source, first.index),
    },
  ];
}
