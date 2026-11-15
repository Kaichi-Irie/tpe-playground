export type BandwidthRule = "constant" | "scott" | "silverman";

export function validateBandwidthRule(rule: string): asserts rule is BandwidthRule {
  if (!["constant", "scott", "silverman"].includes(rule)) throw new Error("Unknown bandwidth rule.");
}

// One-dimensional rules use observation locations, independently of mixture weights.
// Scott: s n^(-1/5). Silverman: 0.9 min(s, IQR / 1.34) n^(-1/5).
// Quartiles use linear interpolation (R type 7). The prior is excluded.
export function resolveBandwidth(samples: readonly number[], rule: BandwidthRule, constant: number, domainWidth: number, includePrior = false): number {
  validateBandwidthRule(rule);
  if (!Number.isFinite(constant) || constant <= 0 || !Number.isFinite(domainWidth) || domainWidth <= 0 || samples.some((x) => !Number.isFinite(x))) throw new Error("Invalid bandwidth inputs.");
  if (rule === "constant") return constant;
  const n = samples.length;
  // Match Optuna's magic-clip bounds: count observation kernels and the
  // optional prior, then allow one additional unit in the denominator.
  const minimum = domainWidth / Math.min(100, 1 + n + Number(includePrior));
  let spread = 0;
  if (n > 1) {
    const mean = samples.reduce((sum, x) => sum + x, 0) / n;
    const sd = Math.sqrt(samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1));
    spread = sd;
    if (rule === "silverman") {
      const sorted = [...samples].sort((a, b) => a - b);
      const quantile = (p: number) => {
        const index = (n - 1) * p, lower = Math.floor(index);
        return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
      };
      const robust = (quantile(0.75) - quantile(0.25)) / 1.34;
      spread = Math.min(spread, robust);
    }
  }
  // Undefined singleton spread and zero spread both resolve to the clip floor.
  return Math.max(minimum, Math.min(domainWidth, (rule === "silverman" ? 0.9 : 1) * spread * Math.max(1, n) ** -0.2));
}
