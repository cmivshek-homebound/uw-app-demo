import { Link } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { ASSETS } from '../data/assets';
import { TAPE, computed, human } from '../data/provenance';
import { underwritingGap } from '../data/selectors';
import type { GapLineKey } from '../data/selectors';
import { CLOSING_COST_CORRECTED_ON, CLOSING_COST_PCT, closingCostPctFor } from '../data/underwriting';
import type { ProvenanceInfo } from '../types';

const ASSUMPTION = human('Underwriting assumption');
const UW: ProvenanceInfo = { provenance: 'human', note: 'Reviewed underwrite' };

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function signedUsd(n: number) {
  if (Math.round(n) === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function signedPct(n: number, digits = 1) {
  if (Number(n.toFixed(digits)) === 0) return `0${digits ? '.' + '0'.repeat(digits) : ''}%`;
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(digits)}%`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function average(values: number[]) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export default function UnderwritingAccuracyTab() {
  const sold = ASSETS.filter((a) => a.sale && a.underwrite).sort((a, b) => a.sale!.soldOn.localeCompare(b.sale!.soldOn));
  const gaps = sold.map((a) => ({ asset: a, gap: underwritingGap(a)! }));

  // Average variance by line across sold assets.
  const keys = gaps[0].gap.lines.map((l) => ({ key: l.key, label: l.label }));
  const byLine = keys.map(({ key, label }) => {
    const rows = gaps.map(({ gap }) => gap.lines.find((l) => l.key === key)!);
    return {
      key,
      label,
      uw: average(rows.map((r) => r.uw)),
      realized: average(rows.map((r) => r.realized)),
      variance: average(rows.map((r) => r.realized - r.uw)),
      variancePct: average(rows.map((r) => ((r.realized - r.uw) / r.uw) * 100)),
      marginImpact: average(rows.map((r) => r.marginImpact)),
      hurt: rows.filter((r) => r.marginImpact < 0).length,
    };
  });

  // Closing-cost finding: deals underwritten before the correction assumed the legacy rate.
  const legacy = sold.filter((a) => a.underwrite!.underwrittenOn < CLOSING_COST_CORRECTED_ON);
  const realizedPct = (a: (typeof sold)[number]) => (a.sale!.closingCosts / a.sale!.landPrice) * 100;
  const oldest = [...legacy].sort((a, b) => a.underwrite!.underwrittenOn.localeCompare(b.underwrite!.underwrittenOn)).slice(0, 4);
  const assumed = legacy.length ? closingCostPctFor(legacy[0].underwrite!.underwrittenOn) : CLOSING_COST_PCT;
  const correctedMonth = new Date(`${CLOSING_COST_CORRECTED_ON}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const avgUwMargin = average(sold.map((a) => a.underwrite!.marginPct));
  const avgRealizedMargin = average(sold.map((a) => a.sale!.marginPct));
  const isCost = (key: GapLineKey) => key !== 'salePrice';

  return (
    <div className="pf-accuracy">
      <div className="pf-callout">
        <h3 className="pf-callout-title">Closing costs were underwritten too low</h3>
        <p className="pf-callout-text">
          The {oldest.length} oldest sold deals assumed <ProvenanceValue info={ASSUMPTION}>{assumed}%</ProvenanceValue> of land for closing costs and realized{' '}
          <ProvenanceValue info={TAPE}>{average(oldest.map(realizedPct)).toFixed(2)}%</ProvenanceValue> on average
          ({oldest.map((a) => a.id).join(', ')}). Across all {legacy.length} deals underwritten before {correctedMonth},
          realized closing averaged <ProvenanceValue info={TAPE}>{average(legacy.map(realizedPct)).toFixed(2)}%</ProvenanceValue>.
          The assumption was corrected to <ProvenanceValue info={ASSUMPTION}>{CLOSING_COST_PCT}%</ProvenanceValue> in {correctedMonth}; underwrites since then use it.
        </p>
      </div>

      <ProvenanceLegend />

      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Margin by sold asset</h3>
          <span className="pf-card-caption">
            Average <ProvenanceValue info={computed('Average of reviewed underwrite margins')}>{avgUwMargin.toFixed(1)}%</ProvenanceValue> underwritten →{' '}
            <ProvenanceValue info={computed('Average realized margin from the BOOL data tape')}>{avgRealizedMargin.toFixed(1)}%</ProvenanceValue> realized
          </span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Sold</th>
                <th className="pf-num">UW margin</th>
                <th className="pf-num">Realized margin</th>
                <th className="pf-num">Variance</th>
                <th>Biggest driver</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map(({ asset, gap }) => (
                <tr key={asset.id}>
                  <td>
                    <Link to={`/asset/${asset.id}`} className="pf-asset-id">{asset.id}</Link>
                    <span className="pf-asset-address">{asset.address} · {asset.market}</span>
                  </td>
                  <td>{shortDate(asset.sale!.soldOn)}</td>
                  <td className="pf-num"><ProvenanceValue info={UW}>{asset.underwrite!.marginPct.toFixed(1)}%</ProvenanceValue></td>
                  <td className="pf-num"><ProvenanceValue info={TAPE}>{asset.sale!.marginPct.toFixed(1)}%</ProvenanceValue></td>
                  <td className={`pf-num ${gap.marginPts < 0 ? 'pf-bad' : 'pf-good'}`}>
                    <ProvenanceValue info={TAPE}>{gap.marginPts > 0 ? '+' : gap.marginPts < 0 ? '−' : ''}{Math.abs(gap.marginPts).toFixed(1)} pts</ProvenanceValue>
                  </td>
                  <td>
                    {gap.driver.label}{' '}
                    <span className={gap.driver.marginImpact < 0 ? 'pf-bad' : 'pf-good'}>
                      <ProvenanceValue info={TAPE}>{signedUsd(gap.driver.marginImpact)}</ProvenanceValue>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pf-card">
        <div className="pf-card-header">
          <h3 className="pf-card-title">Average variance by line</h3>
          <span className="pf-card-caption">Realized minus underwritten, across {sold.length} sold assets</span>
        </div>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Line</th>
                <th className="pf-num">Avg underwritten</th>
                <th className="pf-num">Avg realized</th>
                <th className="pf-num">Avg variance</th>
                <th className="pf-num">Avg variance %</th>
                <th className="pf-num">Hurt margin</th>
              </tr>
            </thead>
            <tbody>
              {byLine.map((l) => {
                const tone = Math.round(l.marginImpact) === 0 ? '' : l.marginImpact < 0 ? 'pf-bad' : 'pf-good';
                return (
                  <tr key={l.key}>
                    <td>{l.label}</td>
                    <td className="pf-num"><ProvenanceValue info={UW}>{usd(l.uw)}</ProvenanceValue></td>
                    <td className="pf-num"><ProvenanceValue info={TAPE}>{usd(l.realized)}</ProvenanceValue></td>
                    <td className={`pf-num ${tone}`}><ProvenanceValue info={TAPE}>{signedUsd(l.variance)}</ProvenanceValue></td>
                    <td className={`pf-num ${tone}`}><ProvenanceValue info={TAPE}>{signedPct(l.variancePct)}</ProvenanceValue></td>
                    <td className="pf-num">
                      {l.hurt} of {sold.length}
                      {isCost(l.key) ? '' : ' sold below ESP'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
