import { lineOf, snippetOf, eachBodyScript, isRerunnableScript } from "../utils.js";

export const meta = {
  name: "astro/no-unguarded-script-injection",
  category: "Correctness",
  severity: "error",
  description:
    "is:inline scripts re-execute on every ClientRouter navigation. Injecting a third-party <script> with no idempotency guard appends duplicate widgets (and observers) per visit.",
};

// Idempotency signals: dataset flags, global __bound markers, existence checks
// for the injected artifact, boolean loaded/done guards. NOTE: a null-check
// like `if (!container) return` is NOT idempotency (it passes every visit),
// and getElementById-to-find-mount is not a guard either.
const GUARD_RE =
  /dataset\.|__\w*(?:bound|loaded|done)|querySelector\s*\([^)]*(iframe|script)|if\s*\(\s*!?\s*(loaded|done|injected|initialized|didInit|hasRun)\b/;

export function check(file, source) {
  const diagnostics = [];
  // Only rerunnable scripts can duplicate: default bundled module scripts
  // run once ever (docs.astro.build, Scripts + View Transitions guides).
  eachBodyScript(source, ({ attrs, js, start }) => {
    if (!isRerunnableScript(attrs)) return;
    if (!/createElement\s*\(\s*['"]script['"]/.test(js)) return;
    if (!/appendChild|append\s*\(|insertBefore|replaceChildren/.test(js)) return;
    if (GUARD_RE.test(js)) return;
    const idx = start + js.indexOf("createElement");
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Script injection with no idempotency guard — this is:inline block re-runs after every ClientRouter navigation and appends a duplicate widget (plus duplicate observers/listeners) per visit. Guard with a dataset flag (mount.dataset.loaded), a __bound marker, or an existence check before injecting.`,
      snippet: snippetOf(source, idx),
    });
  });
  return diagnostics.slice(0, 2);
}
