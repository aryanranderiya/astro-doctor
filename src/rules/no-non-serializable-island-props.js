import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-non-serializable-island-props",
  category: "Correctness",
  severity: "error",
  description:
    "Island props cross the server→client boundary as JSON. Functions, render props and event handlers silently stop working. Pass data down, bubble events up via CustomEvent.",
};

// An expression prop whose value is a function: onSelect={(x) => …}, fn={function…}.
const FN_VALUE_RE = /^\s*(\([^)]*\)\s*=>|async\s*\(|async\s+[A-Za-z_$]|function\s*\()/;

export function check(file, source) {
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "component") continue;
    if (!tag.attrs.some((a) => a.name.startsWith("client:"))) continue;
    for (const attr of tag.attrs) {
      if (attr.kind !== "expression") continue;
      if (!FN_VALUE_RE.test(attr.value)) continue;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: tag.line,
        message: `<${tag.name}> passes '${attr.name}' as a function to a hydrated island — functions cannot be serialized to the client and will be silently dropped. Pass serializable data + listen via dispatchEvent/CustomEvent instead.`,
        snippet: snippetOf(source, tag.index),
      });
      break;
    }
  }
  return diagnostics;
}
