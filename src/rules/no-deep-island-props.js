import { lineOf, snippetOf, maskTemplate, scanTags, matchDirectives } from "../utils.js";

export const meta = {
  name: "astro/no-deep-island-props",
  category: "Performance",
  severity: "warning",
  description:
    "Island props serialize into the HTML payload and deserialize on hydrate. Whole-props spreads, deeply nested inline literals, and prop-count bloat all ship bytes and slow hydration — pass flat, minimal data.",
};

function* propLiterals(tag) {
  // Yield balanced {…} prop values in order.
  const re = /[A-Za-z_$][\w$-]*\s*=\s*\{/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let inS = null;
    for (let i = open; i < tag.length; i++) {
      const c = tag[i];
      if (inS) {
        if (c === "\\") i++;
        else if (c === inS) inS = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") inS = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          yield tag.slice(open, i + 1);
          re.lastIndex = i + 1;
          break;
        }
      }
    }
  }
}
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
  const clean = maskTemplate(source);
  const diagnostics = [];
  for (const { name, tag, index: idx } of scanTags(clean)) {
    if (!/^[A-Z]/.test(name)) continue;
    if (!matchDirectives(tag).some((d) => d.startsWith("client:"))) continue;
    // 1. Whole-object spreads: {...Astro.props} serializes everything incl. children.
    const spread = tag.match(/\{\s*\.\.\.\s*(Astro\.props|[A-Za-z_$][\w$]*)\s*\}/);
    if (spread && (/^Astro\.props$/.test(spread[1]) || /entry|post$/i.test(spread[1]))) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: "error",
        file,
        line: lineOf(source, idx),
        message: `<${name}> spreads {...${spread[1]}} into island props — the whole object (children, bodies) serializes into HTML. Pass only the rendered fields.`,
        snippet: snippetOf(source, idx),
      });
      continue;
    }
    // 2. Deeply nested or huge inline literals (per-prop, balanced).
    let deep = false;
    for (const lit of propLiterals(tag)) {
      if (lit.length > 300 || maxDepth(lit) >= 4) {
        deep = true;
        break;
      }
    }
    // 3. Prop-count bloat (each prop serializes + reconciles).
    const propCount = (tag.match(/[A-Za-z_$][\w$-]*\s*=/g) || []).length;
    if (deep || propCount > 8) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `<${name}> has ${deep ? "a deeply nested inline prop literal" : `${propCount} props`} — island props serialize into HTML and deserialize on hydrate. Flatten to minimal scalar/array data (ids, slugs, preformatted strings).`,
        snippet: snippetOf(source, idx),
      });
    }
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
