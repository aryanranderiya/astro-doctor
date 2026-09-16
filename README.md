# astro-doctor

[![version](https://img.shields.io/badge/version-0.19.0-black?style=flat&color=000000&colorB=000000)](./CHANGELOG.md)
[![tests](https://img.shields.io/badge/tests-65%20passing-black?style=flat&color=000000&colorB=000000)](./test/)
[![rules](https://img.shields.io/badge/rules-42-black?style=flat&color=000000&colorB=000000)](./docs/RULES.md)
[![node](https://img.shields.io/badge/node-%3E%3D18-black?style=flat&color=000000&colorB=000000)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-black?style=flat&color=000000&colorB=000000)](./LICENSE)

Your agent writes bad Astro. This catches it.

astro-doctor deterministically scans your Astro codebase and finds issues across
islands and hydration, data-fetching and prerendering, performance, security,
accessibility, and maintainability. No LLM, no network — AST/regex rules with
file, line, and fix recipe for every finding.

## Install

### 1. Quick start

Run this at your project root to get an audit:

```bash
npx github:aryanranderiya/astro-doctor ./src
```

Or install it:

```bash
npm i -D github:aryanranderiya/astro-doctor
```

### 2. Run the audit

```bash
astro-doctor [dir] [--json] [--verbose] [--quiet] [--config <file>]
astro-doctor [dir] [--fast] [--cache]
astro-doctor rules [--json]          # list all 42 rules
astro-doctor ci install [--yes]      # add the GitHub Actions gate
```

Exit code `1` when any `error` diagnostic fires — gate your CI on it.
`--fast` runs per-file rules only (iteration, not gates); `--cache` persists
per-file findings in `.astro-doctor-cache.json`.

### 3. Install for agents

Copy `skills/astro-doctor/SKILL.md` into your agent's skills directory
(Claude Code, Cursor, Codex, OpenCode). It teaches the agent when to run the
doctor, how to read `--json`, severity policy, and a fix recipe per rule.

### 4. Run in CI

```bash
astro-doctor ci install
```

This writes `.github/workflows/astro-doctor.yml`: full scan on PRs and pushes
to `main`, failing on errors, uploading the JSON report as an artifact.

## What it catches

| Area | Examples |
|---|---|
| Islands & hydration | `client:*` on HTML/`.astro`, functions as island props, islands in `.map()`, `client:only` without fallback, duplicate nav listeners, missing re-init, deep props |
| Data & rendering | `document`/`window`/hooks in frontmatter, fetch waterfalls, collection refetch, unbounded per-request queries, draft leaks, prerender mismatches |
| Performance | `client:load` abuse, island budgets, raw `<img>`, sync scripts, unoptimized props |
| Security | `set:html` XSS, `define:vars` secrets, env leaks, open redirects, unsafe `navigate()` |
| Correctness | broken internal links, unknown collections, missing static assets, dead components, unhandled promises |
| Maintainability | duplicate markup, complex frontmatter, huge files, untracked TODOs, inline handlers |

Full catalog with detection notes: [`docs/RULES.md`](./docs/RULES.md).

## Example

```bash
$ astro-doctor ./src
astro-doctor v0.14.0 — 57 .astro files, score 26/100 (F)
  16 error(s), 41 warning(s) in ./src

src/layouts/Layout.astro
  ERROR [32] astro/no-missing-static-asset
         Static asset '/og-image.jpg' does not exist under public/ — this 404s in production.
         → ogImage = '/og-image.jpg',

  Top offenders: 11x astro/no-dead-component, 8x astro/no-duplicate-nav-listeners, ...
```

## Suppression

No allowlists — suppress explicitly at the site, with a reason:

```astro
<!-- astro-doctor-ignore-next-line astro/no-unsafe-set-html -- escapeHtml-then-linkify builder -->
<span set:html={textHtml} />
```

## Config

Auto-discovers `astro-doctor.config.mjs` in the scan root:

```js
export default {
  rules: { "astro/no-too-many-islands": "off" },
  ignore: ["src/pages/f4llout/**"],
};
```

## How it stays honest

One shared tokenizer (`splitFrontmatter`, `maskTemplate`, single-pass JS lexer,
`scanTags`, `eachBodyScript`) plus the compiler-backed Document IR
(`src/parse.js`: exact node kinds, attribute values, expression ancestry,
subtree fallback — scanner fallback when parsing fails). Rules never hand-roll
parsing. Length-preservation and slice-alignment invariants are tested, plus a
200-mutant fuzz run over every rule and CLI exit-code/JSON-shape tests. See
[`docs/RULES.md`](./docs/RULES.md) for deliberate non-rules.

## Programmatic API

```js
import { scanDir, RULES } from "astro-doctor";
const { score, grade, diagnostics } = scanDir("./src", { config: {} });
```

## Contributing

Add `src/rules/<name>.js` exporting `{ meta, check(file, source) }` (or
`checkAll(files, read, ctx)` for cross-file rules), register in
`src/rules/index.js`, cover with positive/negative/edge fixtures in `test/`
(`npm test`). Every fix needs a regression test.

MIT-licensed.
