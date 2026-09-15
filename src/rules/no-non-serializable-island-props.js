import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-non-serializable-island-props",
  category: "Correctness",
  severity: "error",
  description:
    "Island props cross the server→client boundary as JSON. Functions, render props and event handlers silently stop working. Pass data down, bubble events up via CustomEvent.",
};

// A prop whose value is a function: onSelect={(x) => …}, fn={function…}.
const FN_PROP_RE = /\b(on[A-Z]\w*|[a-zA-Z_$][\w$]*)\s*=\s*\{\s*(\([^)]*\)\s*=>|async\s*\(|async\s+[A-Za-z_$]|function\s*\()/;

export function check(file, source) {
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index } of scanTags(clean)) {
    if (!/^[A-Z]/.test(name)) continue;
    if (!matchDirectives(tag).some((d) => d.startsWith("client:"))) continue;
    const f = FN_PROP_RE.exec(tag);
    if (!f) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, index),
      message: `<${name}> passes '${f[1]}' as a function to a hydrated island — functions cannot be serialized to the client and will be silently dropped. Pass serializable data + listen via dispatchEvent/CustomEvent instead.`,
      snippet: snippetOf(source, index),
    });
  }
  return diagnostics;
}
