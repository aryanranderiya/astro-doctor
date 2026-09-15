# astro-doctor rule catalog (v0.13 — 42 rules)

Every rule is deterministic (regex/AST over `.astro` + project corpus) — no LLM
judging. Cross-file rules (`checkAll`) run once over the project; per-file
rules see one file. Masks preserve length so line numbers are exact.

## Execution semantics (docs.astro.build, View Transitions + Scripts)

- Default bundled module `<script>`: runs ONCE ever, deduped across swaps.
- `is:inline` / `data-astro-rerun` scripts: re-execute when the incoming page
  is new. Only these can stack duplicate handlers per navigation.
- Scripts inside `transition:persist` subtrees are carried over, not re-run.
- `astro:page-load` fires on first paint and every navigation; `window` is
  preserved across swaps (module-level `__bound` guards work).

## Correctness (errors unless noted)

- `no-client-directive-on-html` — `client:*` on lowercase tags is ignored.
- `no-client-on-astro-component` — `.astro` has no client runtime (build error).
- `no-document-in-frontmatter` — server-only fence; strict globals always,
  `location`/`history` only as property access; strings/comments blanked.
- `no-hooks-in-frontmatter` — incl. React 19 `use()`; backtick prose ignored.
- `no-non-serializable-island-props` — function props dropped at JSON boundary.
- `no-client-only-without-fallback` — empty SSR HTML without `slot="fallback"`.
- `no-island-in-map` — N hydration roots; paren-balance heuristic skips siblings.
- `no-router-unaware-script` — bare `DOMContentLoaded` dies after nav.
- `no-duplicate-nav-listeners` (warn) — unguarded `astro:*` registration in
  `is:inline` scripts only; wrapping-if / early-return / once / signal guards.
- `no-unguarded-script-injection` — unguarded third-party injection in
  `is:inline` scripts; null-checks don't count as guards.
- `no-missing-reinit-on-nav` (warn) — one-shot DOM creation with no
  `astro:page-load` re-init; event-callback creation excluded.
- `no-prerender-mismatch` — `prerender=false` kills `getStaticPaths()`.
- `no-missing-html-lang` — `<html>` needs `lang` (error), `<title>` (warning).
- `no-server-defer-misuse` — defer+client conflict (error), missing fallback (warn).

## Security (errors)

- `no-unsafe-set-html` (error→warn) — third-party HTML payloads error; own
  markdown warns; `JSON.stringify` LD+JSON and sanitized values skipped.
- `no-define-vars-xss` — request-derived `define:vars` (script breakout class).
- `no-secret-in-define-vars` — secret-named values (camelCase-aware) in
  `define:vars`; `PUBLIC_` exempt.
- `no-client-env-leak` — non-`PUBLIC_` env / `astro:env/server` in client scripts.
- `no-open-redirect` (error→warn) — tainted `Astro.redirect()`; `startsWith('/')`
  alone warns (allows `//evil.com`); allowlist/`!startsWith('//')` clears.
- `no-unsafe-navigate` — tainted `navigate()` (no sanitization per docs).

## Performance (warn, escalates noted)

- `no-client-load-abuse` (warn ≥2, error ≥4), `no-too-many-islands` (warn >4,
  error >7) — counted per scanned tag, not raw text.
- `prefer-astro-image` (error if no `alt`) — dims/loading; ≤64px icons exempt.
- `no-fetch-waterfall` — top-level `await fetch` ×2+ without `Promise.all`
  (helper bodies excluded).
- `no-collection-refetch` — second load outside `getStaticPaths`; pass via props.
- `no-unbounded-collection` — per-request routes need filter AND bound.
- `no-large-island-props` (warn, error on spreads), `no-deep-island-props`
  (warn, error on `{...Astro.props}`/entry spreads).
- `no-sync-external-script` — third-party `<script src>` needs async/defer;
  `DEV`-only tooling skipped.
- `no-draft-leak` — draft-convention collections in pages (comments ignored).

## Maintainability (warn)

- `no-dead-component` — fixpoint reference graph over `.astro` + tsx islands;
  routes are entries; Markdown prose never rescues (frontmatter/MDX imports do);
  skipped entirely with zero routes.
- `no-duplicate-markup` — identical 8-line template blocks across files.
- `no-complex-frontmatter` — >10 branches (data arrays don't count).
- `no-huge-file` — 400 lines (`.astro`/`.mdx`), 800 (`.tsx/.ts`).
- `no-untracked-todo` — `TODO`/`FIXME` without `(#123)`/URL (same line only).
- `no-inline-event-handler` — eval-like `on*="..."` strings.
- `no-unhandled-promise` — chain-level `.then()` analysis.
- `no-unsafe-storage-access` — storage outside `try` (per-access ranges).
- `no-missing-static-asset` (error) — `public/` refs: template media tags,
  image-ish props, frontmatter defaults, Markdown covers/images (drafts and
  doc files skipped), manifest icons; routes/`/api/`/extensionless skipped.
- `no-broken-internal-links` (error) — route-tree resolution with dynamic
  segments, endpoint aliases, and sitemap allowlist.
- `no-unknown-collection` (error) — structural `collections` parsing.
- `no-missing-color-scheme` — dark shells need the declaration
  (`prefers-color-scheme` media doesn't count).
- `no-missing-html-lang` — see Correctness.

## Deliberately not rules

- `target="_blank"` without `rel` — browsers imply `noopener` since 2021.
- Remote `<Image>` without `remotePatterns` — needs config-file I/O.
- Collection schema checks — all six local collections have schemas.
- Multi-framework pages — needs import-graph resolution.
- Bare `client:visible` without `rootMargin` — valid default.
- `getStaticPaths` without `props:` — valid when refetching per page.
- Duplicate `id=` across files — legal (only same-DOM dupes break).
- Untyped `<button>` outside `<form>` — harmless.
- `setInterval` in persisted subtrees — runs exactly once by construction.
