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
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
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
});
