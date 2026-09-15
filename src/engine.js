import fs from "node:fs";
import path from "node:path";
import { collectAstroFiles, isSuppressed } from "./utils.js";
import { resolveSeverity, isIgnored } from "./config.js";
import { RULES } from "./rules/index.js";

export { RULES };

const CORPUS_EXTS = new Set([
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
  ".webmanifest",
]);

const CORPUS_IGNORE = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".git",
  ".wrangler",
  ".vercel",
  ".netlify",
  "coverage",
]);

export function collectCorpusFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (CORPUS_IGNORE.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && CORPUS_EXTS.has(path.extname(e.name))) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

export function scoreFor(diagnostics) {
  // Asymptotic: every finding costs, but the score keeps discriminating
  // instead of clamping at 0 (16 errors used to read the same as 60).
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errors++;
    else warnings++;
  }
  return Math.round((100 * 100) / (100 + 10 * errors + 3 * warnings));
}

export function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function scanFiles(files, { config = {}, read = (f) => fs.readFileSync(f, "utf8"), corpus = new Map() } = {}) {
  const diagnostics = [];
  const sources = new Map();
  for (const file of files) {
    if (isIgnored(config, file, config.__root ?? process.cwd())) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    sources.set(file, source);
    for (const rule of RULES) {
      if (typeof rule.check !== "function") continue; // checkAll-only rules run below
      const defSeverity = rule.meta?.severity ?? "warning";
      const sev = resolveSeverity(config, rule.meta?.name, defSeverity);
      if (sev === "off") continue;
      let found = [];
      try {
        found = rule.check(file, source) ?? [];
      } catch (err) {
        diagnostics.push({
          rule: rule.meta?.name ?? "astro/internal",
          category: "Internal",
          severity: "warning",
          file,
          line: 1,
          message: `rule crashed: ${err?.message ?? err}`,
          snippet: "",
        });
        continue;
      }
      for (const d of found) {
        const severity = sev !== defSeverity ? sev : (d.severity ?? defSeverity);
        if (isSuppressed(source, d.line, d.rule)) continue;
        diagnostics.push({ ...d, severity });
      }
    }
  }
  // Cross-file rules (import graph, duplicates) run once over everything.
  // Their corpus extends beyond .astro: importers live in .tsx/.mdx/.ts too.
  const root = config.__root ?? process.cwd();
  const readAny = (f) => {
    if (sources.has(f)) return sources.get(f);
    if (corpus.has(f)) return corpus.get(f);
    try {
      return read(f);
    } catch {
      return "";
    }
  };
  const ctx = {
    root,
    config,
    exists: (f) => {
      try {
        return fs.existsSync(f);
      } catch {
        return false;
      }
    },
  };
  const corpusFiles = [...new Set([...sources.keys(), ...corpus.keys()])];
  for (const rule of RULES) {
    if (typeof rule.checkAll !== "function") continue;
    const defSeverity = rule.meta?.severity ?? "warning";
    const sev = resolveSeverity(config, rule.meta?.name, defSeverity);
    if (sev === "off") continue;
    let found = [];
    try {
      found = rule.checkAll(corpusFiles, readAny, ctx) ?? [];
    } catch (err) {
      diagnostics.push({
        rule: rule.meta?.name ?? "astro/internal",
        category: "Internal",
        severity: "warning",
        file: [...sources.keys()][0] ?? ".",
        line: 1,
        message: `rule crashed: ${err?.message ?? err}`,
        snippet: "",
      });
      continue;
    }
    for (const d of found) {
      const severity = sev !== defSeverity ? sev : (d.severity ?? defSeverity);
      const src = sources.get(d.file) ?? readAny(d.file);
      if (src && isSuppressed(src, d.line, d.rule)) continue;
      diagnostics.push({ ...d, severity });
    }
  }
  diagnostics.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line
  );
  const score = scoreFor(diagnostics);
  return { filesScanned: sources.size, diagnostics, score, grade: gradeFor(score) };
}

export function scanDir(root, opts = {}) {
  const files = collectAstroFiles(root);
  const config = { ...(opts.config ?? {}), __root: root };
  // Corpus for cross-file rules: read siblings once (importers, content).
  const corpus = new Map();
  if (RULES.some((r) => typeof r.checkAll === "function")) {
    for (const f of collectCorpusFiles(root)) {
      if (corpus.has(f)) continue;
      try {
        corpus.set(f, fs.readFileSync(f, "utf8"));
      } catch {
        corpus.set(f, "");
      }
    }
  }
  return scanFiles(files, { ...opts, config, corpus });
}

export function topRules(diagnostics, n = 3) {
  const counts = new Map();
  for (const d of diagnostics) counts.set(d.rule, (counts.get(d.rule) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function byCategory(diagnostics) {
  const counts = {};
  for (const d of diagnostics) {
    counts[d.category] = (counts[d.category] ?? 0) + 1;
  }
  return counts;
}
