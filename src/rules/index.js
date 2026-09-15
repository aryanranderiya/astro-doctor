import { meta as m1, check as c1 } from "./client-directive-on-html.js";
import { meta as m2, check as c2 } from "./prefer-astro-image.js";
import { meta as m3, check as c3 } from "./no-unsafe-set-html.js";
import { meta as m4, check as c4 } from "./no-document-in-frontmatter.js";
import { meta as m5, check as c5 } from "./no-hooks-in-frontmatter.js";
import { meta as m6, check as c6 } from "./no-client-load-abuse.js";
import { meta as m7, check as c7 } from "./no-too-many-islands.js";
import { meta as m8, check as c8 } from "./no-non-serializable-island-props.js";
import { meta as m9, check as c9 } from "./no-island-in-map.js";
import { meta as m10, check as c10 } from "./no-client-only-without-fallback.js";
import { meta as m11, check as c11 } from "./no-server-defer-misuse.js";
import { meta as m12, check as c12 } from "./no-define-vars-xss.js";
import { meta as m13, check as c13 } from "./no-client-env-leak.js";
import { meta as m14, check as c14 } from "./no-prerender-mismatch.js";
import { meta as m15, check as c15 } from "./no-fetch-waterfall.js";
import { meta as m16, check as c16 } from "./no-unbounded-collection.js";
import { meta as m17, check as c17 } from "./no-draft-leak.js";
import { meta as m18, check as c18 } from "./no-missing-html-lang.js";
import { meta as m19, check as c19 } from "./no-sync-external-script.js";
import { meta as m20, check as c20 } from "./no-open-redirect.js";
import { meta as m21, check as c21 } from "./no-client-on-astro-component.js";
import { meta as m22, check as c22 } from "./no-collection-refetch.js";
import { meta as m23, check as c23 } from "./no-router-unaware-script.js";
import { meta as m24, check as c24 } from "./no-large-island-props.js";
import { meta as m25, check as c25 } from "./no-unguarded-script-injection.js";
import { meta as m26, check as c26 } from "./no-unsafe-storage-access.js";
import { meta as m27, check as c27 } from "./no-duplicate-nav-listeners.js";
import { meta as m28, checkAll as c28all } from "./no-dead-component.js";
import { meta as m29, check as c29 } from "./no-inline-event-handler.js";
import { meta as m30, check as c30 } from "./no-unhandled-promise.js";
import { meta as m31, checkAll as c31all } from "./no-missing-static-asset.js";
import { meta as m32, check as c32 } from "./no-missing-color-scheme.js";
import { meta as m33, checkAll as c33all } from "./no-duplicate-markup.js";
import { meta as m34, check as c34 } from "./no-deep-island-props.js";
import { meta as m35, check as c35 } from "./no-unsafe-navigate.js";
import { meta as m36, check as c36 } from "./no-missing-reinit-on-nav.js";
import { meta as m37, check as c37 } from "./no-secret-in-define-vars.js";
import { meta as m38, check as c38 } from "./no-complex-frontmatter.js";
import { meta as m39, checkAll as c39all } from "./no-huge-file.js";
import { meta as m40, checkAll as c40all } from "./no-untracked-todo.js";
import { meta as m41, checkAll as c41all } from "./no-broken-internal-links.js";
import { meta as m42, checkAll as c42all } from "./no-unknown-collection.js";

export const RULES = [
  { meta: m1, check: c1 },
  { meta: m2, check: c2 },
  { meta: m3, check: c3 },
  { meta: m4, check: c4 },
  { meta: m5, check: c5 },
  { meta: m6, check: c6 },
  { meta: m7, check: c7 },
  { meta: m8, check: c8 },
  { meta: m9, check: c9 },
  { meta: m10, check: c10 },
  { meta: m11, check: c11 },
  { meta: m12, check: c12 },
  { meta: m13, check: c13 },
  { meta: m14, check: c14 },
  { meta: m15, check: c15 },
  { meta: m16, check: c16 },
  { meta: m17, check: c17 },
  { meta: m18, check: c18 },
  { meta: m19, check: c19 },
  { meta: m20, check: c20 },
  { meta: m21, check: c21 },
  { meta: m22, check: c22 },
  { meta: m23, check: c23 },
  { meta: m24, check: c24 },
  { meta: m25, check: c25 },
  { meta: m26, check: c26 },
  { meta: m27, check: c27 },
  { meta: m28, checkAll: c28all },
  { meta: m29, check: c29 },
  { meta: m30, check: c30 },
  { meta: m31, checkAll: c31all },
  { meta: m32, check: c32 },
  { meta: m33, checkAll: c33all },
  { meta: m34, check: c34 },
  { meta: m35, check: c35 },
  { meta: m36, check: c36 },
  { meta: m37, check: c37 },
  { meta: m38, check: c38 },
  { meta: m39, checkAll: c39all },
  { meta: m40, checkAll: c40all },
  { meta: m41, checkAll: c41all },
  { meta: m42, checkAll: c42all },
];
