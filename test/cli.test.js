import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "astro-doctor.js");

function run(args, cwd) {
  try {
    const stdout = execFileSync("node", [BIN, ...args], {
      cwd: cwd ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function tmpSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-doctor-"));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function tmpRepo(files, stage) {
  const dir = tmpSite(files);
  git(["init", "-q"], dir);
  git(["config", "user.email", "test@test.t"], dir);
  git(["config", "user.name", "test"], dir);
  for (const f of stage) git(["add", f], dir);
  return dir;
}

const CLEAN = `---\nconst x = 1;\n---\n<div>{x}</div>\n`;
const DIRTY = `---\n---\n<div client:load>x</div>\n`;
const WARN_ONLY = `---\nconst x = 1;\n---\n<button onclick="doIt()">hi</button>\n`;

describe("cli", () => {
  it("--help and --version exit 0", () => {
    assert.equal(run(["--help"]).code, 0);
    assert.match(run(["--version"]).stdout, /^\d+\.\d+\.\d+/m);
  });

  it("unknown subcommand exits 2", () => {
    const r = run(["frobnicate"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown command/);
  });

  it("clean site exits 0 with score 100; dirty site exits 1 with ok:false", () => {
    const clean = tmpSite({ "src/a.astro": `---\nconst x = 1;\n---\n<div>{x}</div>\n` });
    const r1 = run([clean, "--json"]);
    assert.equal(r1.code, 0);
    const j1 = JSON.parse(r1.stdout);
    assert.equal(j1.ok, true);
    assert.equal(j1.score, 100);

    const dirty = tmpSite({ "src/a.astro": `---\n---\n<div client:load>x</div>\n` });
    const r2 = run([dirty, "--json"]);
    assert.equal(r2.code, 1);
    const j2 = JSON.parse(r2.stdout);
    assert.equal(j2.ok, false);
    assert.ok(j2.errors >= 1);
    assert.ok(Array.isArray(j2.diagnostics) && j2.diagnostics.length > 0);
  });

  it("--json stays valid at large output sizes (no truncation)", () => {
    // Regression: process.exit() used to race piped stdout, corrupting JSON.
    const files = {};
    for (let i = 0; i < 30; i++) {
      files[`src/p${i}.astro`] = `---\n---\n<div client:load>one</div>\n<div client:load>two</div>\n<img src="/missing-${i}.png">\n`;
    }
    const site = tmpSite(files);
    const r = run([site, "--json"]);
    assert.equal(r.code, 1);
    assert.ok(r.stdout.length > 20000, `expected large output, got ${r.stdout.length}`);
    const j = JSON.parse(r.stdout); // throws if truncated
    assert.ok(j.diagnostics.length > 50);
  });

  it("rules lists every registered rule", () => {
    const r = run(["rules", "--json"]);
    assert.equal(r.code, 0);
    const rules = JSON.parse(r.stdout);
    assert.ok(rules.length >= 30);
    assert.ok(rules.every((x) => x.name.startsWith("astro/")));
  });

  it("--blocking gates the exit code (error default, warning, none)", () => {
    const site = tmpSite({ "src/w.astro": WARN_ONLY });
    const def = run([site, "--json"]);
    assert.equal(def.code, 0); // warnings don't fail the default gate
    assert.equal(JSON.parse(def.stdout).ok, true);
    const warn = run([site, "--json", "--blocking", "warning"]);
    assert.equal(warn.code, 1);
    assert.equal(JSON.parse(warn.stdout).ok, false);
    const none = run([site, "--json", "--blocking", "none"]);
    assert.equal(none.code, 0);
    assert.equal(JSON.parse(none.stdout).ok, true);
    const bad = run([site, "--blocking", "bogus"]);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /--blocking must be one of/);
  });

  it("flag values are never mistaken for the scan directory", () => {
    const site = tmpSite({ "src/w.astro": WARN_ONLY });
    // No [dir] positional: cwd is the target, 'warning' is --blocking's value.
    const r = run(["--json", "--blocking", "warning"], site);
    assert.equal(r.code, 1);
    assert.equal(JSON.parse(r.stdout).ok, false);
  });

  it("--staged scans only staged files; exits 0 when none staged", () => {
    const empty = tmpRepo({ "src/a.astro": DIRTY }, []);
    const r0 = run(["--staged", "--json"], empty);
    assert.equal(r0.code, 0);
    assert.equal(JSON.parse(r0.stdout).filesScanned, 0);

    const repo = tmpRepo({ "src/clean.astro": CLEAN, "src/dirty.astro": DIRTY }, ["src/dirty.astro"]);
    const r1 = run(["--staged", "--json"], repo);
    assert.equal(r1.code, 1);
    const j1 = JSON.parse(r1.stdout);
    assert.equal(j1.filesScanned, 1);
    assert.ok(j1.diagnostics.length > 0);
    assert.ok(j1.diagnostics.every((d) => d.file.endsWith("dirty.astro")));

    const repoClean = tmpRepo({ "src/clean.astro": CLEAN, "src/dirty.astro": DIRTY }, ["src/clean.astro"]);
    const r2 = run(["--staged", "--json"], repoClean);
    assert.equal(r2.code, 0);
    assert.equal(JSON.parse(r2.stdout).ok, true);
  });

  it("--staged outside a git repo exits 2", () => {
    const site = tmpSite({ "src/a.astro": CLEAN });
    const r = run(["--staged", "--json"], site);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /needs a git repository/);
  });
});
