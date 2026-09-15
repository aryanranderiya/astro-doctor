import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-fetch-waterfall",
  category: "Performance",
  severity: "warning",
  description:
    "Sequential top-level await fetch() in frontmatter pays full latency sums on every build/request. Use Promise.all for independent requests or bake datasets at build time.",
};

function isInsideFunction(code, idx) {
  // Look back ≤600 chars for the nearest function opener; if its `{` is
  // still unclosed at idx, the await lives inside a helper body, not at
  // top level (helpers are definitions, not a runtime waterfall).
  const start = Math.max(0, idx - 600);
  const before = code.slice(start, idx);
  const fnPos = Math.max(before.lastIndexOf("function"), before.lastIndexOf("=>"));
  if (fnPos === -1) return false;
  const after = before.slice(fnPos);
  let depth = 0;
  for (const ch of after) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth > 0;
}

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const code = stripCodeNoise(
    frontmatter.replace(/^\s*import[^\n]*$/gm, (m) => " ".repeat(m.length))
  );
  const topLevel = [];
  for (const m of code.matchAll(/await\s+fetch\s*\(/g)) {
    const idx = m.index ?? 0;
    if (!isInsideFunction(code, idx)) topLevel.push(m);
  }
  if (topLevel.length < 2) return [];
  if (/Promise\s*\.\s*all\s*\(/.test(code)) return [];
  const idx = topLevel[1].index ?? 0;
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `${topLevel.length} sequential top-level await fetch() in frontmatter with no Promise.all — latency adds up. Batch independent requests with Promise.all([...]) or move stable datasets to a build script (committed JSON).`,
      snippet: snippetOf(source, idx),
    },
  ];
}
