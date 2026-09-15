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
  let out = source;
  if (out.startsWith("---")) {
    const nl = out.indexOf("\n");
    const close = nl === -1 ? -1 : out.indexOf("\n---", nl + 1);
    if (close !== -1) {
      let end = close + 4;
      while (end < out.length && out[end] !== "\n") end++;
      out = out.slice(end);
    }
  }
  out = out
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // keep line numbers: map normalized line index -> original line number
  const numbered = [];
  const rawLines = out.split("\n");
  // offset of template body within source for line mapping
  const bodyOff = source.length - out.length;
  const baseLine = source.slice(0, bodyOff).split("\n").length;
  rawLines.forEach((raw, i) => {
    const norm = raw.replace(/\s+/g, " ").trim();
    if (!norm || norm === "{" || norm === "}" || norm === "(" || norm === ")") return;
    numbered.push({ norm, line: baseLine + i });
  });
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
