import { lineOf, snippetOf, extractScriptBlocks } from "../utils.js";

export const meta = {
  name: "astro/no-client-env-leak",
  category: "Security",
  severity: "error",
  description:
    "Only import.meta.env.PUBLIC_* (plus MODE/DEV/PROD/SSR/BASE_URL) is safe on the client. Secrets and astro:env/server imports in client <script> get bundled into shipped JS.",
};

const ENV_RE = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
const SAFE = new Set(["PUBLIC_", "MODE", "DEV", "PROD", "SSR", "BASE_URL", "SITE"]);

function isSafeEnv(name) {
  if (SAFE.has(name)) return true;
  if (name.startsWith("PUBLIC_")) return true;
  return false;
}

export function check(file, source) {
  const diagnostics = [];
  for (const block of extractScriptBlocks(source)) {
    let m;
    ENV_RE.lastIndex = 0;
    while ((m = ENV_RE.exec(block.js)) !== null) {
      if (isSafeEnv(m[1])) continue;
      const idx = block.start + m.index;
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `import.meta.env.${m[1]} in a client <script> — non-PUBLIC_ vars must stay in frontmatter/endpoints. Read the secret server-side and pass only the derived result down.`,
        snippet: snippetOf(source, idx),
      });
    }
    ENV_RE.lastIndex = 0;
    if (/from\s+["']astro:env\/server["']/.test(block.js)) {
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, block.start),
        message: `astro:env/server imported in a client <script> — server secrets ship to the browser. Move the read into frontmatter and pass data via props or data-* attributes.`,
        snippet: snippetOf(source, block.start),
      });
    }
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
