import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-complex-frontmatter",
  category: "Maintainability",
  severity: "warning",
  description:
    "Frontmatter with heavy branching (parsers, scorers, transformers) is untestable glue — extract it to src/lib/ with unit tests, leaving data-flow only.",
};

const BUDGET = 10;

export function complexityOf(code) {
  let n = 0;
  const res = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
  ];
  for (const re of res) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) n++;
  }
  // ternary ? — excluding ?. and ?? (handled above)
  const stripped = code.replace(/\?\?/g, "  ");
  let m;
  const tre = /\?(?![?.:])/g;
  while ((m = tre.exec(stripped)) !== null) n++;
  return n;
}

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const code = stripCodeNoise(
    frontmatter.replace(/^\s*import[^\n]*$/gm, (m) => " ".repeat(m.length))
  );
  const complexity = complexityOf(code);
  if (complexity <= BUDGET) return [];
  const idx = source.indexOf("\n") + 1;
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Frontmatter complexity ${complexity} (budget ${BUDGET} branches) — move the logic (parsing, scoring, transforming) into src/lib/ with tests; keep frontmatter to fetch → shape → render.`,
      snippet: snippetOf(source, idx),
    },
  ];
}
