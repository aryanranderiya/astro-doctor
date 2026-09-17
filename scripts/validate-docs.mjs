// Offline validator for things Mintlify does NOT check for us: our files
// exist, nav has no duplicates, pages have frontmatter, and no raw tags
// leak into MDX prose. Schema shapes and enums (theme, footerSocials, …)
// belong to Mintlify's own deploy validation — mimicking them here just rots,
// as proven when our guessed footerSocials rule went stale. When the deploy
// log reports a new constraint, fix the content, not this file.
// Usage: node scripts/validate-docs.mjs [--root <repo>]
import fs from "node:fs";
import path from "node:path";

const root = process.argv.includes("--root")
  ? path.resolve(process.argv[process.argv.indexOf("--root") + 1])
  : path.resolve(new URL("..", import.meta.url).pathname);

const errors = [];
const fail = (msg) => errors.push(msg);

const configPath = ["docs/docs.json", "docs.json", "docs/mint.json", "mint.json"]
  .map((p) => path.join(root, p))
  .find((p) => fs.existsSync(p));
if (!configPath) fail("no mint.json/docs.json found (root or docs/)");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const contentDir = path.dirname(configPath);

if (typeof config.theme !== "string" || config.theme.length === 0) {
  fail("theme must be a non-empty string (allowed values come from the deploy log, not this file)");
}for (const [k, v] of Object.entries(config.colors ?? {})) {
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail(`colors.${k} must be #rrggbb, got ${JSON.stringify(v)}`);
}
const pageFiles = [];
for (const group of config.navigation ?? []) {
  for (const page of group.pages ?? []) {
    pageFiles.push(page);
    const file = path.join(root, "docs", `${page}.mdx`);
    if (!fs.existsSync(file)) fail(`navigation page missing: docs/${page}.mdx`);
  }
}
if (new Set(pageFiles).size !== pageFiles.length) fail("duplicate navigation pages");
for (const f of ["favicon", "logo"]) {
  const ref = typeof config[f] === "string" ? config[f] : config[f]?.dark ?? config[f]?.light;
  if (typeof ref === "string" && ref.startsWith("/") && !fs.existsSync(path.join(root, "docs", ref))) {
    fail(`${f} points at missing file: docs${ref}`);
  }
}
for (const link of config.topbarLinks ?? []) {
  if (!link.name || !link.url) fail(`topbarLinks entries need name+url: ${JSON.stringify(link)}`);
}
// NOTE: no footerSocials/shape checks here on purpose — Mintlify owns its
// schema and already validates it on deploy; our guesses there went stale
// once already. This file only asserts repo-owned truths.
// MDX hazards: raw tags that break the docs build (not prose backticks)
for (const page of pageFiles) {
  const file = path.join(root, "docs", `${page}.mdx`);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  if (!src.startsWith("---")) fail(`${page}.mdx: missing frontmatter`);
  const body = src.replace(/^---[\s\S]*?---/, "");
  const stripped = body.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
  for (const m of stripped.matchAll(/<(meta|script|style|iframe|object|embed)\b/gi)) {
    fail(`${page}.mdx: raw <${m[1]}> tag will break the MDX build (escape in code spans)`);
  }
}

if (errors.length > 0) {
  console.error("docs validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`docs OK (${pageFiles.length} pages)`);
