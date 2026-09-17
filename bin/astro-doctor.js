#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { scanDir, scanFiles, collectCorpusFiles, scoreFor, gradeFor, RULES, topRules, byCategory } from "../src/engine.js";
import { loadConfig } from "../src/config.js";

const VERSION = "0.20.1";
const args = process.argv.slice(2);

function help() {
  const lines = [
    `astro-doctor v${VERSION} — deterministic static analysis for Astro`,
    ``,
    `Usage:`,
    `  astro-doctor [dir] [--json] [--verbose] [--quiet] [--config <file>]`,
    `  astro-doctor [dir] [--fast] [--cache] [--staged] [--blocking <level>]`,
    `  astro-doctor rules [--json]`,
    `  astro-doctor ci install [--dir <project>] [--yes]`,
    ``,
    `  [dir]       folder to scan (default: current directory)`,
    `  --json      machine-readable output { ok, score, filesScanned, diagnostics[] }`,
    `  --verbose   print rule list + config file used`,
    `  --quiet     print only the score line (human mode)`,
    `  --config    path to astro-doctor.config.mjs (default: auto-discover)`,
    `  --fast      per-file rules only (skip project-wide reference scans)`,
    `  --cache     persist per-file findings in .astro-doctor-cache.json`,
    `  --staged    scan only staged .astro files (pre-commit hook; exits 0 when none)`,
    `  --blocking  severity that fails: error (default), warning, or none (advisory)`,
    `  rules       list all rules with severity + description`,
    ``,
    `Suppression (no allowlists — be explicit):`,
    `  <!-- astro-doctor-ignore-next-line astro/no-unsafe-set-html -- trusted sprite -->`,
    `  {/* astro-doctor-ignore-next-line astro/no-unsafe-set-html */}`,
    ``,
    `Config file (astro-doctor.config.mjs):`,
    `  export default { rules: { "astro/no-too-many-islands": "off" }, ignore: ["src/pages/f4llout/**"] };`,
    ``,
    `Exit code 1 when the --blocking gate fails (default: any error; 'warning' fails on warnings; 'none' never fails).`,
  ];
  console.log(lines.join("\n"));
}

if (args.includes("--help") || args.includes("-h")) {
  help();
  process.exit(0);
}
if (args.includes("--version") || args.includes("-V")) {
  console.log(VERSION);
  process.exit(0);
}
if (args[0] === "rules") {
  const asJson = args.includes("--json");
  if (asJson) {
    console.log(JSON.stringify(RULES.map((r) => r.meta), null, 2));
  } else {
    for (const r of RULES) {
      console.log(`${r.meta.severity.padEnd(7)} ${r.meta.name}  [${r.meta.category}]`);
      console.log(`         ${r.meta.description}`);
    }
  }
  process.exit(0);
}

const KNOWN_SUBCOMMANDS = new Set(["rules", "ci"]);
if (args[0] && !args[0].startsWith("-") && !KNOWN_SUBCOMMANDS.has(args[0])) {
  // A bare directory hits the scan path below; anything else is a typo.
  // (Matches a real directory? Then it's a scan target, not a subcommand.)
  try {
    const st = fs.statSync(path.resolve(args[0]));
    if (!st.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`astro-doctor: unknown command '${args[0]}' (try --help).`);
    process.exit(2);
  }
}

if (args[0] === "ci" && args[1] === "install") {  const dirIdx = args.indexOf("--dir");
  const projectDir = path.resolve(dirIdx !== -1 && args[dirIdx + 1] ? args[dirIdx + 1] : process.cwd());
  const yes = args.includes("--yes") || args.includes("-y");
  const dest = path.join(projectDir, ".github", "workflows", "astro-doctor.yml");
  if (fs.existsSync(dest) && !yes) {
    console.error(`astro-doctor: ${dest} already exists (pass --yes to overwrite).`);
    process.exit(2);
  }
  const workflow = `name: astro-doctor

on:
  pull_request:
  push:
    branches: [main]

jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm i -g astro-doctor@latest
      - name: Scan (gate on errors)
        run: astro-doctor --json > astro-doctor.json
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: astro-doctor-report
          path: astro-doctor.json
`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, workflow);
  console.log(`astro-doctor: wrote ${dest}`);
  console.log(`  - fails the check when any error-severity finding exists (exit 1)`);
  console.log(`  - point the install at your fork: github:<owner>/astro-doctor`);
  process.exit(0);
}

const asJson = args.includes("--json");
const verbose = args.includes("--verbose");
const quiet = args.includes("--quiet");
const staged = args.includes("--staged");
// Positional scan dir: skip flags and the values of flags that take one
// (--blocking error would otherwise be mistaken for a directory).
const VALUE_FLAGS = new Set(["--config", "--blocking"]);
const positionals = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    i++;
    continue;
  }
  if (a.startsWith("-") || a === "rules" || a === "ci") continue;
  positionals.push(a);
}
const target = path.resolve(positionals[0] ?? process.cwd());

// --blocking <level>: which severity fails the run (CI/hook gate).
const BLOCKING = new Set(["error", "warning", "none"]);
let blocking = "error";
const blockIdx = args.indexOf("--blocking");
if (blockIdx !== -1) {
  blocking = args[blockIdx + 1] ?? "";
  if (!BLOCKING.has(blocking)) {
    console.error(`astro-doctor: --blocking must be one of error|warning|none (got '${args[blockIdx + 1] ?? ""}').`);
    process.exit(2);
  }
}

