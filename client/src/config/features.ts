// Mirrors server/src/config/features.ts. Decision-support surfaces are ON
// unless VITE_FEATURE_AI=false (they are hidden, not deleted, while it is off).
// Set the server's FEATURE_AI to the same value, or the two halves disagree.
export const FEATURES = {
  ai: import.meta.env.VITE_FEATURE_AI !== "false",
  // On unless VITE_FEATURE_MULTI_ROLE_TABS=false: every login is private to its browser
  // tab, so one Chrome can hold a different role in each tab. Off: one shared
  // login per browser.
  multiRoleTabs: import.meta.env.VITE_FEATURE_MULTI_ROLE_TABS !== "false",
  // Hardcoded false, never wired to an env var, and never to be turned on:
  // these are UI surfaces (a header badge, "coming soon" cards, an unused
  // AI column, a dead insights route) that show no real computed output —
  // no data source backs them, some don't even have a server endpoint.
  // `ai` above is reserved for surfaces that show genuine output (proposal
  // completeness validation, workflow aiNote, and the decision-support
  // signals layer). Turning this on would ship fabricated-looking content;
  // see docs/ai-signals-progress.md group A3 for the full surface audit.
  aiPlaceholders: false,
} as const;
