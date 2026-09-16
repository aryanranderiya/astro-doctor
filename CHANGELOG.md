# Changelog

## 0.18.0

- Compiler-backed structure: 14 tag-consuming rules migrated to the
  `@astrojs/compiler` Document IR (exact node kinds, attribute values,
  expression ancestry, subtree fallback); quote-aware scanner retained as
  fallback with agreement coverage.
- Fixed a 6KB false-negative hole (self-closing scripts swallowing content),
  surfacing 4 previously-missed true findings.
- Tests: 74 passing.


## 0.17.0

- Hand-rolled parsing fully eliminated: asset refs, script blocks, head
  regions, and sync-script detection all run through `scanTags()` + `tagAttr()`
  + `headSpan()`; dead regex table removed.
- Tests: 72 passing.


## 0.16.0

- Bulletproof pass: script-attr rules migrated to quote-aware extraction;
  string-aware paren counting in island-in-map; config warns on unknown rule
  names; surrogate-safe snippets; registry/meta/config unit tests; CRLF
  fixtures; corpus re-validated (296 files, zero throws).
- Tests: 72 passing.


## 0.15.0

- Robustness release: `ignore-file` suppression, self-closing script pairing
  fixes, statement-anchored bound detection, guard-tiered open redirects,
  React 19 `use()` coverage, BOM-safe splitting, `ok` reflects errors,
  unknown-subcommand guard, cross-call isolation tests, self-closing-aware
  script extraction.
- Tests: 68 passing.


## 0.14.0

- Robustness overhaul: single-pass JS lexer (`stripCodeNoise` handles
  comments/strings/templates/regex in one state machine); quote-aware
  `scanTags()` + `eachBodyScript()` replace every `[^>]*` tag pattern;
  expression-aware less-than disambiguation; BOM-safe splitting.
- Fixed `snippetOf` on newline indices; length/coverage invariants enforced.
- New invariant suite (`test/invariants.test.js`): tokenizer properties plus
  200-mutant fuzz over all rules — validated against 295 real project files
  with zero throws.
- Tests: 65 passing.

## 0.13.0

- New: `astro/no-broken-internal-links` (error, cross-file) — literal hrefs
  resolved against the page route tree (dynamic segments, endpoints, public/
  files, sitemap allowlist).
- New: `astro/no-unknown-collection` (error) — collection names checked
  against `content.config.ts` (quoted keys + shorthand parsed structurally).
- Fixed masked-string position/value split that broke collection matching.
- Tests: 54 passing.

## 0.12.0

- Adversarial hardening: quote-/brace-aware `scanTags()` replaces all
  `[^>]*` island patterns (handler-before-directive and quoted-`>` misses
  fixed); backtick-aware `stripCodeNoise`; BOM tolerance; `data-client:*`
  lookalikes excluded.
- New: `no-secret-in-define-vars` (error, camelCase-aware).
- New quality rules: `no-complex-frontmatter`, `no-huge-file`,
  `no-untracked-todo` (same-line links only).
- `no-open-redirect`: `startsWith('/')`-only guards now warn (`//evil.com`).
- `no-hooks-in-frontmatter`: React 19 `use()` + noise-stripped scanning.
- `no-draft-leak`: comments no longer count as filters.
- Engine: `filesScanned` counts scanned files; cross-file suppression reads
  full corpus; `--json ok` reflects errors; unknown subcommands exit 2.
- CLI tests added (`test/cli.test.js`: help/version/exit codes/JSON/rules).
- Docs: full `RULES.md` rewrite with detection notes and non-rules.
- Tests: 52 passing.

## 0.11.0

- Execution semantics corrected per docs.astro.build (View Transitions):
  default bundled module scripts run ONCE ever — `no-duplicate-nav-listeners`
  and `no-unguarded-script-injection` now scope to `is:inline` /
  `data-astro-rerun` scripts (Avatar/TOC/Lightbox false positives removed).
- New: `no-missing-reinit-on-nav` (warning) — one-shot DOM creation with no
  `astro:page-load` re-init leaves swapped pages uninitialized.
- New: `no-unsafe-navigate` (error) — unsanitized `navigate()` targets.
- New: `no-deep-island-props` (warning, error on whole-object spreads).
- New: `no-duplicate-markup` (warning, cross-file) — repeated template blocks.
- New: `astro-doctor ci install` — GitHub Actions gate workflow generator.
- New: `skills/astro-doctor/SKILL.md` — agent operating manual.
- Tests: 38 passing.

