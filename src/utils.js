import fs from "node:fs";
import path from "node:path";

export const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".git",
  ".wrangler",
  ".vercel",
  ".netlify",
  "coverage",
]);

export function collectAstroFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") {
        // still allow src/.well-known style? skip dot-dirs except whitelisted
        if (IGNORE_DIRS.has(e.name)) continue;
      }
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".astro")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

export function lineOf(source, index) {
  // 1-based line number
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

export function snippetOf(source, index, len = 120) {
  const at = Math.min(Math.max(index, 0), source.length);
  const lineStart = source.lastIndexOf("\n", at) + 1;
  let lineEnd = source.indexOf("\n", Math.max(at, lineStart));
  if (lineEnd === -1) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd).trim();
  // Truncate on code-point (not UTF-16) boundaries: splitting a surrogate
  // pair emits lone surrogates that strict JSON parsers reject downstream.
  const points = Array.from(line);
  return points.length > len ? points.slice(0, len - 1).join("") + "…" : line;
}

export function isNativeTag(tag) {
  // Astro components start with an uppercase letter or contain a dot.
  // Anything starting lowercase is a native HTML element or custom element,
  // and `client:*` does not work on those — it only hydrates framework islands.
  if (!tag) return false;
  const first = tag[0];
  if (first !== first.toLowerCase() || first === first.toUpperCase()) {
    // uppercase start -> component
    if (first.toUpperCase() === first && first.toLowerCase() !== first) return false;
  }
  if (tag.includes(".")) return false;
  return /^[a-z]/.test(tag);
}

export function blankKeepLines(s) {
  return s.replace(/[^\n]/g, " ");
}

// Yield { name, tag, index } for every opening tag, with quote-,
// backtick- and {…}-aware scanning so `>` inside attribute strings,
// generics, or `=>` never truncates the tag (plain `[^>]*` regexes miss
// `<List onSelect={(x)=>f(x)} client:load />` when the directive comes last).
export function scanTags(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let exprDepth = 0; // {…} nesting at template top level (comments pre-blanked)
  let tq = null; // top-level quote tracking (double/backtick only — ' breaks on prose)
  while (i < n) {
    const c = src[i];
    if (tq) {
      if (c === "\\") i += 2;
      else {
        if (c === tq) tq = null;
        i++;
      }
      continue;
    }
    if ((c === '"' || c === "`") && exprDepth === 0) {
      // quotes in running text; inside expressions strings are handled below
      tq = c;
      i++;
      continue;
    }
    if (c === "{") {
      exprDepth++;
      i++;
      continue;
    }
    if (c === "}") {
      if (exprDepth > 0) exprDepth--;
      i++;
      continue;
    }
    if (c !== "<") {
      i++;
      continue;
    }
    const j = i + 1;
    if (j >= n || !/[A-Za-z]/.test(src[j])) {
      i++;
      continue; // </, <!--, <?, <% …
    }
    // `a<b` inside an expression is less-than, not a tag (prettier/JSX puts
    // real nested tags after whitespace or delimiters).
    if (exprDepth > 0 && /[\w$)\]}"'`]/.test(src[i - 1] || "")) {
      i++;
      continue;
    }
    let k = j + 1;
    while (k < n && /[\w.:-]/.test(src[k])) k++;
    const name = src.slice(j, k);
    let depth = 0;
    let q = null;
    let closed = false;
    while (k < n) {
      const c = src[k];
      if (q) {
        if (c === "\\") k++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'" || c === "`") {
        q = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        if (depth > 0) depth--;
      } else if (c === ">" && depth === 0) {
        closed = true;
        break;
      }
      k++;
    }
    if (closed) out.push({ name, tag: src.slice(i, k + 1), index: i });
    i = closed ? k + 1 : i + 1;
  }
  return out;
}

// Blank string literals + JS comments, preserving length and newlines.
// Prevents identifier false positives from prose ('location widget'),
// JSDoc (sessionStorage in a comment), import paths.
// Template literals are blanked except ${…} expressions (real code).

const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "yield",
  "await",
  "instanceof",
  "throw",
]);

