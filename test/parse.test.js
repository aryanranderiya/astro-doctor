import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStaticPathsSpan, getDoc, clearDocCache } from "../src/parse.js";
import { scanDir } from "../src/engine.js";

function run(ruleName, file, source) {
  return import("../src/rules/index.js").then(({ RULES }) => {
    const rule = RULES.find((r) => r.meta.name === ruleName);
    assert.ok(rule, `rule missing: ${ruleName}`);
    return rule.check(file, source);
  });
}

describe("getStaticPathsSpan", () => {
  it("handles declaration, arrow, and concise forms", () => {
    const fn = "export async function getStaticPaths(){ const x = await foo(); }";
    const arrow = "export const getStaticPaths = async () => { const x = await foo(); };";
    const concise = "export const getStaticPaths = () => posts.map(p => p);";
    for (const src of [fn, arrow, concise]) {
      const r = getStaticPathsSpan(src);
      assert.ok(r, src.slice(0, 30));
      assert.ok(src.slice(r.start, r.end).includes("getStaticPaths"));
    }
    assert.equal(getStaticPathsSpan("const x = 1;"), null);
  });

  it("powers refetch + mismatch rules for arrow forms", async () => {
    const bad = `---\nexport const prerender = false;\nexport const getStaticPaths = async () => [{ params: { id: "1" } }];\n---\n`;
    assert.equal((await run("astro/no-prerender-mismatch", "a.astro", bad)).length, 1);
    const refetch =
      "---\nexport const getStaticPaths = async () => { const a = await getCollection('x'); return a.map(e => ({ params: { id: e.id }, props: { e } })); };\nconst all = await getCollection('x');\n---\n";
    assert.equal((await run("astro/no-collection-refetch", "p/[id].astro", refetch)).length, 1);
  });
});

describe("navigate dataflow", () => {
  it("tracks single-arg taint, bails on reassignment", async () => {
    const tainted = `---\n---\n<script>const to = new URLSearchParams(location.search).get('next'); navigate(to);</script>`;
    const reassigned = `---\n---\n<script>let to = searchParams.get('x'); to = '/home'; navigate(to);</script>`;
    const clean = `---\n---\n<script>const to = '/home'; navigate(to);</script>`;
    assert.equal((await run("astro/no-unsafe-navigate", "a.astro", tainted)).length, 1);
    assert.equal((await run("astro/no-unsafe-navigate", "a.astro", reassigned)).length, 0);
    assert.equal((await run("astro/no-unsafe-navigate", "a.astro", clean)).length, 0);
  });
});

describe("head script refinement", () => {
  it("flags page-varying head scripts, skips static ones", async () => {
    clearDocCache();
    const varying = `---\n---\n<html><head><script is:inline>document.addEventListener('astro:page-load', () => init(Astro.url.pathname));</script></head><body></body></html>`;
    // NOTE: Astro.* is server-evaluated; its presence in a head script means
    // the emitted script differs per page and genuinely re-runs per nav.
    const staticHead = `---\n---\n<html><head><script is:inline>document.addEventListener('astro:page-load', init);</script></head><body></body></html>`;
    assert.equal((await run("astro/no-duplicate-nav-listeners", "a.astro", varying)).length, 1);
    assert.equal((await run("astro/no-duplicate-nav-listeners", "a.astro", staticHead)).length, 0);
  });
});

describe("versions agree", () => {
  it("package.json, bin, and engine share one version", async () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const { TOOL_VERSION } = await import("../src/engine.js");
    assert.equal(TOOL_VERSION, pkg.version);
    const bin = fs.readFileSync(new URL("../bin/astro-doctor.js", import.meta.url), "utf8");
    assert.ok(bin.includes(`const VERSION = "${pkg.version}";`));
  });
});

describe("persistent cache and fast mode", () => {
  function site(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-doctor-cache-"));
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }

  it("cached rescans agree; edits invalidate", () => {
    const dir = site({
      "src/a.astro": "---\n---\n<div client:load>x</div>\n",
      "src/pages/i.astro": "---\n---\n<div />\n",
    });
    const first = scanDir(dir, { cache: true });
    assert.ok(fs.existsSync(path.join(dir, ".astro-doctor-cache.json")));
    const second = scanDir(dir, { cache: true });
    assert.deepEqual(
      second.diagnostics.map((d) => d.rule),
      first.diagnostics.map((d) => d.rule)
    );
    fs.writeFileSync(path.join(dir, "src/a.astro"), "---\n---\n<div>clean</div>\n");
    const third = scanDir(dir, { cache: true });
    assert.ok(third.diagnostics.length < first.diagnostics.length);
  });

  it("--fast skips checkAll rules", () => {
    const dir = site({
      "src/pages/i.astro": "---\n---\n<div />\n",
      "src/components/Dead.astro": "---\n---\n<div>dead</div>\n",
    });
    const full = scanDir(dir, {});
    const fast = scanDir(dir, { fast: true });
    assert.ok(full.diagnostics.some((d) => d.rule === "astro/no-dead-component"));
    assert.ok(!fast.diagnostics.some((d) => d.rule === "astro/no-dead-component"));
  });
});