## 0.10.0

- `no-missing-static-asset` now covers Markdown content (covers + `![]()`,
  drafts and doc files skipped), PWA manifests (`icons[].src`), and
  image-ish component props (`logoSrc`, `backgroundSrc`, …).
- `no-dead-component` ignores Markdown prose (frontmatter + MDX imports
  still count) so docs never rescue dead code.
- Tests: 32 passing.

## 0.9.0

- New: `astro/no-missing-static-asset` (error, cross-file) — absolute
  `public/` references that 404 (og defaults, icons, manifests, scripts);
  routes and `/api/` excluded, extensionless paths treated as routes.
- New: `astro/no-missing-color-scheme` (warning) — dark-mode shells without
  a `color-scheme` declaration (`prefers-color-scheme` media excluded).
- Fixed capture-group bug that silently disabled frontmatter asset refs.
- Tests: 30 passing.

## 0.8.0

- `no-dead-component` now covers `.tsx/.jsx` islands under components/ and
  iterates to fixpoint (transitive dead clusters). Cross-validated against
  knip: identical true hits, none of knip's dynamic-import false positives.
- Tests: 28 passing.

## 0.7.0

- New: `astro/no-dead-component` (warning, cross-file) — unreferenced
  components via project-wide reference graph (importers in .tsx/.mdx/.md
  included; routes excluded).
- New: `astro/no-inline-event-handler` (warning) — eval-like `on*="..."`
  string handlers, invisible to CSP/bundlers.
- New: `astro/no-unhandled-promise` (warning) — chain-level `.then()` analysis
  (two-arg handlers and `.catch()` recognized).
- Engine: cross-file `checkAll` rules with extended corpus; asymptotic health
  score (discriminates instead of clamping at 0); `--json` gains
  `byCategory`/`byRule`; human output gains top offenders.
- Tests: 26 passing.

## 0.6.0

- New: `astro/no-duplicate-nav-listeners` (warning) — body scripts re-run per
  ClientRouter nav; unguarded `astro:page-load/after-swap/before-swap`
  registration stacks handlers. Paren-balanced guard analysis (wrapping if,
  early return, per-call once/AbortSignal); skips `<head>`.
- Tests: 22 passing.

## 0.5.0

- New: `astro/no-unguarded-script-injection` (error) — component scripts
  re-run per ClientRouter nav; unguarded third-party injection duplicates
  widgets. Null-checks don't count; dataset/`loaded` guards do.
- New: `astro/no-unsafe-storage-access` (warning) — storage outside try/catch
  kills the enclosing script when blocked.
- Stricter `no-unbounded-collection`: per-request routes now need a filter
  AND a bound (slice/limit).
- Tests: 21 passing.

## 0.4.0

- New: `astro/no-router-unaware-script` (error) — `DOMContentLoaded` with no
  `astro:page-load`/`readyState` handling dies after ClientRouter navigation.
- New: `astro/no-collection-refetch` (warning) — top-level `getCollection`
  outside `getStaticPaths` re-parses entries per page; pass via props.
- New: `astro/no-large-island-props` (warning, error on entry spreads) —
  raw `getCollection` results serialized into island HTML.
- Fixed dead rule: `no-sync-external-script` now scans script opening tags
  (masking had blanked them) and skips `import.meta.env.DEV` tooling.
- Tests: 18 passing.

## 0.3.0

- Strict pass: `no-client-only-without-fallback` and `no-island-in-map` promoted
  to error; `no-unsafe-set-html` escalates third-party HTML payloads
  (`textHtml`/`moreHtml`/`.html`) to error; tighter island budgets
  (`client:load` warn ≥2 / error ≥4, file budget warn >4 / error >7).
- New rule: `astro/no-client-on-astro-component` (error, resolves `.astro`
  imports — `.astro` has no client runtime).
- Precision fixes: imported-path resolution keeps strings intact; `location`
  as a prop name no longer fires; same-origin redirects skipped.

## 0.2.0

- Strict v0.2 rule set (13 rules): islands, hydration, SSR, security, performance.
- General-purpose heuristics — no portfolio-specific allowlists.
- Suppression comments: `astro-doctor-ignore-line` / `astro-doctor-ignore-next-line`.
- Config file: `astro-doctor.config.mjs` with per-rule severity + ignore globs.
- Programmatic API via `src/index.js` (`scanDir`, `RULES`).
- `node --test test/` fixture suite.

## 0.1.0

- Initial MVP: 3 rules + CLI + `--json`.
