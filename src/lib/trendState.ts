// Trend state wording, shared so it can be unit-tested.
//
// The word describes the direction of the BUSINESS, not the direction of the number:
// for an inverted metric (ad spend, CAC, refunds) a decline is the good outcome, so
// calling it "growing" would read as praise for the wrong thing.

export interface TrendState { label: string; cls: "" | "good" | "warning" | "critical"; }

export function trendState(growth: number, accel: number, invert = false): TrendState {
  if (Math.abs(growth) < 0.03) return { label: "stable", cls: "" };
  const good = invert ? growth < 0 : growth > 0;
  // Acceleration is "more of the same" — which way that points depends on the metric.
  const accelerating = invert ? accel < -0.03 : accel > 0.03;
  if (good) return accelerating ? { label: "improving fast", cls: "good" } : { label: "improving", cls: "good" };
  return accelerating ? { label: "worsening", cls: "warning" } : { label: "deteriorating", cls: "critical" };
}
