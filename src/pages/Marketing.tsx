// Marketing analytics — profit-first channel evaluation (contribution, not just ROAS).

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { dateRange } from "@/lib/dates";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { periodTotals, trafficSourceStats } from "@/engines/analytics";

export default function Marketing() {
  const { store, period } = useApp();
  const t = useMemo(() => periodTotals(store, period), [store, period]);
  const channels = useMemo(
    () => trafficSourceStats(store, period).filter((s) => ["meta", "google", "tiktok", "email"].includes(s.source)),
    [store, period],
  );

  // Campaign-level rollup
  const campaigns = useMemo(() => {
    const m = new Map<string, { spend: number; impressions: number; clicks: number; attributed: number; newC: number }>();
    for (const sp of store.spendDaily) {
      if (sp.date < period.start || sp.date > period.end) continue;
      const rec = m.get(sp.campaignId) ?? { spend: 0, impressions: 0, clicks: 0, attributed: 0, newC: 0 };
      rec.spend += sp.spend; rec.impressions += sp.impressions; rec.clicks += sp.clicks;
      rec.attributed += sp.attributedRevenue; rec.newC += sp.newCustomers;
      m.set(sp.campaignId, rec);
    }
    return [...m.entries()].map(([id, v]) => ({ campaign: store.campaigns.find((c) => c.id === id), ...v }))
      .filter((c) => c.campaign && c.spend > 0)
      .sort((a, b) => b.spend - a.spend);
  }, [store, period]);

  // Daily spend vs revenue chart
  const chart = useMemo(() => {
    const days = dateRange(period.start, period.end);
    const spend = days.map((d) => store.rollups.get(d)?.adSpend ?? 0);
    const rev = days.map((d) => {
      const r = store.rollups.get(d);
      return r ? r.gross - r.discounts - r.refunds + r.shippingRev : 0;
    });
    return { days, spend, rev };
  }, [store, period]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Ad spend" value={fmtUsdCompact(t.adSpend)} />
        <Kpi label="MER (revenue ÷ spend)" value={fmtRatio(t.mer)} />
        <Kpi label="Blended CAC" value={fmtUsd(t.blendedCac)} />
        <Kpi label="New customers" value={fmtNum(t.newCustomers)} />
        <Kpi label="Contribution after spend" value={fmtUsdCompact(channels.reduce((x, c) => x + c.contributionProfit, 0))} />
      </div>

      <div className="insight info">
        <div className="insight-title">Profit-first evaluation</div>
        <div className="insight-detail">
          Platform-reported "attributed revenue" double-counts across platforms and ignores margin. Meridian
          judges each channel on <strong>contribution profit</strong>: revenue from that channel's orders minus COGS,
          fees, fulfillment, and the channel's spend. MER is the blended source of truth for overall efficiency.
        </div>
      </div>

      <Card title="Channel economics" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Channel</th><th className="num">Spend</th><th className="num">Sessions</th><th className="num">Orders</th>
                <th className="num">Revenue</th><th className="num">MER</th><th className="num">New-customer CAC</th>
                <th className="num">Contribution</th><th className="num">Profit / $ spent</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => {
                // Owned channels carry only a platform fee, so MER/CAC multiples are
                // not comparable to paid acquisition — shown as "—" rather than a
                // flattering number that invites the wrong reallocation.
                const owned = c.source === "email";
                return (
                <tr key={c.source}>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                    {c.source} {owned && <span className="badge">owned</span>}
                  </td>
                  <td className="num">{fmtUsdCompact(c.spend)}</td>
                  <td className="num">{fmtNum(c.sessions)}</td>
                  <td className="num">{fmtNum(c.orders)}</td>
                  <td className="num">{fmtUsdCompact(c.revenue)}</td>
                  <td className="num">{owned ? <span className="dim">—</span> : fmtRatio(c.mer)}</td>
                  <td className="num">{owned ? <span className="dim">—</span> : c.cac ? fmtUsd(c.cac) : "—"}</td>
                  <td className="num" style={{ fontWeight: 700, color: c.contributionProfit < 0 ? "var(--delta-bad)" : "var(--delta-good)" }}>
                    {fmtUsdCompact(c.contributionProfit)}
                  </td>
                  <td className="num">{owned || !c.spend ? <span className="dim">—</span> : `$${(c.contributionProfit / c.spend).toFixed(2)}`}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11, padding: "8px 16px" }}>
          Email is an owned channel: its only cost is the platform fee, so MER and CAC
          multiples are not comparable to paid acquisition and are omitted rather than
          shown as a flattering ratio. Compare it on contribution profit instead.
        </p>
      </Card>

      <div className="grid cols-2">
        <Card title="Daily ad spend vs net revenue">
          <LineChart
            labels={chart.days}
            series={[
              { name: "Net revenue", color: "var(--s1)", values: chart.rev },
              { name: "Ad spend", color: "var(--s2)", values: chart.spend },
            ]}
            yFmt={fmtUsdCompact}
            height={210}
          />
        </Card>

        <Card title="Campaigns" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Campaign</th><th className="num">Spend</th><th className="num">CPM</th><th className="num">CPC</th><th className="num">Platform ROAS</th><th className="num">New cust.</th></tr></thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaign!.id}>
                    <td>{c.campaign!.name}</td>
                    <td className="num">{fmtUsdCompact(c.spend)}</td>
                    <td className="num dim">{c.impressions ? fmtUsd(Math.round((c.spend / c.impressions) * 1000), { cents: true }) : "—"}</td>
                    <td className="num dim">{c.clicks ? fmtUsd(Math.round(c.spend / c.clicks), { cents: true }) : "—"}</td>
                    <td className="num">
                      {c.spend && c.attributed > 0
                        ? <>{fmtRatio(c.attributed / c.spend)} <span className="badge">platform-reported</span></>
                        : <span className="dim">no attribution</span>}
                    </td>
                    <td className="num">{fmtNum(c.newC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11, padding: "8px 16px" }}>
            Platform ROAS figures use each platform's own attribution and are shown for reference only —
            never summed across platforms.
          </p>
        </Card>
      </div>
    </>
  );
}
