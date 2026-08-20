import { describe, expect, it } from "vitest";
import { trendState } from "@/lib/trendState";

describe("trend state wording", () => {
  it("calls a rising normal metric improving", () => {
    expect(trendState(0.10, 0.05).label).toBe("improving fast");
    expect(trendState(0.10, -0.05).label).toBe("improving");
  });

  it("calls a falling normal metric deteriorating", () => {
    expect(trendState(-0.10, -0.05).cls).toBe("critical");
  });

  it("never praises a rising inverted metric", () => {
    // Ad spend / CAC / refunds going UP is bad news, whatever the arrow looks like.
    const s = trendState(0.15, 0.05, true);
    expect(s.cls).not.toBe("good");
    expect(s.label).not.toMatch(/improving|growing/);
  });

  it("credits a falling inverted metric as improving", () => {
    // Ad spend down 11.6% must never read as "growing".
    const s = trendState(-0.116, -0.248, true);
    expect(s.cls).toBe("good");
    expect(s.label).toMatch(/improving/);
    expect(s.label).not.toMatch(/growing/);
  });

  it("treats small moves as stable regardless of direction", () => {
    expect(trendState(0.01, 0.2).label).toBe("stable");
    expect(trendState(-0.02, -0.2, true).label).toBe("stable");
  });
});