export function stripCodeNoise(code) {
  // Single-pass lexer (length-preserving): blanks comments, string literals,
  // template-literal static text (keeping ${…} code), and regex literals.
  // Layered regexes interact badly (a quote inside a regex breaks string
  // blanking and vice versa); one pass with explicit state does not.
  const n = code.length;
  const out = code.split("");
  const blank = (a, b) => {
    for (let j = a; j < b; j++) if (out[j] !== "\n") out[j] = " ";
  };
  // frame stack: { t: "tpl" } for template static text, { t: "expr", depth }
  // for ${…} bodies (full JS: strings, nesting, more templates).
  const stack = [];
  const inTpl = () => stack.length > 0 && stack[stack.length - 1].t === "tpl";
  // Previous significant token (for regex-vs-division). A closed primary
  // (string/regex/template) behaves like `)` — division follows.
  let lastSig = null;
  let lastWord = "";
  const seen = (ch) => {
    if (ch === "\n") lastWord = "";
    else if (/[\w$]/.test(ch)) {
      lastWord += ch;
      lastSig = ch;
    } else if (!/\s/.test(ch)) {
      lastWord = "";
      lastSig = ch;
    }
  };
  const closedPrimary = () => {
    lastSig = ")";
    lastWord = "";
  };
  const tryRegex = (i) => {
    let allowed;
    if (lastSig === null) allowed = true;
    else if (lastSig === ")" || lastSig === "]") allowed = false;
    else if (/[\w$"\'`\]]/.test(lastSig)) allowed = false;
    else allowed = true;
    if (!allowed && !REGEX_KEYWORDS.has(lastWord)) return -1;
    if (allowed && lastSig !== null && !/[([{;,=!?:&|+\-*~%^<>]/.test(lastSig) && !REGEX_KEYWORDS.has(lastWord))
      return -1;
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const d = code[j];
      if (d === "\\") {
        j += 2;
        continue;
      }
      if (d === "\n") return -1;
      if (inClass) {
        if (d === "]") inClass = false;
      } else if (d === "[") {
        inClass = true;
      } else if (d === "/") {
        break;
      }
      j++;
    }
    if (j >= n || code[j] !== "/") return -1;
    j++;
    while (j < n && /[gimsuy]/.test(code[j])) j++;
    return j; // end-exclusive; -1 = not a regex
  };
  let i = 0;
  while (i < n) {
    const c = code[i];
    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    if (top && top.t === "expr") {
      if (c === "{") {
        top.depth++;
        seen(c);
        i++;
        continue;
      }
      if (c === "}") {
        top.depth--;
        if (top.depth === 0) stack.pop();
        seen(c);
        i++;
        continue;
      }
      // fall through: strings/comments/regex inside expressions handled below
    }
    if (c === "`" && !inTpl()) {
      stack.push({ t: "tpl" });
      seen(c);
      i++;
      continue;
    }
    if (inTpl()) {
      if (c === "\\") {
        blank(i, Math.min(i + 2, n));
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop();
        closedPrimary();
        i++;
        continue;
      }
      if (c === "$" && code[i + 1] === "{") {
        seen("$");
        seen("{");
        stack.push({ t: "expr", depth: 1 });
        i += 2;
        continue;
      }
      if (c !== "\n") out[i] = " ";
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      blank(i, end === -1 ? n : end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") j += 2;
        else if (code[j] === c) break;
        else if (code[j] === "\n") break;
        else j++;
      }
      const end = j < n && code[j] === c ? j + 1 : j;
      blank(i + 1, end); // keep the opening quote (position marker)
      closedPrimary();
      i = end;
      continue;
    }
    if (c === "/") {
      const end = tryRegex(i);
      if (end !== -1) {
        blank(i + 1, end); // keep opening slash as marker
        closedPrimary();
        i = end;
        continue;
      }
      seen(c);
      i++;
      continue;
    }
    seen(c);
    i++;
  }
  return out.join("");
};

export function maskTemplate(source) {
  // Return a same-length string where non-template regions are blanked
  // (newlines preserved so line numbers stay correct).
  // Blanks: frontmatter, <script>, <style>, HTML comments, {/* */}.
  // BOM becomes a space (not sliced) so indices stay aligned with the source.
  if (source.charCodeAt(0) === 0xfeff) source = " " + source.slice(1);
  let out = source;

  const blankRange = (start, end) => {
    out =
      out.slice(0, start) +
      out.slice(start, end).replace(/[^\n]/g, " ") +
      out.slice(end);
  };

  // 1. Frontmatter: leading ---\n ... \n---\n
  const hasFence = out.startsWith("---") || (out[0] === " " && out.slice(1, 4) === "---");
  if (hasFence) {
    const nl = out.indexOf("\n");
    if (nl !== -1) {
      const close = out.indexOf("\n---", nl + 1);
      if (close !== -1) {
        let end = close + 4; // past \n---
        // consume rest of closing fence line
        while (end < out.length && out[end] !== "\n") end++;
        if (out[end] === "\n") end++;
        blankRange(0, end);
      }
    }
  }

  // 2. Blank <script>…</script> and <style>…</style> wholesale (open tag, body,
  // close tag), located quote-aware via scanTags so `>` inside attributes
  // can't truncate the match. Bodies may contain anything (JSX-like text!).
  // Self-closing opens (<script … />) carry no body and must not pair with
  // a later close tag (that swallowed whole sections before).
  {
    const tags = scanTags(out);
    const spans = [];
    for (const t of tags) {
      const lname = t.name.toLowerCase();
      if (lname !== "script" && lname !== "style") continue;
      if (/\/>\s*$/.test(t.tag)) continue;
      const cm = new RegExp(`</${t.name}\\s*>`, "i").exec(out.slice(t.index + t.tag.length));
      if (!cm) continue;
      spans.push([t.index, t.index + t.tag.length + cm.index + cm[0].length]);
    }
    spans.sort((a, b) => b[0] - a[0]);
    for (const [s, e] of spans) blankRange(s, e);
  }
  for (const re of [
    /<!--[\s\S]*?-->/g,
    /\{\/\*[\s\S]*?\*\/\}/g,
  ]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(out)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      // blank inner content but keep newlines; for script/style blank everything
      out = out.slice(0, s) + out.slice(s, e).replace(/[^\n]/g, " ") + out.slice(e);
      re.lastIndex = e;
    }
  }
  return out;
}

export function stripComments(source) {
  // Back-compat: now delegates to maskTemplate (template-only view).
  return maskTemplate(source);
}

export function splitFrontmatter(source) {
  // Returns { frontmatter: string, body: string, frontmatterEnd: number }.
  // frontmatterEnd is the index in `source` where the template body starts.
  // BOM becomes a space (not sliced) so all indices stay aligned.
  const text = source.charCodeAt(0) === 0xfeff ? " " + source.slice(1) : source;
  if (!(text.startsWith("---") || (text[0] === " " && text.slice(1, 4) === "---")))
    return { frontmatter: "", body: text, frontmatterEnd: 0 };
  const nl = text.indexOf("\n");
  if (nl === -1) return { frontmatter: "", body: text, frontmatterEnd: 0 };
  const close = text.indexOf("\n---", nl + 1);
  if (close === -1) return { frontmatter: "", body: text, frontmatterEnd: 0 };
  let end = close + 4;
  while (end < text.length && text[end] !== "\n") end++;
  if (text[end] === "\n") end++;
  return {
    frontmatter: text.slice(0, end),
    body: text.slice(end),
    frontmatterEnd: end,
  };
}

export function extractScriptBlocks(source) {
  // Client-side <script> blocks (raw inner JS + start index). Excludes
  // frontmatter by operating on the body, but returns absolute indices.
  const out = [];
  eachBodyScript(source, ({ attrs, js, start }) => {
    out.push({
      attrs,
      js,
      start,
      end: start + js.length,
      isInline: /\bis:inline\b/i.test(attrs),
    });
  });
  return out;
}

export function isSuppressed(source, line, ruleName) {  // Supports, on the diagnostic line or the line above (same-length safe):
  //   <!-- astro-doctor-ignore-next-line astro/no-x -->
  //   {/* astro-doctor-ignore-next-line astro/no-x */}
  //   // astro-doctor-ignore-next-line astro/no-x
  //   ... astro-doctor-ignore-line astro/no-x ...
  //   ... astro-doctor-ignore-file astro/no-x ... (anywhere in the file)
  // A bare `astro-doctor-ignore` without a rule name suppresses all rules.
  if (/astro-doctor-ignore-file(?:\s|$)/.test(source)) {
    const m = source.match(/astro-doctor-ignore-file\s*([a-z0-9/_*,.\s-]*)/i);
    const list = (m?.[1] ?? "").trim();
    if (!list) return true;
    const names = list.split(/[\s,]+/).filter(Boolean);
    if (names.includes("all") || names.includes("*")) return true;
    if (names.includes(ruleName)) return true;
  }
  const lines = source.split("\n");
  const targets = [];
  if (lines[line - 1] !== undefined) targets.push(lines[line - 1]);
  if (lines[line - 2] !== undefined) targets.push(lines[line - 2]);
  for (const text of targets) {
    if (!text.includes("astro-doctor-ignore")) continue;
    const m = text.match(/astro-doctor-ignore(?:-(?:next-)?line)?\s*([a-z0-9/_*,.\s-]*)/i);
    const list = (m?.[1] ?? "").trim();
    if (!list) return true; // bare ignore = all
    const names = list.split(/[\s,]+/).filter(Boolean);
    if (names.includes("all") || names.includes("*")) return true;
    if (names.includes(ruleName)) return true;
    // `...-next-line` on the previous line applies to the diagnostic line;
    // `...-line` on the same line applies too. Both are in `targets`, so a
    // name match is sufficient.
  }
  return false;
}

// Find client:*/server:defer directives in a scanned tag string, ignoring
// lookalikes like data-client:load (negative lookbehind on word chars).
export function matchDirectives(tag) {
  const re = /(?<![\w:-])(client:(?:load|idle|visible|media|only|hydrate)|server:defer)(?::[A-Za-z0-9_-]+)?\b/g;
  const out = [];
  let m;
  while ((m = re.exec(tag)) !== null) out.push(m[1]);
  return out;
}

// Quote-aware attribute value from a scanned (complete) tag. Handles
// "...", '...', {…} (balanced), and bare tokens. Returns null when absent.
export function tagAttr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*`).exec(tag);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < tag.length && /\s/.test(tag[i])) i++;
  const c = tag[i];
  if (c === '"' || c === "'") {
    const end = tag.indexOf(c, i + 1);
    if (end === -1) return null;
    return tag.slice(i + 1, end);
  }
  if (c === "{") {
    let depth = 0;
    let q = null;
    for (let j = i; j < tag.length; j++) {
      const d = tag[j];
      if (q) {
        if (d === "\\") j++;
        else if (d === q) q = null;
        continue;
      }
      if (d === '"' || d === "'" || d === "`") q = d;
      else if (d === "{") depth++;
      else if (d === "}") {
        depth--;
        if (depth === 0) return tag.slice(i + 1, j);
      }
    }
    return null;
  }
  const end = tag.slice(i).search(/[\s>]/);
  return end === -1 ? tag.slice(i) : tag.slice(i, i + end);
}

