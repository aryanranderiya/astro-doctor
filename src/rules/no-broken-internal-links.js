import path from "node:path";
import { lineOf, snippetOf, splitFrontmatter, maskTemplate } from "../utils.js";

export const meta = {
  name: "astro/no-broken-internal-links",
  category: "Correctness",
  severity: "error",
  description:
    "Literal internal hrefs that match no page route, public file, or endpoint 404 in production. Dynamic [slug] routes cover their segment; everything else must exist.",
};

// Generated at build/request time, never on disk.
const GENERATED_RE = /^\/sitemap(-\w+)?\.xml$/;

function matchRoute(root, segments) {
  let node = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (node.literal.has(seg)) {
      node = node.literal.get(seg);
      continue;
    }
    if (node.param) {
      node = node.param;
      continue;
    }
    if (node.rest) return true;
    return false;
  }
  return node.file || node.rest || node.literal.has("index");
}

export function checkAll(files, read, ctx = {}) {
  const root = ctx.root ?? process.cwd();
  const exists = ctx.exists ?? (() => true);
  // Readdir via read() is impossible — use a best-effort directory walk through
  // exists() probes is combinatorial; instead build the tree from the corpus:
  // every scanned page file implies its route.
  const tree = { literal: new Map(), param: null, rest: false, file: false };
  const insert = (segs) => {
    let node = tree;
    for (const seg of segs) {
      if (/^\[\.\.\..+\]$/.test(seg)) {
        node.rest = true;
        return;
      }
      if (/^\[.+\]$/.test(seg)) {
        if (!node.param) node.param = { literal: new Map(), param: null, rest: false, file: false };
        node = node.param;
        continue;
      }
      if (!node.literal.has(seg)) {
        node.literal.set(seg, { literal: new Map(), param: null, rest: false, file: false });
      }
      node = node.literal.get(seg);
    }
    node.file = true;
  };
  const pagesPrefix = `${root.replace(/\\/g, "/")}/src/pages/`;
  for (const f of files) {
    const norm = f.replace(/\\/g, "/");
    if (!norm.startsWith(pagesPrefix)) continue;
    const isEndpoint = /\.(ts|js)$/.test(norm);
    const rel = norm.slice(pagesPrefix.length).replace(/\.(astro|md|mdx|ts|js)$/, "");
    const segs = rel.split("/").filter((s) => s.length > 0 && s !== "index" && s !== "_");
    if (segs.length === 0) {
      tree.file = true; // src/pages/index.*
      continue;
    }
    // foo/index.* → route /foo
    insert(segs);
    // Endpoints are conventionally name.json.ts — /api/name must resolve too.
    if (isEndpoint && segs.length > 0 && segs[segs.length - 1].includes(".")) {
      insert([...segs.slice(0, -1), segs[segs.length - 1].split(".")[0]]);
    }
  }
  const hasRoutes = tree.file || tree.literal.size > 0;
  const diagnostics = [];
  const seen = new Set();
  for (const file of files) {
    if (!file.endsWith(".astro")) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    const { frontmatterEnd } = splitFrontmatter(source);
    const body = source.slice(frontmatterEnd);
    for (const m of body.matchAll(/\b(?:href|action)\s*=\s*(["'])(\/[^"']*)\1/g)) {
      const raw = m[2];
      if (raw.startsWith("//")) continue;
      const pathname = raw.split(/[?#]/)[0];
      if (seen.has(pathname)) continue;
      seen.add(pathname);
      if (GENERATED_RE.test(pathname)) continue;
      // public/ files and extensionless API/asset paths
      if (pathname.includes(".")) {
        if (exists(path.join(root, "public", decodeURIComponent(pathname)))) continue;
      } else if (exists(path.join(root, "public", decodeURIComponent(pathname)))) {
        continue;
      }
      if (!hasRoutes) continue;
      const segs = pathname.split("/").filter(Boolean);
      if (segs.length === 0) continue; // "/"
      if (matchRoute(tree, segs)) continue;
      const idx = frontmatterEnd + (m.index ?? 0) + m[0].indexOf(raw);
      diagnostics.push({
        rule: meta.name,
        category: meta.category,
        severity: meta.severity,
        file,
        line: lineOf(source, idx),
        message: `Internal link '${pathname}' matches no page route, public file, or endpoint — it 404s in production. Fix the path or add the route.`,
        snippet: snippetOf(source, idx),
      });
      if (diagnostics.length >= 10) return diagnostics;
    }
  }
  return diagnostics;
}
