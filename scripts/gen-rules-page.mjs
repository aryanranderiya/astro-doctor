import { execFileSync } from "node:child_process";
import fs from "node:fs";

const rules = JSON.parse(execFileSync("node", ["./bin/astro-doctor.js", "rules", "--json"], { encoding: "utf8" }));
const grouped = {};
for (const r of rules) {
  const cat = r.category || "Misc";
  (grouped[cat] ||= []).push(r);
}
const esc = (s) => s.replace(/<(?=[a-zA-Z/!])/g, "\\<");
const parts = [];
for (const cat of Object.keys(grouped).sort()) {
  parts.push(`<Accordion title="${cat}">`);
  for (const r of grouped[cat].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    parts.push(`**\`${r.name}\`** — *${r.severity || "warning"}* — ${esc(r.description || "")}`);
    parts.push("");
  }
  parts.push("</Accordion>");
  parts.push("");
}
const page = `---
title: Rules reference
description: All ${rules.length} astro-doctor rules by category.
---

# Rules reference

<Note>
  \`error\` = broken, insecure, or silently ignored. Fix or prove wrong.
  \`warning\` = real cost. Fix unless you can cite why not.
</Note>

` + parts.join("\n") + `## Deliberately not rules

- \`target="_blank"\` without \`rel\` — browsers imply \`noopener\` since 2021
- Remote \`Image\` without \`remotePatterns\` — needs config-file I/O
- Collection schema checks, multi-framework pages, bare \`client:visible\` without \`rootMargin\`
- Duplicate \`id\` across files, untyped buttons outside forms, intervals in persisted subtrees
`;
fs.writeFileSync("docs/rules.mdx", page);
console.log("rules page ok:", rules.length, "rules");
