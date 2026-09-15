import { lineOf, snippetOf, splitFrontmatter } from "../utils.js";

export const meta = {
  name: "astro/no-sync-external-script",
  category: "Performance",
  severity: "warning",
  description:
    "Synchronous third-party <script src> in template blocks first render. Defer until idle/interaction, or load with async/defer.",
};

export function check(file, source) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  // Blank HTML comments so commented-out scripts don't fire (keep length).
  const clean = body.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const diagnostics = [];
  for (const m of clean.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/[^"']+["'][^>]*>/gi)) {
    const tag = m[0];
    if (/\b(async|defer)\b/i.test(tag)) continue;
    const idx = frontmatterEnd + (m.index ?? 0);
    // Dev-only tooling (react-scan, debug overlays) behind import.meta.env.DEV
    // is not a production defect — skip when conditionally rendered for dev.
    const ctx = source.slice(Math.max(0, idx - 400), idx);
    if (/import\.meta\.env\.DEV/.test(ctx)) continue;
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Sync third-party script blocks rendering — add async/defer, or lazy-load on idle/interaction like the GA pattern (requestIdleCallback + event trigger).`,
      snippet: snippetOf(source, idx),
    });
    if (diagnostics.length >= 5) break;
  }
  return diagnostics;
}
