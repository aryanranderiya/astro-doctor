import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripCodeNoise,
  maskTemplate,
  splitFrontmatter,
  scanTags,
  matchDirectives,
  eachBodyScript,
  lineOf,
  snippetOf,
} from "../src/utils.js";
import { RULES } from "../src/rules/index.js";

const NASTY = [
  "---\nconst re = /useState\\(\\w+\\)/g; const q = a / b / c;\n---\n<div />",
  "---\nconst t = `a${f({x:[1,{y:/z+/}]})}b // not comment`;\n---\n<p>{n > 0 && <b>{m}</b>}</p>",
  "---\n// // nested comment markers\n/* block with 'quotes' and // slashes */\n---\n<!-- <div client:load> -->\n<span />",
  "\uFEFF---\r\nconst w = window;\r\n---\r\n<div>\r\ntext\r\n</div>\r\n",
  "---\nconst s = \"it's /* not a comment\"; const u = 'say \"hi\"';\n---\n<a title='a>b' href=\"/x\">t</a>",
  "---\nconst f = (a, b) => a > b ? /x/.test(a) : null;\n---\n<List onSelect={(x)=>go(x)} client:load />",
];

describe("tokenizer invariants", () => {
  it("length is preserved by every transform", () => {
    for (const src of NASTY) {
      assert.equal(stripCodeNoise(src).length, src.length, "stripCodeNoise");
      assert.equal(maskTemplate(src).length, src.length, "maskTemplate");
      const { frontmatter, body } = splitFrontmatter(src);
      assert.equal(frontmatter.length + body.length, src.length, "splitFrontmatter");
    }
  });

  it("masked regions hide code but keep newlines", () => {
    const src = "---\nconst w = window;\n---\n<div>\nreal\n</div>";
    const masked = maskTemplate(src);
    assert.ok(!masked.includes("window"));
    assert.ok(masked.includes("<div>"));
    assert.equal(masked.split("\n").length, src.split("\n").length);
  });

  it("scanTags slices align and skip expression less-than", () => {
    const src = `<div>{n>0 && <b>x</b>}{a < b}</div>`;
    const tags = scanTags(src);
    for (const t of tags) {
      assert.equal(src.slice(t.index, t.index + t.tag.length), t.tag);
    }
    const names = tags.map((t) => t.name);
    assert.ok(names.includes("div") && names.includes("b"));
    assert.ok(!names.includes("0") && !names.includes("b}"));
  });

  it("matchDirectives ignores lookalikes", () => {
    assert.deepEqual(matchDirectives('<div data-client:load="1" client:idle></div>'), ["client:idle"]);
    assert.deepEqual(matchDirectives('<X client:visible={{rootMargin:"1px"}} />'), ["client:visible"]);
  });

  it("eachBodyScript tolerates > in attributes", () => {
    const src = `---\n---\n<script is:inline define:vars={{a: x > 1}}>\ninit();\n</script>`;
    const blocks = [];
    eachBodyScript(src, (b) => blocks.push(b));
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].attrs.includes("define:vars"));
    assert.ok(blocks[0].js.includes("init();"));
  });

  it("regex literals blank, division survives", () => {
    const code = `const re = /useState\\(/; const q = a / b / c; if (x > /y/.test(z)) go();`;
    const out = stripCodeNoise(code);
    assert.ok(!out.includes("useState"), "regex contents blanked");
    assert.ok(out.includes("a") && out.includes("b") && out.includes("c"), "division operands kept");
    assert.ok(!out.includes("/y/"), "test regex blanked");
  });

  it("lineOf/snippetOf agree on every line", () => {
    const src = "l1\nl2 longer line here\nl3";
    for (let i = 0; i < src.length; i++) {
      const line = lineOf(src, i);
      const snip = snippetOf(src, i);
      assert.ok(snip.length > 0, `empty snippet at ${i}`);
      assert.ok(line >= 1 && line <= 3);
    }
  });
});

describe("fuzz-lite: no rule throws on hostile input", () => {
  const alphabet = ['<', '>', '"', "'", "`", "{", "}", "$", "/", "*", "-", ":", "=", "!", "\\n", " ", "a", "client:load", "---", "-->", "<div", "=>", "?.", "..."];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const mutate = (base) => {
    let s = base;
    const ops = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < ops; k++) {
      const pos = Math.floor(rand() * (s.length + 1));
      const ins = alphabet[Math.floor(rand() * alphabet.length)];
      s = s.slice(0, pos) + ins + s.slice(pos);
    }
    return s;
  };
  const seeds = [
    "---\nconst x = 1;\n---\n<Counter client:load count={n} />\n",
    "<div><img src=\"/a.png\" alt=\"a\" /><script>init();</script></div>",
    "---\nconst t = `a${b}c`;\n---\n<X a={{" + "\n      b: 1,\n    }} client:visible />",
  ];
  it("200 mutants: utils hold, every check() returns an array", () => {
    for (let iter = 0; iter < 200; iter++) {
      const src = mutate(seeds[iter % seeds.length]);
      assert.equal(maskTemplate(src).length, src.length, `mask length iter ${iter}`);
      assert.equal(stripCodeNoise(src).length, src.length, `strip length iter ${iter}`);
      for (const t of scanTags(src)) {
        assert.equal(src.slice(t.index, t.index + t.tag.length), t.tag, `tag slice iter ${iter}`);
      }
      for (const rule of RULES) {
        if (typeof rule.check !== "function") continue;
        const found = rule.check("fuzz.astro", src);
        assert.ok(Array.isArray(found), `${rule.meta.name} iter ${iter}`);
        for (const d of found) {
          assert.ok(Number.isInteger(d.line) && d.line >= 1, `${rule.meta.name} line iter ${iter}`);
        }
      }
    }
  });
});

