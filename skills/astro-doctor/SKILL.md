# astro-doctor skill

You are reviewing an Astro codebase with `astro-doctor`, a deterministic static
analyzer (no LLM judgment — every finding cites a rule, file, and line).

## Run it

```bash
node ./bin/astro-doctor.js [dir] --json   # machine-readable report
node ./bin/astro-doctor.js rules          # list all rules
```

Exit code `1` means error-severity findings exist — treat as CI red.

## Read the report

`--json` yields `{ score, grade, errors, warnings, byCategory, byRule,
diagnostics[] }`. Each diagnostic: `{ rule, category, severity, file, line,
message, snippet }`. Fix `error` findings first, then `warning`. `score` is
asymptotic (never clamps at 0) — watch it rise as you fix.

## Severity policy

- `error` = broken, insecure, or silently ignored code. Fix or prove wrong.
- `warning` = real cost (payload, CLS, leaks). Fix unless you can cite why not.
- Never bulk-suppress. Suppress one line with a reason:
  `<!-- astro-doctor-ignore-next-line astro/no-unsafe-set-html -- trusted SVG sprite -->`

## Fix recipes

| Rule | Fix |
|---|---|
| `no-client-directive-on-html` | Move `client:*` onto the framework island; native tags never hydrate |
| `no-client-on-astro-component` | Extract interactivity to `.tsx`, or drive with a client `<script>` |
| `no-document-in-frontmatter` | Move browser access into `<script>` / island (`astro:page-load`) |
| `no-hooks-in-frontmatter` | Move state/effects into the island component |
| `no-non-serializable-island-props` | Pass data down; bubble up via `CustomEvent` |
| `no-client-only-without-fallback` | Add `slot="fallback"` or switch to `client:visible`/`idle` |
| `no-island-in-map` | Hoist one island above the list, pass `rows={...}` |
| `no-deep-island-props` | Flatten props to ids/slugs/strings; never spread entries |
| `no-router-unaware-script` | Bind on `astro:page-load`, not `DOMContentLoaded` |
| `no-duplicate-nav-listeners` | Guard registration (`__bound`/dataset); only `is:inline` re-runs — bundled module scripts run once ever |
| `no-unguarded-script-injection` | Guard with dataset flag / existence check |
| `no-prerender-mismatch` | Remove `getStaticPaths` or the `prerender=false` opt-out |
| `no-open-redirect`, `no-unsafe-navigate` | Allowlist paths / enforce leading `/` (not `//`) |
| `no-define-vars-xss` | Pass via `data-*` + `dataset`, never tainted `define:vars` |
| `no-client-env-leak` | Read secrets in frontmatter; pass derived data down |
| `no-unsafe-set-html` | Sanitize (DOMPurify/sanitize-html) or render as text |
| `prefer-astro-image` | `astro:assets` `<Image>` or width/height/loading/alt |
| `no-missing-static-asset` | Add the file under `public/` or fix the reference |
| `no-deep-island-props` | Flatten props; never spread entries |
| `no-missing-reinit-on-nav` | Re-run setup on guarded `astro:page-load` |
| `no-unsafe-navigate` | Allowlist paths before navigating |
| `no-client-load-abuse`, `no-too-many-islands` | Demote to `client:visible`/`idle`; consolidate |
| `no-fetch-waterfall`, `no-collection-refetch` | `Promise.all`; compute in `getStaticPaths`, pass via props |
| `no-unbounded-collection` | Filter + `.slice()` / paginate / `getEntry` |
| `no-draft-leak` | Filter `data.draft !== true` at the query |
| `no-large-island-props` | `.map()` to rendered fields (see `mapProject` pattern) |
| `no-unsafe-storage-access` | `try/catch` safe helper with defaults |
| `no-unhandled-promise` | Append `.catch(fallback)` |
| `no-inline-event-handler` | `addEventListener` in a script/island |
| `no-dead-component` | Delete (or `ignore` in config if WIP) |
| `no-duplicate-markup` | Merge variants behind a prop |
| `no-secret-in-define-vars` | Read secrets server-side; pass public results |
| `no-complex-frontmatter` | Extract logic to `src/lib/` with tests |
| `no-huge-file` | Split component / extract helpers |
| `no-untracked-todo` | Link `(#123)` or convert to a task |
| `no-broken-internal-links` | Fix the path or add the route |
| `no-unknown-collection` | Fix the typo against `content.config.ts` |
| `no-missing-html-lang`, `no-missing-color-scheme` | `lang`, `<title>`, `color-scheme` |
| `no-sync-external-script` | `async`/`defer`/idle-load |
| `no-server-defer-misuse` | Pick server xor client; add `slot="fallback"` |

## Execution semantics that matter (docs.astro.build, View Transitions)

- Default bundled module `<script>`: runs ONCE ever. `is:inline` /
  `data-astro-rerun`: re-executes when the incoming page is new.
- Scripts inside `transition:persist` subtrees are carried over, not re-run.
- `astro:page-load` fires on first paint and every navigation — the correct
  re-init hook. `DOMContentLoaded` fires once.
- `window` is preserved across swaps — module-level `__bound` guards work.

## Config (`astro-doctor.config.mjs`)

```js
export default {
  rules: { "astro/no-too-many-islands": "off" },
  ignore: ["src/pages/f4llout/**"],
};
```
