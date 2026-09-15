import path from "node:path";

export const meta = {
  name: "astro/no-huge-file",
  category: "Maintainability",
  severity: "warning",
  description:
    "Oversized files resist review and hide duplication — split components, extract lib helpers, or co-locate. Budgets: 400 lines (.astro), 800 (.tsx/.ts).",
};

const BUDGETS = new Map([
  [".astro", 400],
  [".tsx", 800],
  [".ts", 800],
  [".jsx", 800],
  [".mdx", 400],
]);

export function checkAll(files, read) {
  const diagnostics = [];
  for (const file of files) {
    const ext = path.extname(file);
    const budget = BUDGETS.get(ext);
    if (!budget) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    const lines = source.split("\n").length;
    if (lines <= budget) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: 1,
      message: `'${path.basename(file)}' is ${lines} lines (budget ${budget}) — split the component, extract helpers to src/lib/, or co-locate subcomponents. Suppress per-file with a reason if it is a deliberate kitchen-sink (style guide).`,
      snippet: "",
    });
    if (diagnostics.length >= 10) break;
  }
  return diagnostics;
}
