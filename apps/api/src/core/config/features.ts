// Decision support (proposal validation, signals, suggested plans, task
// allocation advice, impact forecasts) is ON unless FEATURE_AI is explicitly
// "false". Everything it produces is rule-based advice: it never blocks,
// approves, rejects or applies anything, and a person always decides. The flag
// stays so a deployment can switch the whole layer off without a rebuild.
export const FEATURES = {
  ai: process.env.FEATURE_AI !== "false",
} as const;
