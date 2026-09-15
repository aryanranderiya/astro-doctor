import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../src/rules/index.js";
import { scanFiles } from "../src/engine.js";

function run(ruleName, file, source) {
  const rule = RULES.find((r) => r.meta.name === ruleName);
  assert.ok(rule, `rule missing: ${ruleName}`);
  return rule.check(file, source);
}

describe("rule registry", () => {
  it("has 42 general rules, all with meta", () => {
    assert.equal(RULES.length, 42);
    for (const r of RULES) {
      assert.match(r.meta.name, /^astro\//);
      assert.ok(["error", "warning"].includes(r.meta.severity));
      assert.ok(r.meta.description.length > 20);
    }
  });
});

describe("correctness", () => {
  it("no-client-directive-on-html flags native tags, allows islands", () => {
    assert.equal(run("astro/no-client-directive-on-html", "a.astro", `<div client:load>x</div>`).length, 1);
    assert.equal(run("astro/no-client-directive-on-html", "a.astro", `<Counter client:visible />`).length, 0);
  });

  it("no-document-in-frontmatter only scans --- fence", () => {
    const bad = `---\nconst t = localStorage.getItem("t");\n---\n<div />`;
    const ok = `---\nconst x = 1;\n---\n<script>localStorage.getItem("t")</script>`;
    assert.equal(run("astro/no-document-in-frontmatter", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-document-in-frontmatter", "a.astro", ok).length, 0);
  });

  it("no-hooks-in-frontmatter flags useState", () => {
    assert.equal(run("astro/no-hooks-in-frontmatter", "a.astro", `---\nconst [c,setC]=useState(0)\n---\n`).length, 1);
    assert.equal(run("astro/no-hooks-in-frontmatter", "a.astro", `---\nconst x=1\n---\n`).length, 0);
  });

  it("no-non-serializable-island-props flags inline handlers", () => {
    assert.equal(
      run("astro/no-non-serializable-island-props", "a.astro", `<List client:load onSelect={(x)=>setX(x)} />`).length,
      1
    );
    assert.equal(
      run("astro/no-non-serializable-island-props", "a.astro", `<List client:load initial={ids} />`).length,
      0
    );
  });

  it("no-prerender-mismatch requires both halves", () => {
    const bad = `---\nexport const prerender=false;\nexport function getStaticPaths(){}\n---\n`;
    assert.equal(run("astro/no-prerender-mismatch", "a.astro", bad).length, 1);
  });

  it("no-missing-html-lang skips components", () => {
    assert.equal(run("astro/no-missing-html-lang", "c.astro", `<div />`).length, 0);
    assert.equal(run("astro/no-missing-html-lang", "l.astro", `<html><head><title>t</title></head></html>`).length, 1);
  });
});

describe("performance", () => {
  it("no-client-load-abuse thresholds", () => {
    const one = `<A client:load />`;
    const two = `<A client:load /><B client:load />`;
    const four = two + `<C client:load /><D client:load />`;
    assert.equal(run("astro/no-client-load-abuse", "a.astro", one).length, 0);
    assert.equal(run("astro/no-client-load-abuse", "a.astro", two).length, 1);
    const diags = run("astro/no-client-load-abuse", "a.astro", four);
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "error");
  });

  it("no-client-on-astro-component resolves .astro imports", () => {
    const bad = `---\nimport Hero from './Hero.astro';\n---\n<Hero client:load />`;
    const ok = `---\nimport Hero from './Hero.astro';\nimport Counter from './Counter.tsx';\n---\n<Hero /><Counter client:visible />`;
    assert.equal(run("astro/no-client-on-astro-component", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-client-on-astro-component", "a.astro", ok).length, 0);
  });

  it("no-unsafe-set-html escalates third-party HTML to error", () => {
    const d = run("astro/no-unsafe-set-html", "a.astro", `<span set:html={data.textHtml} />`);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
    const w = run("astro/no-unsafe-set-html", "a.astro", `<figcaption set:html={caption} />`);
    assert.equal(w.length, 1);
    assert.equal(w[0].severity, "warning");
  });

  it("prefer-astro-image ignores comments/scripts/frontmatter", () => {
    assert.equal(run("astro/prefer-astro-image", "a.astro", `---\n// <img> in comment\n---\n<div />`).length, 0);
    assert.equal(
      run("astro/prefer-astro-image", "a.astro", `<img src="/a.jpg" alt="a" width="10" height="10" loading="lazy">`).length,
      0
    );
    assert.equal(run("astro/prefer-astro-image", "a.astro", `<img src="/a.jpg">`).length, 1);
  });

  it("no-fetch-waterfall needs Promise.all", () => {
    const bad = `---\nconst a=await fetch(u1);\nconst b=await fetch(u2);\n---\n`;
    const ok = `---\nconst [a,b]=await Promise.all([fetch(u1),fetch(u2)]);\n---\n`;
    assert.equal(run("astro/no-fetch-waterfall", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-fetch-waterfall", "a.astro", ok).length, 0);
  });
});

describe("security", () => {
  it("no-unsafe-set-html escalates third-party HTML to error", () => {
    assert.equal(run("astro/no-unsafe-set-html", "a.astro", `<span set:html={caption} />`).length, 1);
    assert.equal(
      run("astro/no-unsafe-set-html", "a.astro", `<script type="application/ld+json" set:html={JSON.stringify(x)} />`).length,
      0
    );
  });

  it("no-client-env-leak flags secrets in client script", () => {
    const bad = `---\n---\n<script>fetch(import.meta.env.DB_PASSWORD)</script>`;
    const ok = `---\n---\n<script>fetch(import.meta.env.PUBLIC_API)</script>`;
    assert.equal(run("astro/no-client-env-leak", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-client-env-leak", "a.astro", ok).length, 0);
  });

  it("suppression comments work end-to-end", () => {
    const src = `---\n---\n<!-- astro-doctor-ignore-next-line astro/prefer-astro-image -->\n<img src="/a.jpg">\n`;
    const res = scanFiles(["a.astro"], { read: () => src });
    assert.ok(!res.diagnostics.some((d) => d.rule === "astro/prefer-astro-image"));
  });
});

describe("data-fetching", () => {
  it("no-collection-refetch flags second load outside getStaticPaths", () => {
    const bad = `---\nexport async function getStaticPaths(){const a=await getCollection('x');return a.map(e=>({params:{id:e.id},props:{e}}))}\nconst all=await getCollection('x');\n---\n`;
    const ok = `---\nexport async function getStaticPaths(){const a=await getCollection('x');return a.map(e=>({params:{id:e.id},props:{e}}))}\n---\n`;
    assert.equal(run("astro/no-collection-refetch", "p/[id].astro", bad).length, 1);
    assert.equal(run("astro/no-collection-refetch", "p/[id].astro", ok).length, 0);
  });

  it("no-large-island-props flags raw collection arrays, allows mapped DTOs", () => {
    const bad = `---\nconst allPosts=await getCollection('blog');\n---\n<List items={allPosts} client:visible />`;
    const ok = `---\nconst allPosts=await getCollection('blog');\nconst posts=allPosts.map(p=>({slug:p.id}));\n---\n<List items={posts} client:visible />`;
    const d = run("astro/no-large-island-props", "a.astro", bad);
    assert.equal(d.length, 1);
    assert.equal(run("astro/no-large-island-props", "a.astro", ok).length, 0);
    const spread = `---\nconst entries=await getCollection('x');\n---\n<Card client:load {...entry} />`;
    assert.equal(run("astro/no-large-island-props", "a.astro", spread)[0]?.severity, "error");
    void d;
  });
});

describe("router lifecycle", () => {
  it("no-router-unaware-script flags bare DOMContentLoaded only", () => {
    const bad = `---\n---\n<script>document.addEventListener('DOMContentLoaded', init);</script>`;
    const okPageLoad = `---\n---\n<script>document.addEventListener('astro:page-load', init);</script>`;
    const okReady = `---\n---\n<script>if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}else{init()}</script>`;
    assert.equal(run("astro/no-router-unaware-script", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-router-unaware-script", "a.astro", okPageLoad).length, 0);
    assert.equal(run("astro/no-router-unaware-script", "a.astro", okReady).length, 0);
  });

  it("no-unguarded-script-injection flags reinvented widgets, allows guarded", () => {
    const bad = `---\n---\n<script is:inline>function load(){const s=document.createElement('script');s.src='https://x/y.js';document.body.appendChild(s)}load();</script>`;
    const nullCheckOnly = `---\n---\n<script is:inline>function load(){const c=document.getElementById('x');if(!c)return;const s=document.createElement('script');s.src='https://x/y.js';c.appendChild(s)}load();</script>`;
    const okDataset = `---\n---\n<script is:inline>function load(){if(mount.dataset.loaded)return;mount.dataset.loaded='true';const s=document.createElement('script');s.src='https://x/y.js';mount.appendChild(s)}load();</script>`;
    const okFlag = `---\n---\n<script is:inline>var loaded=false;function load(){if(loaded)return;loaded=true;const s=document.createElement('script');s.src='https://x/y.js';document.head.appendChild(s)}</script>`;
    const d = run("astro/no-unguarded-script-injection", "a.astro", bad);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
    assert.equal(run("astro/no-unguarded-script-injection", "a.astro", nullCheckOnly).length, 1);
    assert.equal(run("astro/no-unguarded-script-injection", "a.astro", okDataset).length, 0);
    assert.equal(run("astro/no-unguarded-script-injection", "a.astro", okFlag).length, 0);
  });

  it("no-unsafe-storage-access respects try/catch", () => {
    const bad = `---\n---\n<script>var t=localStorage.getItem('theme');</script>`;
    const ok = `---\n---\n<script>var t;try{t=localStorage.getItem('theme')}catch{t='light'}</script>`;
    assert.equal(run("astro/no-unsafe-storage-access", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-unsafe-storage-access", "a.astro", ok).length, 0);
  });

  it("no-unbounded-collection requires filter and bound on prerender=false", () => {
    const noFilter = `---\nexport const prerender=false;\nconst a=await getCollection('blog');\n---\n`;
    const filterNoBound = `---\nexport const prerender=false;\nconst a=await getCollection('blog',({data})=>!data.draft);\n---\n`;
    const bounded = `---\nexport const prerender=false;\nconst a=(await getCollection('blog',({data})=>!data.draft)).slice(0,5);\n---\n`;
    assert.equal(run("astro/no-unbounded-collection", "p.astro", noFilter).length, 1);
    assert.equal(run("astro/no-unbounded-collection", "p.astro", filterNoBound).length, 1);
    assert.equal(run("astro/no-unbounded-collection", "p.astro", bounded).length, 0);
  });

  it("no-duplicate-nav-listeners flags unguarded, allows bound flags", () => {
    const bad = `---\n---\n<body><script is:inline>document.addEventListener('astro:page-load', init);</script></body>`;
    const okWrap = `---\n---\n<body><script is:inline>if(window.__xBound){}else{window.__xBound=true;document.addEventListener('astro:page-load', init);}</script></body>`;
    const okEarly = `---\n---\n<body><script is:inline>if(window.__xBound)return;window.__xBound=true;document.addEventListener('astro:page-load', init);</script></body>`;
    const okHead = `---\n---\n<head><script>document.addEventListener('astro:after-swap', init);</script></head>`;
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", okWrap).length, 0);
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", okEarly).length, 0);
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", okHead).length, 0);
  });
});

describe("breakage and hygiene", () => {
  it("no-inline-event-handler flags on* attributes in template only", () => {
    const bad = `---\n---\n<img src="/a.jpg" onerror="this.style.display='none'">`;
    const okScript = `---\n---\n<script>img.addEventListener('error', hide);</script>`;
    assert.equal(run("astro/no-inline-event-handler", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-inline-event-handler", "a.astro", okScript).length, 0);
  });

  it("no-unhandled-promise allows catch and two-arg then", () => {
    const bad = `---\n---\n<script>Promise.all([import('x')]).then(m=>mount(m));</script>`;
    const okCatch = `---\n---\n<script>Promise.all([import('x')]).then(m=>mount(m)).catch(showError);</script>`;
    const okTwoArg = `---\n---\n<script>t.finished.then(done, done);</script>`;
    assert.equal(run("astro/no-unhandled-promise", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-unhandled-promise", "a.astro", okCatch).length, 0);
    assert.equal(run("astro/no-unhandled-promise", "a.astro", okTwoArg).length, 0);
  });

  it("no-dead-component finds unreferenced files via scanFiles", () => {
    const files = ["src/components/Live.astro", "src/components/Dead.astro", "src/pages/index.astro"];
    const contents = {
      "src/components/Live.astro": `---\n---\n<div>live</div>`,
      "src/components/Dead.astro": `---\n---\n<div>dead</div>`,
      "src/pages/index.astro": `---\nimport Live from '../components/Live.astro';\n---\n<Live />`,
    };
    const res = scanFiles(files, { read: (f) => contents[f] });
    const dead = res.diagnostics.filter((d) => d.rule === "astro/no-dead-component");
    assert.equal(dead.length, 1);
    assert.equal(dead[0].file, "src/components/Dead.astro");
  });

  it("no-dead-component follows transitive deadness to fixpoint", () => {    const files = ["src/pages/index.astro", "src/components/DeadA.astro", "src/components/DeadB.astro"];
    const contents = {
      "src/pages/index.astro": `---\n---\n<div>home</div>`,
      "src/components/DeadA.astro": `---\nimport DeadB from './DeadB.astro';\n---\n<DeadB />`,
      "src/components/DeadB.astro": `---\n---\n<div>b</div>`,
    };
    const res = scanFiles(files, { read: (f) => contents[f] });
    const dead = res.diagnostics
      .filter((d) => d.rule === "astro/no-dead-component")
      .map((d) => d.file)
      .sort();
    assert.deepEqual(dead, ["src/components/DeadA.astro", "src/components/DeadB.astro"]);
  });

  it("no-dead-component covers tsx islands, ignores entries", () => {
    const files = [
      "src/pages/index.astro",
      "src/components/Live.tsx",
      "src/components/Dead.tsx",
      "src/middleware.ts",
    ];
    const contents = {
      "src/pages/index.astro": `---\nimport Live from '../components/Live.tsx';\n---\n<Live client:visible />`,
      "src/components/Live.tsx": `export default function Live(){return null}`,
      "src/components/Dead.tsx": `export default function Dead(){return null}`,
      "src/middleware.ts": `export function onRequest(){}`,
    };
    const res = scanFiles(files, { read: (f) => contents[f] });
    const dead = res.diagnostics
      .filter((d) => d.rule === "astro/no-dead-component")
      .map((d) => d.file);
    assert.deepEqual(dead, ["src/components/Dead.tsx"]);
  });

  it("scoreFor discriminates instead of clamping", async () => {
    const { scoreFor } = await import("../src/engine.js");
    assert.equal(scoreFor([]), 100);
    assert.ok(scoreFor([{ severity: "error" }]) > scoreFor(new Array(10).fill({ severity: "error" })));
    assert.ok(scoreFor(new Array(10).fill({ severity: "error" })) > 0);
  });

  it("no-missing-color-scheme flags dark shells without declaration", () => {
    const bad = `<html><head><title>t</title></head><body class="dark"><script>localStorage.getItem('theme')</script></body></html>`;
    const ok = `<html><head><meta name="color-scheme" content="light dark"></head><body class="dark"></body></html>`;
    const comp = `<div class="dark">x</div>`;
    const mediaOnly = `<html><head><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000"></head><body class="dark"></body></html>`;
    assert.equal(run("astro/no-missing-color-scheme", "l.astro", bad).length, 1);
    assert.equal(run("astro/no-missing-color-scheme", "l.astro", ok).length, 0);
    assert.equal(run("astro/no-missing-color-scheme", "c.astro", comp).length, 0);
    assert.equal(run("astro/no-missing-color-scheme", "l.astro", mediaOnly).length, 1);
  });

  it("no-missing-static-asset resolves public/ via ctx", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-missing-static-asset");
    const files = ["/r/src/layouts/Layout.astro"];
    const src = `---\nconst ogImage = '/og-image.jpg';\n---\n<html><head><link rel="icon" href="/favicon.ico"></head><img src="/ok.webp" alt="x" width="1" height="1"></html>`;
    const read = () => src;
    const exists = (f) => f.endsWith("favicon.ico") || f.endsWith("ok.webp");
    const found = rule.checkAll(files, read, { root: "/r", exists });
    assert.equal(found.length, 1);
    assert.match(found[0].message, /og-image\.jpg/);
    assert.equal(found[0].severity, "error");
  });

  it("no-missing-static-asset scans md covers, manifests; skips drafts and docs", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-missing-static-asset");
    const files = ["/r/src/content/blog/p.md", "/r/src/content/blog/CLAUDE.md", "/r/public/favicon/site.webmanifest"];
    const contents = {
      "/r/src/content/blog/p.md": `---\ntitle: p\ncoverImage: /images/gone.webp\n---\n![a](/images/also-gone.png)\n`,
      "/r/src/content/blog/CLAUDE.md": `---\ntitle: docs\ndraft: true\n---\n![example](/images/not-real.webp)\n`,
      "/r/public/favicon/site.webmanifest": JSON.stringify({ icons: [{ src: "/favicon/nope-512.png" }] }),
    };
    const exists = () => false;
    const found = rule.checkAll(files, (f) => contents[f], { root: "/r", exists });
    const msgs = found.map((d) => d.message);
    assert.equal(found.length, 3);
    assert.ok(msgs.some((m) => m.includes("gone.webp")));
    assert.ok(msgs.some((m) => m.includes("also-gone.png")));
    assert.ok(msgs.some((m) => m.includes("nope-512.png")));
  });

  it("no-dead-component ignores markdown prose, keeps frontmatter refs", () => {    const files = ["src/components/Toolbox.tsx", "src/content/blog/p.md", "src/pages/x.astro"];
    const contents = {
      "src/components/Toolbox.tsx": `export default function Toolbox(){return null}`,
      "src/content/blog/p.md": `---\ntitle: p\n---\nI keep my Toolbox stocked with editors.\n`,
      "src/pages/x.astro": `---\n---\n<div>x</div>`,
    };
    const res = scanFiles(files, { read: (f) => contents[f] });
    const dead = res.diagnostics.filter((d) => d.rule === "astro/no-dead-component");
    assert.equal(dead.length, 1);
  });
});

describe("hydration payloads and duplication", () => {
  it("no-deep-island-props flags spreads and deep literals only", () => {
    const spread = `---\n---\n<Card items={all} client:visible {...entry} />`;
    const astroProps = `---\n---\n<Card client:load {...Astro.props} />`;
    const deep = `---\n---\n<Card client:visible cfg={{ a: { b: { c: [1,2,3] } } }} />`;
    const ok = `---\n---\n<Card client:visible id="x" title="y" count={3} />`;
    const d1 = run("astro/no-deep-island-props", "a.astro", spread);
    assert.equal(d1.length, 1);
    assert.equal(d1[0].severity, "error");
    assert.equal(run("astro/no-deep-island-props", "a.astro", astroProps).length, 1);
    assert.equal(run("astro/no-deep-island-props", "a.astro", deep).length, 1);
    assert.equal(run("astro/no-deep-island-props", "a.astro", ok).length, 0);
  });

  it("no-duplicate-nav-listeners skips bundled module scripts", () => {
    const plain = `---\n---\n<body><script>document.addEventListener('astro:page-load', init);</script></body>`;
    const inl = `---\n---\n<body><script is:inline>document.addEventListener('astro:page-load', init);</script></body>`;
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", plain).length, 0);
    assert.equal(run("astro/no-duplicate-nav-listeners", "a.astro", inl).length, 1);
  });

  it("no-unguarded-script-injection skips bundled module scripts", () => {
    const plain = `---\n---\n<script>const s=document.createElement('script');s.src='https://x/y.js';document.body.appendChild(s);</script>`;
    const inl = `---\n---\n<script is:inline>const s=document.createElement('script');s.src='https://x/y.js';document.body.appendChild(s);</script>`;
    assert.equal(run("astro/no-unguarded-script-injection", "a.astro", plain).length, 0);
    assert.equal(run("astro/no-unguarded-script-injection", "a.astro", inl).length, 1);
  });

  it("no-duplicate-markup finds repeated blocks across files", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-duplicate-markup");
    const block = `<figure class="my-6">\n<simple-player\nsrc={src}\ncontrols={c}\nstyle="x: y"\nlinesix="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\nlineseven="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\n eight oito ocho eight eight eight 8\nnine nine nine nine nine nine nine 9\nten ten ten ten ten ten ten ten 10</simple-player>\n{caption && <figcaption>{caption}</figcaption>}\n</figure>`;
    const files = ["/r/a.astro", "/r/b.astro", "/r/c.astro"];
    const contents = {
      "/r/a.astro": `---\nconst x = 1;\n---\n<div>unique-a</div>\n${block}`,
      "/r/b.astro": `---\n---\n<div>unique-b</div>\n${block}`,
      "/r/c.astro": `---\n---\n<div>totally different here</div>`,
    };
    const found = rule.checkAll(files, (f) => contents[f]);
    assert.equal(found.length, 1);
    assert.match(found[0].message, /b\.astro/);
  });

  it("no-unsafe-navigate flags tainted targets, allows allowlists", () => {    // NOTE: single-arg dataflow (const to = …; navigate(to)) needs real
    // dataflow analysis — the rule targets direct tainted calls.
    const bad = `---\n---\n<script>navigate(new URLSearchParams(location.search).get('next'));</script>`;
    const ok = `---\n---\n<script>const allowedPaths = ['/home']; if (redirect && allowedPaths.includes(redirect)) { navigate(redirect); }</script>`;
    const d = run("astro/no-unsafe-navigate", "a.astro", bad);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
    assert.equal(run("astro/no-unsafe-navigate", "a.astro", ok).length, 0);
  });

  it("no-missing-reinit-on-nav flags one-shot DOM creation only", () => {
    const bad = `---\n---\n<script>const s=document.createElement('script');document.body.appendChild(s);</script>`;
    const okPageLoad = `---\n---\n<script>document.addEventListener('astro:page-load',()=>{const s=document.createElement('script');document.body.appendChild(s);});</script>`;
    const okInline = `---\n---\n<script is:inline>const s=document.createElement('script');document.body.appendChild(s);</script>`;
    const okUpdate = `---\n---\n<script>document.getElementById('x').textContent='y';</script>`;
    assert.equal(run("astro/no-missing-reinit-on-nav", "a.astro", bad).length, 1);
    assert.equal(run("astro/no-missing-reinit-on-nav", "a.astro", okPageLoad).length, 0);
    assert.equal(run("astro/no-missing-reinit-on-nav", "a.astro", okInline).length, 0);
    assert.equal(run("astro/no-missing-reinit-on-nav", "a.astro", okUpdate).length, 0);
  });
});

describe("adversarial", () => {
  it("backtick prose does not fire, ${} expressions still scan", () => {
    const fm = "---\nconst msg = `useState with window is just prose`;\nconst t = `id-${useId()}`;\n---\n<div />";
    assert.equal(run("astro/no-hooks-in-frontmatter", "a.astro", fm).length, 0);
    assert.equal(run("astro/no-document-in-frontmatter", "a.astro", fm).length, 0);
  });

  it("BOM-prefixed files parse frontmatter correctly", () => {
    const src = "﻿---\nconst [c,setC]=useState(0)\n---\n<div />";
    assert.equal(run("astro/no-hooks-in-frontmatter", "a.astro", src).length, 1);
  });

  it("handler-before-directive and quoted > in tags are caught", () => {
    assert.equal(
      run("astro/no-non-serializable-island-props", "a.astro", "<List onSelect={(x)=>setX(x)} client:load />").length,
      1
    );
    assert.equal(
      run("astro/no-client-directive-on-html", "a.astro", '<div title="a>b" client:load>x</div>').length,
      1
    );
    assert.equal(
      run("astro/prefer-astro-image", "a.astro", '<img alt="a>b" src="/x.jpg" width="4" height="4" loading="lazy">').length,
      0
    );
  });

  it("data-client lookalikes are not directives", () => {
    assert.equal(
      run("astro/no-client-directive-on-html", "a.astro", '<div data-client:load="x">y</div>').length,
      0
    );
    assert.equal(
      run("astro/no-too-many-islands", "a.astro", '<div data-client:load="1" data-client:idle="2" data-x="3" data-y="4" data-z="5">x</div>').length,
      0
    );
  });

  it("no-secret-in-define-vars flags secrets, allows public values", () => {
    const bad = `---\n---\n<script define:vars={{ apiToken }}>\nconsole.log(apiToken);\n</script>`;
    const ok = `---\n---\n<script define:vars={{ isHome, theme }}>\nconsole.log(isHome);\n</script>`;
    const d = run("astro/no-secret-in-define-vars", "a.astro", bad);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
    assert.equal(run("astro/no-secret-in-define-vars", "a.astro", ok).length, 0);
  });

  it("config severity overrides and ignore globs apply", () => {
    const files = ["/x/src/a.astro", "/x/src/skip/b.astro"];
    const read = () => `---\n---\n<div client:load>x</div>`;
    const base = scanFiles(files, { read });
    assert.ok(base.diagnostics.some((d) => d.rule === "astro/no-client-directive-on-html"));
    const off = scanFiles(files, { read, config: { rules: { "astro/no-client-directive-on-html": "off" } } });
    assert.ok(!off.diagnostics.some((d) => d.rule === "astro/no-client-directive-on-html"));
    const ignored = scanFiles(files, { read, config: { __root: "/x", ignore: ["src/skip/**"] } });
    assert.ok(!ignored.diagnostics.some((d) => d.file.endsWith("b.astro")));
    assert.ok(ignored.diagnostics.some((d) => d.file.endsWith("a.astro")));
  });

  it("filesScanned counts scanned files, not inputs", () => {
    const res = scanFiles(["a.astro"], { read: () => { throw new Error("nope"); } });
    assert.equal(res.filesScanned, 0);
    assert.equal(res.score, 100);
  });
});

describe("code quality", () => {
  it("no-complex-frontmatter budgets branches, ignores data", () => {
    const logic = `---\n${"if (a) { b(); }\n".repeat(6)}${"x && y();\n".repeat(6)}---\n<div />`;
    const data = `---\nconst items = [\n${"{ a: 1 },\n".repeat(50)}];\n---\n<div />`;
    assert.equal(run("astro/no-complex-frontmatter", "a.astro", logic).length, 1);
    assert.equal(run("astro/no-complex-frontmatter", "a.astro", data).length, 0);
  });

  it("no-huge-file budgets by extension", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-huge-file");
    const big = Array(500).fill("const x = 1;").join("\n");
    const small = "const x = 1;\n";
    const found = rule.checkAll(["/r/a.astro", "/r/b.astro"], (f) => (f.endsWith("a.astro") ? big : small), {});
    assert.equal(found.length, 1);
    assert.match(found[0].message, /500 lines/);
  });

  it("no-untracked-todo requires links, ignores prose", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-untracked-todo");
    const files = ["/r/a.ts", "/r/b.md"];
    const contents = {
      "/r/a.ts": `// TODO: wire this up\n// TODO(#12): tracked\n`,
      "/r/b.md": `todos and TODO lists in prose are fine\n`,
    };
    const found = rule.checkAll(files, (f) => contents[f], {});
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Untracked TODO/);
  });
});

describe("broken references", () => {
  it("no-broken-internal-links resolves static, dynamic, and public routes", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-broken-internal-links");
    const files = [
      "/r/src/pages/index.astro",
      "/r/src/pages/about.astro",
      "/r/src/pages/blog/[...slug].astro",
      "/r/src/pages/api/x.ts",
      "/r/src/pages/a.astro",
    ];
    const read = (f) =>
      f.endsWith("a.astro")
        ? `---\n---\n<a href="/">h</a><a href="/about">a</a><a href="/blog/anything">b</a><a href="/api/x">e</a><a href="/nope">n</a><a href="/logo.svg">l</a><a href="#sec">s</a>`
        : `---\n---\n<div />`;
    const exists = (f) => f.endsWith("logo.svg");
    const found = rule.checkAll(files, read, { root: "/r", exists });
    assert.equal(found.length, 1);
    assert.match(found[0].message, /\/nope/);
  });

  it("no-unknown-collection flags typos against content.config", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-unknown-collection");
    const config = `export const collections = {\nblog,\n'agent-convos': agentConvos,\n};`;
    const files = ["/r/src/pages/a.astro"];
    const page = `---\nconst a = await getCollection('blog');\nconst b = await getCollection('blgo');\n---\n<div />`;
    const read = (f) => (f.endsWith("content.config.ts") ? config : page);
    const found = rule.checkAll(files, read, { root: "/r", exists: () => true });
    assert.equal(found.length, 1);
    assert.match(found[0].message, /blgo/);
  });
});

describe("structural invariants", () => {
  const NASTY =
    "﻿---\n// cmt with <div client:load>\nconst a = `tpl ${x ? y : z} end`; const s = \"q>uote\";\n/* block <img src=x> */\n---\n<div title=\"a>b\" data-client:load=\"1\">\n<script>const t = `<div>${f({a:[1,{b:2}]})}`;</script>\n";

  it("masking and splitting preserve length and coverage", async () => {
    const { maskTemplate, splitFrontmatter } = await import("../src/utils.js");
    assert.equal(maskTemplate(NASTY).length, NASTY.length);
    const { frontmatter, body } = splitFrontmatter(NASTY);
    assert.equal(frontmatter.length + body.length, NASTY.length);
    // fence content (including the comment's fake tag) is blanked
    const masked = maskTemplate(NASTY);
    assert.ok(!masked.slice(0, frontmatter.length).includes("client:load"));
  });

  it("scanTags never truncates on quotes, braces, or arrows", async () => {
    const { scanTags } = await import("../src/utils.js");
    const tags = scanTags(`<List onSelect={(x)=>f(x)} client:load /><div title="a>b" data-x="1">`);
    assert.equal(tags.length, 2);
    assert.ok(tags[0].tag.endsWith("/>") && tags[0].tag.includes("client:load"));
    assert.ok(tags[1].tag.endsWith(">") && tags[1].tag.includes('data-x="1"'));
  });
});

describe("cross-call isolation", () => {
  // Shared module-level /g regexes must not leak lastIndex between files:
  // a cap-breaking input followed by a normal one must equal normal-alone.
  it("cap-breakers do not starve subsequent files", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const breaker = `---\n---\n<script>${"import.meta.env.SECRET_A;".repeat(10)}</script><script>navigate(searchParams.get('x'));</script>`;
    const normal = `---\n---\n<script>fetch(import.meta.env.DB_PASSWORD)</script>`;
    for (const name of ["astro/no-client-env-leak", "astro/no-unsafe-navigate"]) {
      const rule = RULES.find((r) => r.meta.name === name);
      const alone = rule.check("b.astro", normal);
      rule.check("a.astro", breaker);
      const after = rule.check("b.astro", normal);
      assert.deepEqual(after, alone, `${name} leaks state across calls`);
    }
  });

  it("every check() is deterministic across repeated runs", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const src = `---\nimport X from './X.astro';\nconst a = await getCollection('blog');\n---\n<X client:load items={a} onPick={(v)=>go(v)} /><div client:load>x</div>\n<script>document.addEventListener('astro:page-load', init);</script>`;
    for (const rule of RULES) {
      if (typeof rule.check !== "function") continue;
      const first = rule.check("d.astro", src);
      const second = rule.check("d.astro", src);
      assert.deepEqual(second, first, `${rule.meta.name} is nondeterministic`);
    }
  });
});
