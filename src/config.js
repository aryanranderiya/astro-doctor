import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_NAMES = [
  "astro-doctor.config.mjs",
  "astro-doctor.config.js",
  "doctor.config.mjs",
  "doctor.config.js",
];

export async function loadConfig(root) {
  for (const name of CONFIG_NAMES) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    try {
      const mod = await import(pathToFileURL(full).href);
      return { ...(mod.default ?? mod), __file: full };
    } catch (err) {
      console.error(`astro-doctor: failed to load ${full}: ${err?.message ?? err}`);
      return {};
    }
  }
  return {};
}

export function resolveSeverity(config, ruleName, defaultSeverity) {
  const override = config?.rules?.[ruleName];
  if (override === undefined) return defaultSeverity;
  if (override === "off" || override === false || override === 0) return "off";
  if (override === "warn" || override === "warning" || override === 1) return "warning";
  if (override === "error" || override === 2) return "error";
  return defaultSeverity;
}

export function isIgnored(config, file, root) {
  const patterns = config?.ignore ?? [];
  const rel = path.relative(root, file).replaceAll("\\", "/");
  for (const pat of patterns) {
    // minimal glob: support `*` and trailing `/**`
    const rx = new RegExp(
      "^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$"
    );
    if (rx.test(rel) || rel.startsWith(pat.replace(/\/\*\*.*$/, "").replace(/\*.*$/, ""))) return true;
  }
  return false;
}