describe("registry and config", () => {
  it("rule names are unique with complete meta", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const names = RULES.map((r) => r.meta.name);
    assert.equal(new Set(names).size, names.length, "duplicate rule names");
    for (const r of RULES) {
      assert.match(r.meta.name, /^astro\/[a-z0-9-]+$/);
      assert.ok(["Correctness", "Performance", "Security", "Accessibility", "Maintainability", "Internal"].includes(r.meta.category), r.meta.name);
      assert.ok(["error", "warning"].includes(r.meta.severity), r.meta.name);
      assert.ok(r.meta.description.length > 20, r.meta.name);
      assert.ok(typeof r.check === "function" || typeof r.checkAll === "function", r.meta.name);
    }
  });

  it("resolveSeverity and isIgnored behave", async () => {
    const { resolveSeverity, isIgnored } = await import("../src/config.js");
    assert.equal(resolveSeverity({}, "astro/x", "warning"), "warning");
    assert.equal(resolveSeverity({ rules: { "astro/x": "off" } }, "astro/x", "error"), "off");
    assert.equal(resolveSeverity({ rules: { "astro/x": "error" } }, "astro/x", "warning"), "error");
    assert.equal(resolveSeverity({ rules: { "astro/x": "bogus" } }, "astro/x", "warning"), "warning");
    assert.equal(isIgnored({ ignore: ["src/skip/**"] }, "/r/src/skip/a.astro", "/r"), true);
    assert.equal(isIgnored({ ignore: ["src/skip/**"] }, "/r/src/keep/a.astro", "/r"), false);
    assert.equal(isIgnored({}, "/r/src/a.astro", "/r"), false);
  });

  it("CRLF sources keep line numbers", async () => {
    const { maskTemplate, splitFrontmatter, lineOf } = await import("../src/utils.js");
    const src = "---\r\nconst x = 1;\r\n---\r\n<div>\r\ntext\r\n</div>\r\n";
    assert.equal(maskTemplate(src).length, src.length);
    const { frontmatter, body } = splitFrontmatter(src);
    assert.equal(frontmatter.length + body.length, src.length);
    assert.equal(lineOf(src, src.indexOf("text")), 5);
  });

  it("snippets never split surrogate pairs", async () => {
    const { snippetOf } = await import("../src/utils.js");
    const line = "x".repeat(118) + "🎉" + "y".repeat(20);
    const snip = snippetOf("prefix\n" + line + "\n", 10, 120);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(snip));
  });

  it("self-closing scripts never swallow later content", async () => {
    const { maskTemplate, eachBodyScript } = await import("../src/utils.js");
    const src = '---\n---\n<script is:inline type="application/ld+json" set:html={x} />\n<div>\n<img src="/a.png" alt="a" width="2" height="2" loading="lazy">\n</div>\n<script>\ninit();\n</script>';
    const masked = maskTemplate(src);
    assert.ok(masked.includes("<img"), "img must survive masking");
    const blocks = [];
    eachBodyScript(src, (b) => blocks.push(b));
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].js.includes("init();"));
  });

  it("duplicate-markup reports exact template line numbers", async () => {
    const { RULES } = await import("../src/rules/index.js");
    const rule = RULES.find((r) => r.meta.name === "astro/no-duplicate-markup");
    const block = `<figure class="my-6 extra-padding-class-here">\n<simple-player data-test-id="player-one-here-ok">\nsrc={src}\ncontrols={controls || undefined}\nstyle="--aspect-ratio: 16 / 9 ratio here ok"\nlinesix="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\nlineseven="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\n eight oito ocho eight eight eight eight eight eight 8\nnine nine nine nine nine nine nine nine nine nine 9\nten ten ten ten ten ten ten ten ten ten ten 10</simple-player>\n{caption && <figcaption class="caption-class-here">{caption}</figcaption>}\n</figure>`;
    const a = `---\nconst x = 1;\n---\n<div>unique-a</div>\n${block}`;
    const b = `---\n---\n<div>unique-b</div>\n${block}`;
    const found = rule.checkAll(["/r/a.astro", "/r/b.astro"], (f) =>
      f.endsWith("a.astro") ? a : b
    );
    assert.equal(found.length, 1);
    // figure block starts at template line 5 (line 4 is the unique div)
    assert.equal(found[0].line, 5);
    assert.equal(found[0].file, "/r/a.astro");
  });
});
