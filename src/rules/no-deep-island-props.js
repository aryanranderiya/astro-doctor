import { lineOf, snippetOf } from "../utils.js";
import { getDoc } from "../parse.js";

export const meta = {
  name: "astro/no-deep-island-props",
  category: "Performance",
  severity: "warning",
  description:
    "Island props serialize into the HTML payload and deserialize on hydrate. Whole-props spreads, deeply nested inline literals, and prop-count bloat all ship bytes and slow hydration — pass flat, minimal data.",
};

function maxDepth(s) {
  let depth = 0;
  let max = 0;
  let inS = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) {
      if (c === "\\") i++;
      else if (c === inS) inS = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inS = c;
    else if (c === "{" || c === "[") {
      depth++;
      if (depth > max) max = depth;
    } else if (c === "}" || c === "]") depth--;
  }
  return max;
}

export function check(file, source) {
  const doc = getDoc(source, file);
  const diagnostics = [];
  for (const tag of doc.tags) {
    if (tag.kind !== "component") continue;
    if (!tag.attrs.some((a) => a.name.startsWith("client:"))) continue;
    const idx = tag.index;
    const name = tag.name;
    // 1. Whole-object spreads: {...Astro.props} serializes everything incl. children.
    const spreadAttr = tag.attrs.find((a) => a.kind === "spread");
    const spread = spreadAttr
      ? (spreadAttr.value || spreadAttr.name).replace(/^\.\.\./, "")
      : null;
    if (spread && (/^Astro\.props$/.test(spread) || /entry|post$/i.test(spread))) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: tag.line,
        message: `<${name}> spreads {...${spread}} into island props — the whole object (children, bodies) serializes into HTML. Pass only the rendered fields.`,
        snippet: snippetOf(source, idx),
      });
      continue;
    }
    // 2. Deeply nested or huge inline literals.
    let deep = false;
    for (const attr of tag.attrs) {
      if (attr.kind !== "expression") continue;
      if (attr.value.length > 300 || maxDepth(attr.value) >= 3) {
        deep = true;
        break;
      }
    }
    // 3. Prop-count bloat (each prop serializes + reconciles).
    const propCount = tag.attrs.filter((a) => a.kind !== "spread").length;
    if (deep || propCount > 8) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: tag.line,
        message: `<${name}> has ${deep ? "a deeply nested inline prop literal" : `${propCount} props`} — island props serialize into HTML and deserialize on hydrate. Flatten to minimal scalar/array data (ids, slugs, preformatted strings).`,
        snippet: snippetOf(source, idx),
      });
    }
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
