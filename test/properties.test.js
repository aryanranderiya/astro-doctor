import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanTags, maskTemplate } from "../src/utils.js";
import { getDoc, clearDocCache } from "../src/parse.js";
import { RULES } from "../src/rules/index.js";
import { scanFiles } from "../src/engine.js";

const TRICKY = `---
import Hero from './Hero.astro';
import Counter from './Counter.tsx';
const items = await getCollection('blog');
---
<div class="a" title="x>y">
  <Hero />
  <Counter client:load count={n} onPick={(v)=>go(v)} />
  <my-el data-x="1" />
  {items.map((it) => (
    <Row client:visible key={it.id} />
  ))}
  <img src="/a.png" alt="a" width="10" height="10" loading="lazy">
</div>
<script is:inline>init();</script>`;

describe("compiler/scanner agreement", () => {
  it("same tag names at same lines (modulo fragments)", () => {
    clearDocCache();
    const doc = getDoc(TRICKY, "t.astro");
    assert.equal(doc.fallback, false);
    const masked = maskTemplate(TRICKY);
    const scanned = scanTags(masked).map((t) => `${t.name}:${t.index}`);
    // every scanner tag must exist in compiler tags at the same index
    const compiled = new Set(doc.tags.map((t) => `${t.name}:${t.index}`));
    for (const key of scanned) {
      assert.ok(compiled.has(key), `compiler missing scanner tag ${key}`);
    }
    // kinds beat casing heuristics: my-el is custom-element, Counter is component
    const byName = Object.fromEntries(doc.tags.map((t) => [t.name, t.kind]));
    assert.equal(byName["Counter"], "component");
    assert.equal(byName["my-el"], "custom-element");
    assert.equal(byName["div"], "element");
    // expression-nested island carries map context structurally
    const row = doc.tags.find((t) => t.name === "Row");
    assert.ok(row && row.inMap, "Row inMap via ancestor expression");
  });

  it("attribute values survive quoting and arrows", () => {
    clearDocCache();
    const doc = getDoc(TRICKY, "t.astro");
    const counter = doc.tags.find((t) => t.name === "Counter");
    const byName = Object.fromEntries(counter.attrs.map((a) => [a.name, a]));
    assert.equal(byName["count"].kind, "expression");
    assert.equal(byName["count"].value, "n");
    assert.equal(byName["client:load"].kind, "empty");
    const img = doc.tags.find((t) => t.name === "img");
    assert.equal(img.attrs.find((a) => a.name === "width").value, "10");
  });
});

describe("metamorphic properties", () => {
  const ISLANDS = `---
import A from './A.tsx';
import B from './B.tsx';
---
<A client:load onPick={(v)=>go(v)} />
<B client:load />
<div client:load>x</div>
`;
  const SCRIPTS = `---
const x = await getCollection('blog');
---
<script>fetch(import.meta.env.SECRET_X)</script>
<script>document.addEventListener('astro:page-load', init);</script>
<img src="/a.png">
`;
  const INERT = `\n<InertBlock><p>quiet content here</p></InertBlock>\n`;

  it("appending inert content never removes findings (per-file rules)", () => {
    clearDocCache();
    for (const base of [ISLANDS, SCRIPTS]) {
      for (const rule of RULES) {
        if (typeof rule.check !== "function") continue;
        const before = rule.check("m.astro", base);
        if (before.length === 0) continue;
        const after = rule.check("m.astro", base + INERT);
        for (const d of before) {
          assert.ok(
            after.some((a) => a.rule === d.rule && a.line === d.line && a.message === d.message),
            `${rule.meta.name} lost finding after inert append`
          );
        }
      }
    }
  });

  it("adding an unreferenced file never removes checkAll findings", async () => {
    const files = ["/r/src/pages/i.astro", "/r/src/components/Dead.astro"];
    const contents = {
      "/r/src/pages/i.astro": `---\n---\n<div />`,
      "/r/src/components/Dead.astro": `---\n---\n<div>dead</div>`,
    };
    const before = scanFiles(files, { read: (f) => contents[f] });
    const withExtra = scanFiles([...files, "/r/src/pages/other.astro"], {
      read: (f) => (f.endsWith("other.astro") ? `---\n---\n<p>hi</p>` : contents[f]),
    });
    const key = (d) => `${d.rule}|${d.file}|${d.line}|${d.message}`;
    const beforeKeys = new Set(before.diagnostics.map(key));
    const afterKeys = new Set(withExtra.diagnostics.map(key));
    for (const k of beforeKeys) assert.ok(afterKeys.has(k), `lost finding: ${k}`);
  });
});
