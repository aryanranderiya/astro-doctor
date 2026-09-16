import { lineOf, snippetOf, maskTemplate, headSpan } from "../utils.js";

export const meta = {
  name: "astro/no-missing-color-scheme",
  category: "Accessibility",
  severity: "warning",
  description:
    "Dark-mode sites without a color-scheme declaration leave native controls (scrollbars, inputs, date pickers) in light mode and risk a white flash. Declare <meta name=\"color-scheme\"> or CSS color-scheme.",
};

export function check(file, source) {
  const clean = maskTemplate(source);
  if (!/<html\b/i.test(clean)) return []; // document shells only
  const span = headSpan(clean);
  const head = span ? clean.slice(span[0], span[1]) : "";
  const hasDarkSignal =
    /class\s*=\s*["'][^"']*\bdark\b/i.test(clean) ||
    /prefers-color-scheme/i.test(source) ||
    /localStorage\s*\.\s*getItem\s*\(\s*['"]theme['"]/i.test(source);
  if (!hasDarkSignal) return [];
  if (/name\s*=\s*["']color-scheme["']/i.test(head)) return [];
  // NB: `prefers-color-scheme:` (media query) must not count as a declaration.
  if (/(?<!prefers-)color-scheme\s*:/i.test(source)) return [];
  const idx = source.search(/<html\b/i);
  return [
    {
      rule: meta.name,
      category: meta.category,
      severity: meta.severity,
      file,
      line: lineOf(source, idx),
      message: `Dark-mode document with no color-scheme declaration — add <meta name="color-scheme" content="light dark"> in <head> (or \`color-scheme: light dark\` in CSS) so scrollbars, inputs, and canvas default correctly.`,
      snippet: snippetOf(source, idx),
    },
  ];
}
