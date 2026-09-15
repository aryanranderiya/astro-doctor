import { lineOf, snippetOf, splitFrontmatter, stripCodeNoise } from "../utils.js";

export const meta = {
  name: "astro/no-hooks-in-frontmatter",
  category: "Correctness",
  severity: "error",
  description:
    "Framework hooks (useState/useEffect/use()…) run in a reactive client runtime. Frontmatter runs once on the server — hooks there are dead code. Move into a .tsx/.jsx island.",
};

const HOOK_RE =
  /\b(useState|useEffect|useLayoutEffect|useMemo|useCallback|useRef|useContext|useReducer|useStore|useSignal|createSignal|createEffect)\s*\(/g;
// React 19 use(): bare `use(` call (not a method, not `…use(`).
const USE_RE = /(?<![\w$.])use\s*\(/g;

export function check(file, source) {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter) return [];
  const code = stripCodeNoise(frontmatter);
  const diagnostics = [];
  const push = (name, idx) => {
    diagnostics.push({
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `'${name}(…)' in frontmatter never re-renders — frontmatter is server-only. Move this state/effect into a framework island (.tsx) with a client:* directive.`,
      snippet: snippetOf(source, idx),
    });
  };
  let m;
  while ((m = HOOK_RE.exec(code)) !== null) push(m[1], m.index);
  while ((m = USE_RE.exec(code)) !== null) push("use", m.index);
  return diagnostics;
}
