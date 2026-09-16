import path from "node:path";
import { lineOf, snippetOf, splitFrontmatter, maskTemplate, scanTags, tagAttr } from "../utils.js";

export const meta = {
  name: "astro/no-missing-static-asset",
  category: "Correctness",
  severity: "error",
  description:
    "Absolute-path references to public/ assets (images, icons, manifests, scripts) 404 when the file doesn't exist — including social-image defaults baked into every page's <head>.",
};

// Route prefixes that are pages/endpoints, never public/ files.
const VIRTUAL_PREFIXES = ["/api/", "/_astro/", "/@fs/", "/@vite/", "/.netlify/", "/__/"];

function cleanRef(raw) {
  if (!raw || /^(https?:)?\/\/|^(data|blob|tel|mailto):/i.test(raw)) return null;
  if (!raw.startsWith("/")) return null;
  const pathname = raw.split(/[?#]/)[0];
  if (VIRTUAL_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return pathname;
}

function* templateRefs(source, clean) {
  for (const { name, tag, index } of scanTags(clean)) {
    const lname = name.toLowerCase();
    // value offset inside the tag (for exact line numbers on multiline tags)
    const at = (attr) => {
      const v = tagAttr(tag, attr);
      if (typeof v !== "string") return null;
      const ai = tag.search(new RegExp(`\\b${attr}\\s*=`));
      const vi = ai === -1 ? -1 : tag.indexOf(v, ai);
      return { raw: v, off: vi === -1 ? tag.indexOf(v) : vi };
    };
    if (["img", "source", "video", "audio", "track", "embed"].includes(lname)) {
      for (const attr of ["src", "poster"]) {
        const hit = at(attr);
        if (!hit) continue;
        const ref = cleanRef(hit.raw);
        if (ref) yield { ref, index: index + hit.off };
      }
      continue;
    }
    if (lname === "script") {
      const hit = at("src");
      if (hit) {
        const ref = cleanRef(hit.raw);
        if (ref) yield { ref, index: index + hit.off };
      }
      continue;
    }
    if (lname === "link") {
      const hit = at("href");
      if (hit) {
        const ref = cleanRef(hit.raw);
        if (ref) yield { ref, index: index + hit.off };
      }
      continue;
    }
    if (lname === "meta") {
      const key = at("property")?.raw ?? at("name")?.raw ?? "";
      if (key === "og:image" || key === "twitter:image") {
        const hit = at("content");
        if (hit) {
          const ref = cleanRef(hit.raw);
          if (ref) yield { ref, index: index + hit.off };
        }
      }
      continue;
    }
  }
  // Image-ish props on ANY other tag (island/component props like logoSrc,
  // backgroundSrc, poster). Route hrefs on <a> are deliberately excluded,
  // as are the media tags handled above.
  const propRe = /\b\w*(?:src|Src|image|Image|icon|Icon|logo|Logo|cover|Cover|poster|Poster|thumb|Thumb)\w*\s*=\s*(["'])(\/[^"']+)\1/gi;
  let pm;
  while ((pm = propRe.exec(clean)) !== null) {
    const ref = cleanRef(pm[3]);
    if (ref) yield { ref, index: pm.index + pm[0].indexOf(pm[3]) };
  }
}

// Conventional doc files are never shipped — their example paths must not fire.
const DOC_FILES = new Set(["README.md", "CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md"]);

function isDraftMarkdown(source) {
  const m = source.match(/^---\s*\n([\s\S]*?)\n---/);
  return !!m && /^\s*draft\s*:\s*true\s*$/m.test(m[1]);
}

function* markdownRefs(source) {
  // Frontmatter image keys: cover/coverImage/image/ogImage/thumbnail/hero.
  const fm = source.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fm) {
    for (const m of fm[1].matchAll(
      /^\s*\w*(?:cover|Cover|image|Image|thumbnail|hero)\w*\s*:\s*['"]?(\/[^'"\s]+)['"]?\s*$/gm
    )) {
      const ref = cleanRef(m[1]);
      if (ref) yield { ref, index: (m.index ?? 0) + m[0].indexOf(m[1]) };
    }
  }
  // Markdown images: ![alt](/path). Route links [text](/route) excluded —
  // only image syntax counts.
  for (const m of source.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const ref = cleanRef(m[1]);
    if (ref) yield { ref, index: (m.index ?? 0) + m[0].indexOf(m[1]) };
  }
}

function* manifestRefs(source) {
  // PWA webmanifest: icons[].src must exist or install prompts break.
  let json;
  try {
    json = JSON.parse(source);
  } catch {
    return;
  }
  const icons = json?.icons;
  if (!Array.isArray(icons)) return;
  for (const icon of icons) {
    if (typeof icon?.src !== "string") continue;
    const ref = cleanRef(icon.src);
    if (!ref) continue;
    const index = source.indexOf(icon.src);
    if (index !== -1) yield { ref, index };
  }
}
function* frontmatterImageRefs(frontmatter) {
  // Image-ish defaults: ogImage = '/x.jpg', cover: '/y.png'. Route strings
  // (/blog, /about) never match the name filter, so links are never flagged.
  for (const m of frontmatter.matchAll(
    /\b\w*(?:image|Image|icon|Icon|logo|Logo|cover|Cover|ogImage|favicon)\w*\s*[:=]\s*(['"])(\/[^'"]+)\1/g
  )) {
    const ref = cleanRef(m[2]);
    if (ref) yield { ref, index: m.index + m[0].indexOf(m[2]) };
  }
}

export function checkAll(files, read, ctx = {}) {
  const root = ctx.root ?? process.cwd();
  const exists = ctx.exists ?? (() => true);
  const publicDir = path.join(root, "public");
  const diagnostics = [];
  const seen = new Set();
  for (const file of files) {
    const isAstro = file.endsWith(".astro");
    const isMarkdown = file.endsWith(".md") || file.endsWith(".mdx");
    const isManifest = file.endsWith(".webmanifest");
    if (!isAstro && !isMarkdown && !isManifest) continue;
    if (isMarkdown && DOC_FILES.has(path.basename(file))) continue;
    let source = "";
    try {
      source = read(file);
    } catch {
      continue;
    }
    if (isMarkdown && isDraftMarkdown(source)) continue; // drafts never ship
    let refs = [];
    if (isManifest) {
      refs = [...manifestRefs(source)];
    } else if (isMarkdown) {
      refs = [...markdownRefs(source)];
    } else {
      const { frontmatter } = splitFrontmatter(source);
      const clean = maskTemplate(source);
      refs = [
        ...templateRefs(source, clean),
        ...frontmatterImageRefs(frontmatter),
      ];
    }
    for (const { ref, index } of refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      // Extensionless absolute paths are routes or endpoints, not assets.
      if (!path.extname(ref)) continue;
      if (!exists(path.join(publicDir, decodeURIComponent(ref)))) {
        diagnostics.push({
          rule: meta.name,
          category: meta.category,
          severity: meta.severity,
          file,
          line: lineOf(source, index),
          message: `Static asset '${ref}' does not exist under public/ — this 404s in production (social unfurls, icons, manifests included). Add the file or fix the reference.`,
          snippet: snippetOf(source, index),
        });
      }
      if (diagnostics.length >= 10) return diagnostics;
    }
  }
  return diagnostics;
}
