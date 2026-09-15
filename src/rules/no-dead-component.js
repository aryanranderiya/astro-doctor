import path from "node:path";

export const meta = {
  name: "astro/no-dead-component",
  category: "Maintainability",
  severity: "warning",
  description:
    "An .astro/.tsx component that nothing imports is dead weight (or a forgotten migration — like a superseded comments widget). Delete it or exclude it in config `ignore`.",
};

// Route files are entry points, not imports — never flag them.
function isRoute(file) {
  return file.replaceAll("\\", "/").includes("/pages/");
}

const TEXT_EXTS = new Set([
  ".astro",
  ".mdx",
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
]);

export function checkAll(files, read) {
  // Candidates: UI components only — .astro anywhere outside routes, plus
  // framework islands (.tsx/.jsx) under components/. Pure helpers (.ts),
  // entries (middleware/content.config) and tests belong to knip/tsc, whose
  // module resolution understands them; basename matching would misfire there.
  const candidates = new Set(
    files.filter((f) => {
      const rel = f.replaceAll("\\", "/");
      if (rel.includes("/pages/")) return false;
      if (f.endsWith(".astro")) return true;
      if (!rel.includes("/components/")) return false;
      if (/\.(test|spec)\.[jt]sx?$/.test(f) || f.endsWith(".d.ts")) return false;
      return /\.[jt]sx$/.test(f);
    })
  );
  if (candidates.size === 0) return [];
  // Dead-code analysis needs entry points: with zero routes every component
  // is trivially "unreferenced" (demos, single-file fixtures).
  if (!files.some((f) => f.endsWith(".astro") && isRoute(f))) return [];
  // Corpus: candidate sources + everything that can import them.
  const texts = new Map();
  for (const f of files) {
    const ext = path.extname(f);
    if (!TEXT_EXTS.has(ext)) continue;
    let text = "";
    try {
      text = read(f);
    } catch {
      text = "";
    }
    // Markdown prose is not code: a blog post mentioning "Toolbox" must not
    // rescue a dead component. Keep frontmatter (layout: refs are real) and
    // MDX import statements only.
    if ((ext === ".md" || ext === ".mdx") && text.startsWith("---")) {
      const end = text.indexOf("\n---", 3);
      const fm = end === -1 ? text : text.slice(0, end + 4);
      const imports = [...text.matchAll(/^import[^\n]*$/gm)].map((m) => m[0]).join("\n");
      text = `${fm}\n${imports}`;
    }
    texts.set(f, text);
  }
  const wordRe = (base) =>
    new RegExp(
      `(^|[^\\w$])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`
    );
  const isReferencedFrom = (base, withExt, liveSet) => {
    for (const [other, text] of texts) {
      // Dead candidates don't vote: an import from an already-dead file
      // doesn't rescue anything (transitive deadness).
      if (candidates.has(other) && !liveSet.has(other)) continue;
      if (!text.includes(base)) continue;
      if (wordRe(base).test(text) || text.includes(withExt)) return true;
    }
    return false;
  };
  // Fixpoint: drop unreferenced files until stable, so clusters of dead code
  // (dead widget + its private partials) all surface instead of masking.
  const live = new Set(texts.keys());
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of candidates) {
      if (!live.has(file)) continue;
      const base = path.basename(file).replace(/\.[^.]+$/, "");
      const probe = new Set([...live].filter((f) => f !== file));
      if (!isReferencedFrom(base, `${base}${path.extname(file)}`, probe)) {
        live.delete(file);
        changed = true;
      }
    }
  }
  const diagnostics = [];
  for (const file of candidates) {
    if (live.has(file)) continue;
    const base = path.basename(file).replace(/\.[^.]+$/, "");
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: 1,
      message: `'${base}${path.extname(file)}' is not imported or referenced from any live file — dead component. Delete it (or add to config \`ignore\` if it is WIP/a template).`,
      snippet: "",
    });
  }
  return diagnostics;
}
