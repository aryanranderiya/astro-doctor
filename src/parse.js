import { parse as parseAstroSync } from "@astrojs/compiler/sync";
import { splitFrontmatter, scanTags, lineOf } from "./utils.js";

// Document IR: compiler-backed structure with scanner fallback.
//
// Every rule that reasons about template structure (tags, islands,
// expressions) reads from here instead of hand-rolled patterns. Frontmatter
// JavaScript and client <script> semantics stay on the existing fast paths —
// the compiler does not parse JS, so there is nothing to gain there.
//
// Positions: the compiler reports 0-based BYTE offsets; indices below are
// always UTF-16 string indices into `source` (converted when non-ASCII).

function byteToIndexConverter(source) {
  if (!/[^\x00-\x7f]/.test(source)) return null; // pure ASCII: equal
  const table = new Array(source.length + 1);
  let byte = 0;
  let i = 0;
  for (const ch of source) {
    table[byte] = i;
    byte += Buffer.byteLength(ch);
    i += ch.length;
  }
  table[byte] = i;
  return (b) => {
    if (b <= 0) return 0;
    if (b >= byte) return i;
    // nearest recorded boundary at or below b
    while (b > 0 && table[b] === undefined) b--;
    return table[b] ?? 0;
  };
}

function fromAst(ast, source, file) {
  const convert = byteToIndexConverter(source);
  const toIndex = (offset) => (convert ? convert(offset) : Math.min(offset, source.length));
  const tags = [];
  const stack = []; // ancestor tag frames for expression context

  const visit = (node, inMap) => {
    if (!node || typeof node !== "object") return false;
    let subtreeFallback = false;
    if (node.type === "expression") {
      const mapHere = (node.children || []).some(
        (c) => c && c.type === "text" && /\.map\s*\(/.test(c.value || "")
      );
      let hasFallback = false;
      for (const child of node.children || []) {
        if (visit(child, inMap || mapHere)) hasFallback = true;
      }
      return hasFallback;
    }
    if (
      node.type === "element" ||
      node.type === "component" ||
      node.type === "custom-element" ||
      node.type === "fragment"
    ) {
      const pos = node.position?.start;
      const attrs = (node.attributes || []).map((a) => ({
        name: a?.name ?? "",
        kind: a?.kind ?? "quoted",
        value: typeof a?.value === "string" ? a.value : "",
      }));
      const frame = {
        kind: node.type,
        name: node.name ?? "",
        attrs,
        line: pos ? pos.line : 0,
        index: pos ? toIndex(pos.start ?? pos.offset ?? 0) : -1,
        inMap: !!inMap,
        subtreeHasFallback: false,
      };
      stack.push(frame);
      let hasFallback = attrs.some(
        (a) => a.name === "slot" && /\bfallback\b/.test(a.value)
      );
      for (const child of node.children || []) {
        if (visit(child, inMap)) hasFallback = true;
      }
      stack.pop();
      frame.subtreeHasFallback = hasFallback;
      if (frame.index >= 0 && frame.line >= 1) tags.push(frame);
      return hasFallback;
    }
    // text / comment / frontmatter / doctype: no structure, but may carry fallback? no.
    return false;
  };

  for (const child of ast?.children || []) visit(child, false);
  return finish(source, file, tags, false);
}

function finish(source, file, tags, fallback) {
  const { frontmatter, frontmatterEnd } = splitFrontmatter(source);
  return { file, source, frontmatter, frontmatterEnd, tags, fallback };
}

export function fallbackDocument(source, file = "<input>") {
  // Scanner fallback: same shape, coarser classification (casing heuristics
  // for kind; no expression context, so inMap is always false and subtree
  // fallback unknown — rules degrade to documented heuristics).
  const { frontmatter, frontmatterEnd } = splitFrontmatter(source);
  return { file, source, frontmatter, frontmatterEnd, tags: scannerTags(source), fallback: true };
}

// Tags for fallback mode (or any caller needing scanner tags with parsed
// attributes): [{ kind, name, attrs, line, index, inMap:false,
// subtreeHasFallback:false }]. Kinds: element | component | custom-element.
export function scannerTags(source) {
  const tags = [];
  for (const t of scanTags(source)) {
    let kind = "element";
    if (/^[A-Z]/.test(t.name) || t.name.includes(".")) kind = "component";
    else if (t.name.includes("-")) kind = "custom-element";
    tags.push({
      kind,
      name: t.name,
      attrs: scanAttrs(t.tag),
      line: lineOf(source, t.index),
      index: t.index,
      inMap: false,
      subtreeHasFallback: false,
    });
  }
  return tags;
}

// Light attribute parse of one scanned tag string:
// [{ name, kind: quoted|empty|expression|spread, value }].
// `value` is the inner text (unquoted / unbraced); spread names are `...x`.
export function scanAttrs(tag) {
  const attrs = [];
  // strip <Name and trailing > or />
  const inner = tag.replace(/^<[^A-Za-z]*/, "<").replace(/^<[A-Za-z][\w.:-]*/, "").replace(/\/?>\s*$/, "");
  let i = 0;
  const n = inner.length;
  const skipWs = () => {
    while (i < n && /\s/.test(inner[i])) i++;
  };
  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (inner[i] === "{") {
      // spread {...x} or expression child — treat {...x} as spread attr
      let depth = 0;
      let q = null;
      let j = i;
      for (; j < n; j++) {
        const c = inner[j];
        if (q) {
          if (c === "\\") j++;
          else if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") q = c;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      const body = inner.slice(i + 1, j).trim();
      if (body.startsWith("...")) {
        attrs.push({ name: body, kind: "spread", value: body.slice(3).trim() });
      }
      i = j + 1;
      continue;
    }
    const nm = /^[A-Za-z_:][\w.:-]*/.exec(inner.slice(i));
    if (!nm) {
      i++;
      continue;
    }
    const name = nm[0];
    i += name.length;
    skipWs();
    if (inner[i] !== "=") {
      attrs.push({ name, kind: "empty", value: "" });
      continue;
    }
    i++;
    skipWs();
    const c = inner[i];
    if (c === '"' || c === "'") {
      const end = inner.indexOf(c, i + 1);
      const close = end === -1 ? n : end;
      attrs.push({ name, kind: "quoted", value: inner.slice(i + 1, close) });
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === "{") {
      let depth = 0;
      let q = null;
      let j = i;
      for (; j < n; j++) {
        const d = inner[j];
        if (q) {
          if (d === "\\") j++;
          else if (d === q) q = null;
          continue;
        }
        if (d === '"' || d === "'" || d === "`") q = d;
        else if (d === "{") depth++;
        else if (d === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      attrs.push({ name, kind: "expression", value: inner.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    const vm = /^[^\s>]+/.exec(inner.slice(i));
    attrs.push({ name, kind: "quoted", value: vm ? vm[0] : "" });
    i += vm ? vm[0].length : 1;
  }
  return attrs;
}

// Legacy island-in-map proximity heuristic, used only when the compiler AST
// is unavailable (doc.fallback): paren-balance after the nearest `.map(`.
export function legacyIslandInMap(clean, idx) {
  const windowStart = Math.max(0, idx - 2000);
  const before = clean.slice(windowStart, idx);
  const mapPos = before.lastIndexOf(".map(");
  if (mapPos === -1) return false;
  const after = before.slice(mapPos);
  if (!after.includes("=>")) return false;
  let depth = 0;
  for (const ch of after) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return depth > 0;
}

export function parseDocumentSync(source, file = "<input>") {
  try {
    const res = parseAstroSync(source, { position: true });
    if (!res || !res.ast) throw new Error("empty ast");
    return fromAst(res.ast, source, file);
  } catch (e) {
    if (process.env.ASTRO_DOCTOR_DEBUG) console.error("PARSEDBG:", e && e.message);
    return fallbackDocument(source, file);
  }
}

// Bounded cache: tests and repeated scans reuse sources; capped FIFO.
const cache = new Map();
const CACHE_LIMIT = 500;

export function getDoc(source, file = "<input>") {
  let doc = cache.get(source);
  if (!doc) {
    doc = parseDocumentSync(source, file);
    if (cache.size >= CACHE_LIMIT) {
      const first = cache.keys().next();
      if (!first.done) cache.delete(first.value);
    }
    cache.set(source, doc);
  }
  return doc;
}

export function clearDocCache() {
  cache.clear();
}
