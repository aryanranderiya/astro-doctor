import { lineOf } from "../utils.js";

export const meta = {
  name: "astro/no-duplicate-markup",
  category: "Maintainability",
  severity: "warning",
  description:
    "Near-identical template blocks repeated across components (same player/figure/card wired twice with different defaults) should be one component — drift between copies is a matter of time.",
};

const WINDOW = 8;
const MIN_CHARS = 250;
const MAX_GROUPS = 5;

function templateLines(source) {
  // Line-based state machine (NOT content removal) so reported line numbers
  // are exact: skip frontmatter, script/style bodies, and comments.
  const numbered = [];
  const rawLines = source.split("\n");
  let i = 0;
  if (rawLines[0] === "---" || rawLines[0] === "\uFEFF---") {
    i = 1;
    while (i < rawLines.length && rawLines[i].trim() !== "---") i++;
    i++;
  }
  let inBlock = null; // "script" | "style" | "html" | "jsx"
  for (; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (inBlock === "script" || inBlock === "style") {
      if (new RegExp(`</${inBlock}\\s*>`, "i").test(line)) inBlock = null;
      continue;
    }
    if (inBlock === "html") {
      if (line.includes("-->")) inBlock = null;
      continue;
    }
    if (inBlock === "jsx") {
      if (line.includes("*/}")) inBlock = null;
      continue;
    }
    const scriptOpen = line.match(/<script\b[^>]*>/i);
    const styleOpen = line.match(/<style\b[^>]*>/i);
    const opensScript = scriptOpen && !/<\/script\s*>/i.test(line);
    const opensStyle = styleOpen && !/<\/style\s*>/i.test(line);
    if (opensScript || opensStyle) {
      inBlock = opensScript ? "script" : "style";
      continue;
    }
    if (line.includes("<!--") && !line.includes("-->")) {
      inBlock = "html";
      continue;
    }
    if (line.includes("{/*") && !line.includes("*/}")) {
      inBlock = "jsx";
      continue;
    }
    const norm = line.replace(/\s+/g, " ").trim();
    if (!norm || norm === "{" || norm === "}" || norm === "(" || norm === ")") continue;
    if (norm.startsWith("<!--") || norm.startsWith("{/*")) continue;
    numbered.push({ norm, line: i + 1 });
  }
  return numbered;
}

export function checkAll(files, read) {
  const perFile = new Map();
  for (const f of files) {
    if (!f.endsWith(".astro")) continue;
    try {
      perFile.set(f, templateLines(read(f)));
    } catch {
      continue;
    }
  }
  // window hash -> occurrences
  const groups = new Map();
  for (const [f, lines] of perFile) {
    for (let i = 0; i + WINDOW <= lines.length; i++) {
      const win = lines.slice(i, i + WINDOW);
      const text = win.map((l) => l.norm).join("\n");
      if (text.length < MIN_CHARS) continue;
      const key = text;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ file: f, line: win[0].line, end: win[WINDOW - 1].line });
    }
  }
  const diagnostics = [];
  const claimed = []; // suppress overlapping windows of the same duplication
  const ordered = [...groups.entries()]
    .filter(([, locs]) => new Set(locs.map((l) => l.file)).size >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [, locs] of ordered) {
    const first = locs[0];
    const overlap = claimed.some(
      (c) =>
        c.file === first.file && !(first.line > c.end || first.end < c.line)
    );
    if (overlap) continue;
    const others = [...new Set(locs.slice(1).map((l) => `${l.file.split("/").pop()}:${l.line}`))].slice(0, 3);
    claimed.push({ file: first.file, line: first.line, end: first.end });
    let snippet = "";
    try {
      const src = read(first.file);
      snippet = src.split("\n")[first.line - 1]?.trim().slice(0, 100) ?? "";
    } catch {
      snippet = "";
    }
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file: first.file,
      line: first.line,
      message: `This ${WINDOW}-line template block is duplicated in ${others.join(", ")} — extract a shared component (or merge the variants behind a prop) before the copies drift.`,
      snippet,
    });
    if (diagnostics.length >= MAX_GROUPS) break;
  }
  return diagnostics;
}
