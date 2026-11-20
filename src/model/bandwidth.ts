export const bandwidthRules = ["constant", "scott", "silverman", "neighbor"] as const;
export type BandwidthRule = typeof bandwidthRules[number];

export function isBandwidthRule(rule: string | null): rule is BandwidthRule {
  return bandwidthRules.some((value) => value === rule);
}

export function validateBandwidthRule(rule: string): asserts rule is BandwidthRule {
  if (!isBandwidthRule(rule)) throw new Error("Unknown bandwidth rule.");
}

// Count the observation kernels, optional prior, and one additional unit.
function clipBandwidth(width: number, domainWidth: number, count: number, includePrior: boolean): number {
  const minimum = domainWidth / Math.min(100, 1 + count + Number(includePrior));
  return Math.max(minimum, Math.min(domainWidth, width));
}

export function neighborBandwidths(centers: readonly number[], low: number, high: number, includePrior: boolean): number[] {
  const range = high - low;
  if (!Number.isFinite(range) || range <= 0 || centers.some((center) => !Number.isFinite(center) || center < low || center > high)) {
    throw new Error("Invalid bandwidth inputs.");
  }
  const sorted = centers.map((center, index) => ({ center, index })).sort((a, b) => a.center - b.center);
  const widths = new Array<number>(centers.length);
  sorted.forEach(({ center, index }, position) => {
    const left = sorted[position - 1]?.center;
    const right = sorted[position + 1]?.center;
    // Ignore the box edge at the first and last center, except for a singleton.
    const leftGap = left === undefined && right !== undefined ? 0 : center - (left ?? low);
    const rightGap = right === undefined && left !== undefined ? 0 : (right ?? high) - center;
    widths[index] = clipBandwidth(Math.max(leftGap, rightGap), range, centers.length, includePrior);
  });
  return widths;
}

// One-dimensional rules use observation locations, independently of mixture weights.
// Scott: s n^(-1/5). Silverman: 0.9 min(s, IQR / 1.34) n^(-1/5).
// Quartiles use linear interpolation (R type 7). The prior is excluded.
export function resolveBandwidth(samples: readonly number[], rule: BandwidthRule, constant: number, domainWidth: number, includePrior = false): number {
  validateBandwidthRule(rule);
  if (rule === "neighbor") throw new Error("Neighbor bandwidths require centers and box bounds.");
  if (!Number.isFinite(constant) || constant <= 0 || !Number.isFinite(domainWidth) || domainWidth <= 0 || samples.some((x) => !Number.isFinite(x))) throw new Error("Invalid bandwidth inputs.");
  if (rule === "constant") return constant;
  const n = samples.length;
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
  return clipBandwidth((rule === "silverman" ? 0.9 : 1) * spread * Math.max(1, n) ** -0.2, domainWidth, n, includePrior);
}