// Span of the first <head>…</head> in template source, or null. Located via
// scanTags so attributes can't truncate the match; comments blanked first so
// documented examples can't phantom-match.
export function headSpan(source) {
  const clean = source.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const tags = scanTags(clean);
  for (const t of tags) {
    if (t.name.toLowerCase() !== "head") continue;
    const cm = /<\/head\s*>/i.exec(source.slice(t.index + t.tag.length));
    if (!cm) return null;
    return [t.index, t.index + t.tag.length + cm.index + cm[0].length];
  }
  return null;
}

// Execution semantics (docs.astro.build, View Transitions + Scripts guides):
// default bundled module <script> runs ONCE ever (deduped across swaps);
// is:inline / data-astro-rerun scripts re-execute when the incoming page is
// new. Only the latter can stack duplicate handlers per navigation.
export function isRerunnableScript(attrs) {
  return /\bis:inline\b/i.test(attrs) || /data-astro-rerun/i.test(attrs);
}

// Yield { attrs, js, start, end } for each <script>…</script> in template body
// (frontmatter excluded). Tag boundaries come from scanTags (quote-aware);
// the body ends at the first literal </script> — which authors must escape
// inside JS strings anyway, or the HTML itself breaks.
export function eachBodyScript(source, fn) {
  const { frontmatterEnd } = splitFrontmatter(source);
  const body = source.slice(frontmatterEnd);
  const tags = scanTags(body);
  const closeRe = /<\/script\s*>/gi;
  for (const t of tags) {
    if (t.name.toLowerCase() !== "script") continue;
    // Self-closing <script … /> carries no body (common for ld+json
    // set:html one-liners) — pairing it with a later </script> would swallow
    // whole sections into a phantom block.
    if (/\/>\s*$/.test(t.tag)) continue;
    closeRe.lastIndex = t.index + t.tag.length;
    const cm = closeRe.exec(body);
    if (!cm) continue;
    const jsStart = t.index + t.tag.length;
    fn({
      attrs: t.tag.slice("<script".length, t.tag.length - 1),
      js: body.slice(jsStart, cm.index),
      start: frontmatterEnd + jsStart,
      tagStart: frontmatterEnd + t.index,
    });
  }
}
