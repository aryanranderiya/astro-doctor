import { lineOf, snippetOf, isNativeTag, scanTags, matchDirectives, maskTemplate } from "../utils.js";

export const meta = {
  name: "astro/no-client-directive-on-html",
  category: "Correctness",
  severity: "error",
  description:
    "client:* directives only hydrate framework components (React/Vue/Svelte). They are silently ignored on native HTML elements.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index } of scanTags(clean)) {
    if (!isNativeTag(name)) continue;
    const dirs = matchDirectives(tag).filter((d) => d.startsWith("client:"));
    if (dirs.length === 0) continue;
    const directive = dirs[0].split(":")[1];
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, index),
      message: `<${name}> uses client:${directive} but client:* only works on framework island components (e.g. <MyReactComp client:${directive} />). It is ignored on native HTML — remove it or wrap in an island.`,
      snippet: snippetOf(source, index),
    });
  }
  return diagnostics;
}
