import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-client-directive-on-html",
  category: "Correctness",
  severity: "error",
  description:
    "client:* directives only hydrate framework components (React/Vue/Svelte). They are silently ignored on native HTML elements.",
};

export function check(file, source) {
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    // Compiler-classified elements and custom elements have no client runtime.
    if (tag.kind !== "element" && tag.kind !== "custom-element") continue;
    const dir = tag.attrs.find((a) => a.name.startsWith("client:"));
    if (!dir) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: tag.line,
      message: `<${tag.name}> uses ${dir.name} but client:* only works on framework island components (e.g. <MyReactComp ${dir.name} />). It is ignored on native HTML — remove it or wrap in an island.`,
      snippet: snippetOf(source, tag.index),
    });
  }
  return diagnostics;
}
