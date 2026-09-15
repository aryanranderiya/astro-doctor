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
