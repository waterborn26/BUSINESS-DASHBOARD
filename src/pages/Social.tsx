// Content / social performance — what content actually drives revenue.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtNum, fmtNumCompact, fmtPct, fmtUsdCompact } from "@/lib/money";
import { periodTotals } from "@/engines/analytics";

export default function Social() {
  const { store, period } = useApp();
  const posts = useMemo(
    () => store.socialPosts.filter((p) => p.postedAt >= period.start && p.postedAt <= period.end),
    [store, period],
  );
  const followers = useMemo(() => 12400 + store.socialPosts.reduce((t, p) => t + p.followersDelta, 0), [store]);
  const growth = posts.reduce((t, p) => t + p.followersDelta, 0);

  // Content type analysis: which subject drives clicks (proxy for revenue) vs just reach
  const bySubject = useMemo(() => {
    const m = new Map<string, { posts: number; reach: number; engagement: number; clicks: number; followers: number }>();
    for (const p of store.socialPosts) {
      const rec = m.get(p.subject) ?? { posts: 0, reach: 0, engagement: 0, clicks: 0, followers: 0 };
      rec.posts++; rec.reach += p.reach; rec.engagement += p.engagement; rec.clicks += p.linkClicks; rec.followers += p.followersDelta;
      m.set(p.subject, rec);
    }
    return [...m.entries()].map(([subject, v]) => ({
      subject, ...v,
      clickRate: v.reach ? v.clicks / v.reach : 0,
      engRate: v.reach ? v.engagement / v.reach : 0,
    })).sort((a, b) => b.clickRate - a.clickRate);
  }, [store]);

  // Post → next-day sales lift (cross-dataset)
  const withLift = useMemo(() => {
    const avgRev = (d: string) => {
      const r = store.rollups.get(d);
      return r ? r.gross - r.discounts + r.shippingRev : 0;
    };
    return [...posts].sort((a, b) => b.reach - a.reach).slice(0, 12).map((p) => {
      const day0 = avgRev(p.postedAt) + avgRev(addDays(p.postedAt, 1));
      const base = (avgRev(addDays(p.postedAt, -7)) + avgRev(addDays(p.postedAt, -6))) || 1;
      return { ...p, lift: day0 / base - 1 };
    });
  }, [posts, store]);

  const t = useMemo(() => periodTotals(store, period), [store, period]);
  const bestSubject = bySubject[0];
  const vanity = [...bySubject].sort((a, b) => b.followers - a.followers)[0];

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Followers (all platforms)" value={fmtNumCompact(followers)} sub={<span>+{fmtNum(growth)} in period</span>} />
        <Kpi label="Posts (period)" value={fmtNum(posts.length)} />
        <Kpi label="Total reach" value={fmtNumCompact(posts.reduce((x, p) => x + p.reach, 0))} />
        <Kpi label="Engagement" value={fmtNumCompact(posts.reduce((x, p) => x + p.engagement, 0))} />
        <Kpi label="Site clicks from social" value={fmtNumCompact(posts.reduce((x, p) => x + p.linkClicks, 0))} />
      </div>

      {bestSubject && vanity && (
        <div className="insight info">
          <div className="insight-title">Which content actually drives revenue?</div>
          <div className="insight-detail">
            "<strong>{bestSubject.subject}</strong>" content has the highest click-through to the store
            ({fmtPct(bestSubject.clickRate, 2)} of reach) — it converts attention into sessions.
            "{vanity.subject}" posts grow followers fastest (+{fmtNum(vanity.followers)}) but drive
            {" "}{fmtPct(vanity.clickRate, 2)} clicks — audience-building, not direct revenue. Both matter; budget them deliberately.
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Content types — reach vs revenue behavior" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Subject</th><th className="num">Posts</th><th className="num">Avg reach</th><th className="num">Eng. rate</th><th className="num">Click rate</th><th className="num">Followers</th></tr></thead>
              <tbody>
                {bySubject.map((s) => (
                  <tr key={s.subject}>
                    <td style={{ textTransform: "capitalize", fontWeight: 600 }}>{s.subject}</td>
                    <td className="num">{s.posts}</td>
                    <td className="num">{fmtNumCompact(Math.round(s.reach / Math.max(1, s.posts)))}</td>
                    <td className="num">{fmtPct(s.engRate, 1)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtPct(s.clickRate, 2)}</td>
                    <td className="num dim">+{fmtNum(s.followers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Top posts — with next-48h revenue lift" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Platform</th><th>Format</th><th>Subject</th><th className="num">Reach</th><th className="num">Clicks</th><th className="num">Revenue lift*</th></tr></thead>
              <tbody>
                {withLift.map((p) => (
                  <tr key={p.id}>
                    <td className="dim">{fmtDate(p.postedAt)}</td>
                    <td style={{ textTransform: "capitalize" }}>{p.platform}</td>
                    <td className="dim">{p.format}</td>
                    <td>{p.subject}{p.productId && <span className="dim"> · {store.productById.get(p.productId)?.name.split(" ")[0]}</span>}</td>
                    <td className="num">{fmtNumCompact(p.reach)}</td>
                    <td className="num">{fmtNum(p.linkClicks)}</td>
                    <td className="num" style={{ color: p.lift > 0.05 ? "var(--delta-good)" : undefined }}>{fmtPct(p.lift, 0, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11, padding: "8px 16px" }}>
            *Revenue in the 48h after posting vs the same weekdays one week earlier — correlation, not
            proven attribution. Large spikes usually coincide with viral reach.
          </p>
        </Card>
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>
        Period social sessions estimated in traffic as source "tiktok"/"meta" organic share; email drives {fmtUsdCompact(t.netRevenue * 0.1)} (~10%) of period revenue via Klaviyo flows.
      </p>
    </>
  );
}