// --staged: scan only staged .astro files (pre-commit hook). Cross-file
// rules still see the full project corpus for context, but only findings
// in staged files are reported.
function stagedAstroFiles(cwd) {
  let toplevel;
  try {
    toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    console.error("astro-doctor: --staged needs a git repository.");
    process.exit(2);
  }
  let raw = "";
  try {
    raw = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
      cwd: toplevel,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    console.error(`astro-doctor: git diff --cached failed: ${err?.message ?? err}`);
    process.exit(2);
  }
  const files = raw
    .split("\0")
    .filter(Boolean)
    .map((f) => path.resolve(toplevel, f))
    .filter((f) => f.endsWith(".astro"));
  const existing = files.filter((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false; // staged deletion — nothing to scan
    }
  });
  return { toplevel, files: [...new Set(existing)].sort() };
}

let configRoot = target;
let stagedInfo = null;
if (staged) {
  stagedInfo = stagedAstroFiles(target);
  configRoot = stagedInfo.toplevel;
}

let config = {};
let configFile = null;
const cfgIdx = args.indexOf("--config");
if (cfgIdx !== -1 && args[cfgIdx + 1]) {
  const full = path.resolve(args[cfgIdx + 1]);
  try {
    config = (await import(`file://${full}`)).default ?? {};
    configFile = full;
  } catch (err) {
    console.error(`astro-doctor: cannot load --config ${full}: ${err?.message ?? err}`);
    process.exit(2);
  }
} else {
  config = await loadConfig(configRoot);
  configFile = config.__file ?? null;
}

// Fail-open would be silent: a typo'd rule name must not silently do nothing.
{
  const known = new Set(RULES.map((r) => r.meta.name));
  const unknown = Object.keys(config.rules ?? {}).filter((k) => !known.has(k));
  for (const k of unknown) {
    const msg = `astro-doctor: unknown rule '${k}' in config (from ${configFile ?? "--config"}) — ignored. Run \`astro-doctor rules\` for valid names.`;
    if (asJson) {
      console.error(msg);
    } else {
      console.log(`  warning: ${msg}`);
    }
  }
}

let filesScanned;
let diagnostics;
let score;
let grade;
let scanTarget = target;
if (stagedInfo) {
  scanTarget = stagedInfo.toplevel;
  if (stagedInfo.files.length === 0) {
    filesScanned = 0;
    diagnostics = [];
    score = 100;
    grade = "A";
  } else {
    // Full corpus for cross-file context; report staged files only.
    const stagedSet = new Set(stagedInfo.files);
    const fullConfig = { ...config, __root: stagedInfo.toplevel };
    const corpus = new Map();
    if (!args.includes("--fast") && RULES.some((r) => typeof r.checkAll === "function")) {
      for (const f of collectCorpusFiles(stagedInfo.toplevel)) {
        if (corpus.has(f)) continue;
        try {
          corpus.set(f, fs.readFileSync(f, "utf8"));
        } catch {
          corpus.set(f, "");
        }
      }
    }
    const result = scanFiles(stagedInfo.files, {
      config: fullConfig,
      fast: args.includes("--fast"),
      corpus,
    });
    filesScanned = result.filesScanned;
    diagnostics = result.diagnostics.filter((d) => stagedSet.has(d.file));
    score = scoreFor(diagnostics);
    grade = gradeFor(score);
  }
} else {
  ({ filesScanned, diagnostics, score, grade } = scanDir(target, {
    config,
    fast: args.includes("--fast"),
    cache: args.includes("--cache"),
  }));
}
const errors = diagnostics.filter((d) => d.severity === "error").length;
const warnings = diagnostics.length - errors;
const failed =
  blocking === "none" ? false : blocking === "warning" ? diagnostics.length > 0 : errors > 0;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: !failed,
        tool: "astro-doctor",
        version: VERSION,
        target: scanTarget,
        staged,
        blocking,
        score,
        grade,
        filesScanned,
        errors,
        warnings,
        rulesRun: RULES.length,
        byCategory: byCategory(diagnostics),
        byRule: Object.fromEntries(topRules(diagnostics, RULES.length)),
        diagnostics: diagnostics.map((d) => ({
          rule: d.rule,
          category: d.category,
          severity: d.severity,
          file: d.file,
          line: d.line,
          message: d.message,
          snippet: d.snippet,
        })),
      },
      null,
      2
    )
  );
} else {
  if (staged) {
    console.log(`astro-doctor v${VERSION} — ${filesScanned} staged .astro files, score ${score}/100 (${grade})`);
    console.log(`  ${errors} error(s), ${warnings} warning(s) in ${scanTarget}`);
  } else {
    console.log(`astro-doctor v${VERSION} — ${filesScanned} .astro files, score ${score}/100 (${grade})`);
    console.log(`  ${errors} error(s), ${warnings} warning(s) in ${target}`);
  }
  if (verbose) {
    console.log(`  rules: ${RULES.length}, config: ${configFile ?? "(none)"}`);
  }
  if (quiet) {
    // score line only
  } else if (diagnostics.length === 0) {
    console.log("\n  Clean.");
  } else {
    console.log("");
    let lastFile = "";
    for (const d of diagnostics) {
      if (d.file !== lastFile) {
        lastFile = d.file;
        console.log(`${path.relative(scanTarget, d.file) || d.file}`);
      }
      console.log(`  ${d.severity === "error" ? "ERROR" : "WARN "} [${d.line}] ${d.rule}`);
      console.log(`         ${d.message}`);
      if (d.snippet) console.log(`         → ${d.snippet}`);
    }
    const top = topRules(diagnostics, 3);
    if (top.length > 0) {
      console.log(`\n  Top offenders: ${top.map(([r, n]) => `${n}x ${r}`).join(", ")}`);
    }
  }
  if (verbose) console.log(`\nUse --json for agent/CI consumption. Suppress with astro-doctor-ignore-next-line.`);
}

// NOTE: exitCode (not process.exit) — process.exit() can truncate piped
// stdout, corrupting --json output.
process.exitCode = failed ? 1 : 0;
