// Copy to astro-doctor.config.mjs in your project root and tune.
/** @type {import('astro-doctor/src/config.js')} */
export default {
  rules: {
    // Downgrade noisy-but-accepted patterns per project:
    // "astro/no-too-many-islands": "off",
    // "astro/no-draft-leak": "warn",
  },
  // Minimatch-style (`*`, `**`) paths relative to the scan root:
  ignore: [],
};
