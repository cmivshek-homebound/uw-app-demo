import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import AssetLink from '../components/AssetLink';
import ProvenanceValue from '../components/ProvenanceValue';
import { DEMO_TODAY, demoNow } from '../data/dates';
import { decider } from '../data/intake';
import { DECISION_LABELS, useListingActions } from '../data/listingActions';
import type { ReviewDecision, ReviewDecisionKind } from '../data/listingActions';
import { DIAGNOSIS_LABELS, DIAGNOSIS_URGENCY, listingHealth } from '../data/listingHealth';
import type { ListingDiagnosis, ListingHealth } from '../data/listingHealth';
import { AI, MLS, computed, human, markProvenance } from '../data/provenance';
import { ROLE_LABELS, useCanAct, useRole } from '../data/role';
import { SELLING_COST_PCT } from '../data/underwriting';
import { useSessionAssets } from '../data/useSessionAssets';
import type { Asset, ProvenanceInfo } from '../types';
import './ForSaleWeeklyReview.css';

// ── Weekly pricing review ──────────────────────────────────────
// One sheet per listing, worked top to bottom like the weekly pricing
// meeting: agenda on the left (most urgent first), the listing's numbers,
// history, demand and offers on the right, then one logged decision.

const NORM: ProvenanceInfo = { provenance: 'system', note: 'Market norm' };
const LEADS: ProvenanceInfo = { provenance: 'system', source: 'MLS', note: 'Agent and buyer inquiries' };
const DAY_MS = 86_400_000;

type Severity = 'red' | 'amber' | 'gray';
const SEVERITY: Record<ListingDiagnosis, Severity> = {
  stale: 'red',
  showings_no_offers: 'amber',
  low_traffic: 'amber',
  behind_pace: 'amber',
  offer_in_hand: 'amber',
  healthy: 'gray',
};

function usd(n: number) {
  return `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function signedUsd(n: number) {
  if (Math.round(n) === 0) return '$0';
  return `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function usdK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/0$/, '')}M`;
  return `$${Math.round(n / 1000)}K`;
}

function signedPct(n: number) {
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(1)}%`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function roundTo5K(n: number) {
  return Math.round(n / 5_000) * 5_000;
}

interface Item {
  asset: Asset;
  health: ListingHealth;
  flags: string[];
  severity: Severity;
}

/** Showings in full weeks: the last two, and the two before when the listing is old enough to have them. */
function showingTrend(asset: Asset): { recent: number; prior?: number } | undefined {
  const full = (asset.listing!.weeklyHistory ?? []).filter((w) => w.days === 7);
  if (full.length < 2) return undefined;
  const sum = (ws: typeof full) => ws.reduce((s, w) => s + w.showings, 0);
  return { recent: sum(full.slice(-2)), prior: full.length >= 4 ? sum(full.slice(-4, -2)) : undefined };
}

/** Showings in weeks that started within the last 14 days. */
function showingsLast14(asset: Asset): number | undefined {
  const weeks = asset.listing!.weeklyHistory;
  if (!weeks || asset.listing!.daysOnMarket < 14) return undefined;
  const cutoff = new Date(DEMO_TODAY).getTime() - 14 * DAY_MS;
  return weeks.filter((w) => new Date(w.weekStart).getTime() >= cutoff).reduce((s, w) => s + w.showings, 0);
}

function flagsFor(asset: Asset, h: ListingHealth): string[] {
  const flags: string[] = [];
  if (h.recommendation.kind === 'drop' && h.recommendation.markdown) flags.push('Requires mark-down');
  if (h.diagnosis === 'stale') flags.push('Stale');
  if (h.activeOffer && h.activeOffer.amount < h.currentMark) flags.push('Offer below mark');
  if (h.activeOffer && h.activeOffer.amount >= h.currentMark) flags.push('Offer above mark');
  if (showingsLast14(asset) === 0) flags.push('No showings 14d');
  if (h.diagnosis === 'low_traffic') flags.push('Low traffic');
  if (h.diagnosis === 'showings_no_offers') flags.push('No offers');
  if (h.diagnosis === 'behind_pace') flags.push('Behind pace');
  return flags.slice(0, 2);
}

// ── Small charts ───────────────────────────────────────────────
/** List price over time as a step line, from listing to today. */
function PriceStepChart({ asset }: { asset: Asset }) {
  const l = asset.listing!;
  const drops = l.priceDropHistory ?? [];
  const start = drops[0]?.from ?? l.listPrice;
  const points = [{ t: l.listedOn, p: start }, ...drops.map((d) => ({ t: d.date, p: d.to }))];
  const W = 300;
  const H = 72;
  const pad = 6;
  const t0 = new Date(l.listedOn).getTime();
  const t1 = Math.max(new Date(DEMO_TODAY).getTime(), t0 + DAY_MS);
  const prices = points.map((p) => p.p);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 0.04;
  const x = (iso: string) => pad + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - pad * 2);
  const y = (p: number) => H - pad - ((p - (lo - span * 0.15)) / (span * 1.3)) * (H - pad * 2);
  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].p).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].p).toFixed(1)}`;
  }
  d += ` H${(W - pad).toFixed(1)}`;
  return (
    <svg className="wr-step" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`List price from ${usd(start)} at listing to ${usd(l.listPrice)} today`}>
      <path d={d} className="wr-step-line" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.p)} r={2.6} className="wr-step-dot">
          <title>{`${shortDate(p.t)}: ${usd(p.p)}`}</title>
        </circle>
      ))}
      <text x={pad} y={H - 1} className="wr-axis">{shortDate(l.listedOn)}</text>
      <text x={W - pad} y={H - 1} textAnchor="end" className="wr-axis">Today</text>
    </svg>
  );
}

function WeeklyBars({ label, values, partialLast, info }: { label: string; values: number[]; partialLast: boolean; info: ProvenanceInfo }) {
  const max = Math.max(...values, 1);
  return (
    <div className="wr-bars">
      <span className="wr-bars-label">{label}</span>
      <div className="wr-bars-row" role="img" aria-label={`${label}: ${values.join(', ')}`}>
        {values.map((v, i) => (
          <span
            key={i}
            className={`wr-bar ${partialLast && i === values.length - 1 ? 'wr-bar--partial' : ''}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`Week ${i + 1}: ${v}${partialLast && i === values.length - 1 ? ' (partial week)' : ''}`}
          />
        ))}
      </div>
      <span className="wr-bars-foot">
        Latest <ProvenanceValue info={info}>{values.at(-1) ?? 0}</ProvenanceValue> · peak {max}
      </span>
    </div>
  );
}

function Section({ title, summary, defaultOpen, children }: { title: string; summary: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="wr-section" open={defaultOpen}>
      <summary className="wr-section-head">
        <span className="wr-section-title">{title}</span>
        <span className="wr-section-summary">{summary}</span>
      </summary>
      <div className="wr-section-body">{children}</div>
    </details>
  );
}

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="wr-tile">
      <span className="wr-tile-label">{label}</span>
      <span className="wr-tile-value">{children}</span>
      {sub && <span className="wr-tile-sub">{sub}</span>}
    </div>
  );
}

// ── Decision box ───────────────────────────────────────────────
function DecisionBox({ item, onLogged }: { item: Item; onLogged: () => void }) {
  const { asset, health } = item;
  const l = asset.listing!;
  const rec = health.recommendation;
  const offer = health.activeOffer;
  const { actions, logDecision } = useListingActions();
  const { role, analyst } = useRole();
  const canAct = useCanAct();
  const [kind, setKind] = useState<ReviewDecisionKind | null>(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const log = actions[asset.id]?.decisions ?? [];

  // Prefill with the AI recommendation where there is one.
  const suggested = (k: ReviewDecisionKind): number | undefined => {
    if (k === 'drop') return rec.kind === 'drop' ? rec.newPrice : roundTo5K(l.listPrice * 0.97);
    if (k === 'counter') return rec.kind === 'counter' ? rec.price : offer ? roundTo5K((offer.amount + l.listPrice) / 2) : l.listPrice;
    if (k === 'accept') return offer?.amount;
    return undefined;
  };
  const pick = (k: ReviewDecisionKind) => {
    setKind(k);
    const s = suggested(k);
    setPrice(s !== undefined ? String(s) : '');
  };

  const needsPrice = kind === 'drop' || kind === 'counter';
  const priceNum = Number(price.replace(/[^0-9.]/g, ''));
  const valid = kind !== null && (!needsPrice || priceNum > 0) && (kind !== 'accept' || !!offer);

  const submit = () => {
    if (!valid || !kind) return;
    const d: ReviewDecision = {
      kind,
      price: kind === 'hold' ? undefined : kind === 'accept' ? offer!.amount : priceNum,
      note: note.trim(),
      at: demoNow(),
      by: decider(role, analyst),
      role,
    };
    logDecision(asset, d);
    setKind(null);
    setPrice('');
    setNote('');
    onLogged();
  };

  return (
    <section className="wr-decision">
      <div className="wr-decision-head">
        <h3 className="wr-decision-title">Decision &amp; notes</h3>
        <span className="wr-rec">AI recommends: <ProvenanceValue info={AI}>{rec.text}</ProvenanceValue></span>
      </div>

      {canAct ? (
        <form
          className="wr-decision-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="wr-pills" role="radiogroup" aria-label="Decision">
            {(Object.keys(DECISION_LABELS) as ReviewDecisionKind[]).map((k) => {
              const disabled = (k === 'accept' || k === 'counter') && !offer;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  disabled={disabled}
                  title={disabled ? 'No active offer' : undefined}
                  className={`wr-pill ${kind === k ? 'wr-pill--on' : ''}`}
                  onClick={() => pick(k)}
                >
                  {DECISION_LABELS[k]}
                </button>
              );
            })}
          </div>

          {needsPrice && (
            <label className="wr-price">
              <span>{kind === 'drop' ? 'New list price' : 'Counter at'}</span>
              <input
                className="pf-approval-input wr-price-input"
                inputMode="numeric"
                value={price ? `$${Number(price.replace(/[^0-9]/g, '')).toLocaleString('en-US')}` : ''}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label={kind === 'drop' ? 'New list price' : 'Counter price'}
              />
              <span className="wr-price-hint">
                {kind === 'drop'
                  ? <>{signedUsd(priceNum - l.listPrice)} vs list · {signedUsd(priceNum - health.currentMark)} vs mark</>
                  : offer && <>{signedUsd(priceNum - offer.amount)} vs offer</>}
              </span>
            </label>
          )}
          {kind === 'accept' && offer && (
            <p className="wr-price-hint">Accepts the {offer.financing.toLowerCase()} offer at {usd(offer.amount)} ({((offer.amount / l.listPrice) * 100).toFixed(1)}% of list).</p>
          )}

          <textarea
            className="wr-note"
            rows={2}
            placeholder="Note for the log (why this call)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Decision note"
          />
          <div className="wr-decision-actions">
            <span className="wr-muted">Logged as {decider(role, analyst)} · {ROLE_LABELS[role]} view</span>
            <button type="submit" className="pf-btn pf-btn--primary" disabled={!valid}>Log decision</button>
          </div>
        </form>
      ) : (
        <p className="wr-muted">Executive view: decisions are read-only.</p>
      )}

      {log.length > 0 && (
        <ul className="wr-log">
          {[...log].reverse().map((d, i) => (
            <li key={`${d.at}-${i}`} className="wr-log-item">
              <span className="wr-log-check" aria-hidden="true">✓</span>
              <span>
                <strong>{DECISION_LABELS[d.kind]}</strong>
                {d.price !== undefined && <> at <ProvenanceValue info={human(`Logged by ${d.by}`)}>{usd(d.price)}</ProvenanceValue></>}
                {d.note && <span className="wr-log-note"> · {d.note}</span>}
              </span>
              <span className="wr-muted wr-log-meta">
                {shortDate(d.at)} · {d.by} ({ROLE_LABELS[d.role]})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Sheet ──────────────────────────────────────────────────────
function Sheet({ item, index, total, onPrev, onNext, onLogged }: {
  item: Item; index: number; total: number; onPrev: () => void; onNext: () => void; onLogged: () => void;
}) {
  const { asset, health } = item;
  const l = asset.listing!;
  const uw = asset.underwrite;
  const mark = asset.marks?.at(-1);
  const markValue = health.currentMark;
  const listVsMark = l.listPrice - markValue;
  const netAtList = l.listPrice * (1 - SELLING_COST_PCT / 100);
  const uwNet = uw ? uw.esp * (1 - SELLING_COST_PCT / 100) : undefined;
  const trend = showingTrend(asset);
  const weeks = l.weeklyHistory ?? [];
  const partial = (weeks.at(-1)?.days ?? 7) < 7;
  const drops = l.priceDropHistory ?? [];
  const offers = l.offers ?? [];
  const start = drops[0]?.from ?? l.listPrice;
  const views = weeks.reduce((s, w) => s + w.views, 0);
  const saves = weeks.reduce((s, w) => s + w.saves, 0);

  return (
    <article className="wr-sheet" aria-label={`${asset.address} review sheet`}>
      <header className="wr-sheet-head">
        <div>
          <h2 className="wr-sheet-title"><AssetLink id={asset.id}>{asset.address}</AssetLink></h2>
          <p className="wr-sheet-meta">
            {uw?.planName} · {asset.market} · <span className={`fs-diag fs-diag--${health.diagnosis}`}><ProvenanceValue info={AI}>{DIAGNOSIS_LABELS[health.diagnosis]}</ProvenanceValue></span>
          </p>
        </div>
        <div className="wr-nav">
          <span className="wr-muted">{index + 1} of {total}</span>
          <button className="pf-btn pf-btn--small" onClick={onPrev} disabled={index === 0}>← Prev</button>
          <button className="pf-btn pf-btn--small" onClick={onNext} disabled={index === total - 1}>Next →</button>
        </div>
      </header>

      <div className="wr-tiles">
        <Tile label="List price" sub={drops.length ? <>from <ProvenanceValue info={MLS}>{usdK(start)}</ProvenanceValue></> : 'No drops'}>
          <ProvenanceValue info={MLS}>{usd(l.listPrice)}</ProvenanceValue>
        </Tile>
        <Tile
          label="Current mark"
          sub={<span className={listVsMark < 0 ? 'wr-bad' : ''}>List vs mark <ProvenanceValue info={computed('List price minus current mark')}>{signedUsd(listVsMark)} ({signedPct((listVsMark / markValue) * 100)})</ProvenanceValue></span>}
        >
          <ProvenanceValue info={markProvenance(mark)}>{usd(markValue)}</ProvenanceValue>
        </Tile>
        <Tile
          label="Net at list"
          sub={uwNet !== undefined && (
            <span className={netAtList < uwNet ? 'wr-bad' : 'wr-good'}>
              vs <ProvenanceValue info={human('Reviewed underwrite')}>{usdK(uwNet)}</ProvenanceValue> underwritten ({signedUsd(netAtList - uwNet)})
            </span>
          )}
        >
          <ProvenanceValue info={computed(`List price less ${SELLING_COST_PCT}% selling costs`)}>{usd(netAtList)}</ProvenanceValue>
        </Tile>
        <Tile
          label="Days on market"
          sub={<span className={health.domRatio > 1.5 ? 'wr-bad' : ''}>vs <ProvenanceValue info={NORM}>{health.norm.typicalDaysOnMarket}</ProvenanceValue> norm ({health.domRatio.toFixed(1)}×)</span>}
        >
          <ProvenanceValue info={MLS}>{l.daysOnMarket}</ProvenanceValue>
        </Tile>
        <Tile
          label="Showings, last 2 wks"
          sub={trend?.prior !== undefined
            ? <span className={trend.recent < trend.prior ? 'wr-bad' : trend.recent > trend.prior ? 'wr-good' : ''}>vs <ProvenanceValue info={MLS}>{trend.prior}</ProvenanceValue> prior 2 wks</span>
            : 'Too new to compare'}
        >
          {trend ? <ProvenanceValue info={MLS}>{trend.recent}</ProvenanceValue> : '—'}
        </Tile>
      </div>

      <Section
        title="Pricing history"
        defaultOpen
        summary={drops.length
          ? <>Listed at {usdK(start)} · {drops.length} {drops.length === 1 ? 'drop' : 'drops'} · now {usdK(l.listPrice)} ({signedPct((l.listPrice / start - 1) * 100)})</>
          : <>Listed at {usdK(l.listPrice)} on {shortDate(l.listedOn)} · no drops</>}
      >
        <div className="wr-pricing">
          <PriceStepChart asset={asset} />
          {drops.length === 0 ? (
            <p className="wr-muted">No price changes since listing.</p>
          ) : (
            <ul className="wr-drops">
              {drops.map((d) => (
                <li key={d.date}>
                  <span>{shortDate(d.date)}</span>
                  <span><ProvenanceValue info={MLS}>{usd(d.from)}</ProvenanceValue> → <ProvenanceValue info={d.loggedBy ? human(`Accepted by ${d.loggedBy}`) : MLS}>{usd(d.to)}</ProvenanceValue></span>
                  <span className="wr-bad">−{usdK(d.from - d.to)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="Demand"
        summary={<>{l.showings} showings · {views.toLocaleString('en-US')} views · {saves} saves · {l.leads ?? 0} leads · {health.showingsPerWeek.toFixed(1)}/wk vs {health.norm.showingsPerWeek} norm</>}
      >
        {weeks.length === 0 ? <p className="wr-muted">No weekly history yet.</p> : (
          <div className="wr-demand">
            <WeeklyBars label="Showings / week" values={weeks.map((w) => w.showings)} partialLast={partial} info={MLS} />
            <WeeklyBars label="Online views / week" values={weeks.map((w) => w.views)} partialLast={partial} info={MLS} />
            <dl className="wr-demand-stats">
              <dt>Leads</dt><dd><ProvenanceValue info={LEADS}>{l.leads ?? 0}</ProvenanceValue></dd>
              <dt>Saves</dt><dd><ProvenanceValue info={MLS}>{saves}</ProvenanceValue></dd>
              <dt>Showings</dt><dd><ProvenanceValue info={MLS}>{l.showings}</ProvenanceValue></dd>
            </dl>
          </div>
        )}
        {partial && <p className="wr-muted wr-small">Lighter bar: the current, partial week.</p>}
      </Section>

      <Section
        title="Offers"
        summary={offers.length === 0
          ? 'No offers yet'
          : <>{offers.length} {offers.length === 1 ? 'offer' : 'offers'}{health.activeOffer && <> · active {usdK(health.activeOffer.amount)} ({((health.activeOffer.amount / l.listPrice) * 100).toFixed(1)}% of list)</>}</>}
      >
        {offers.length === 0 ? <p className="wr-muted">No offers in {l.daysOnMarket} days.</p> : (
          <ul className="wr-offers">
            {[...offers].reverse().map((o) => (
              <li key={o.date} className="wr-offer">
                <div className="wr-offer-top">
                  <span className="wr-offer-amount"><ProvenanceValue info={MLS}>{usd(o.amount)}</ProvenanceValue></span>
                  <span className="wr-muted">{((o.amount / l.listPrice) * 100).toFixed(1)}% of list</span>
                  <span className={`fs-offer fs-offer--${o.status}`}>{o.status}</span>
                  <span className="wr-muted wr-offer-date">{shortDate(o.date)} · {o.financing}</span>
                </div>
                <div className="wr-offer-sub">
                  Concessions: {o.concessions ? <ProvenanceValue info={MLS}>{usd(o.concessions)}</ProvenanceValue> : 'none'}
                  {o.concessionNote && ` (${o.concessionNote.toLowerCase()})`}
                </div>
                {o.agentNote && <p className="wr-offer-note">“{o.agentNote}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <DecisionBox key={asset.id} item={item} onLogged={onLogged} />
    </article>
  );
}

// ── View ───────────────────────────────────────────────────────
export default function ForSaleWeeklyReview() {
  const assets = useSessionAssets();
  const { actions } = useListingActions();
  const items: Item[] = assets
    .filter((a) => a.stage === 'for_sale' && a.listing)
    .map((asset) => {
      const health = listingHealth(asset);
      return { asset, health, flags: flagsFor(asset, health), severity: SEVERITY[health.diagnosis] };
    })
    .sort((a, b) =>
      DIAGNOSIS_URGENCY.indexOf(a.health.diagnosis) - DIAGNOSIS_URGENCY.indexOf(b.health.diagnosis) ||
      b.health.domRatio - a.health.domRatio,
    );

  const reviewed = (id: string) => (actions[id]?.decisions?.length ?? 0) > 0;
  const reviewedCount = items.filter((i) => reviewed(i.asset.id)).length;
  const [selectedId, setSelectedId] = useState<string | undefined>(() => items.find((i) => !reviewed(i.asset.id))?.asset.id ?? items[0]?.asset.id);
  const index = Math.max(0, items.findIndex((i) => i.asset.id === selectedId));
  const go = (i: number) => setSelectedId(items[Math.min(items.length - 1, Math.max(0, i))]?.asset.id);

  // Up/down arrows move through the agenda (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      setSelectedId((cur) => {
        const i = items.findIndex((it) => it.asset.id === cur);
        const next = Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
        return items[next]?.asset.id;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items]);

  if (items.length === 0) return <p className="oq-empty">No listings to review.</p>;
  const item = items[index];

  return (
    <div className="wr">
      <aside className="wr-agenda" aria-label="Agenda">
        <div className="wr-agenda-head">
          <span className="wr-agenda-title">Agenda</span>
          <span className="wr-agenda-count">{reviewedCount} of {items.length} reviewed</span>
        </div>
        <div className="wr-progress" aria-hidden="true"><span style={{ width: `${(reviewedCount / items.length) * 100}%` }} /></div>
        <ol className="wr-agenda-list">
          {items.map((it, i) => (
            <li key={it.asset.id}>
              <button
                className={`wr-agenda-item ${i === index ? 'wr-agenda-item--on' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
              >
                <span className={`wr-sev wr-sev--${it.severity}`} aria-hidden="true" />
                <span className="wr-agenda-body">
                  <span className="wr-agenda-addr">
                    {it.asset.address}
                    {reviewed(it.asset.id) && <span className="wr-check" aria-label="Decision logged">✓</span>}
                  </span>
                  <span className="wr-agenda-meta">{it.asset.market} · <ProvenanceValue info={MLS}>{it.asset.listing!.daysOnMarket}</ProvenanceValue> days</span>
                  {it.flags.length > 0 && (
                    <span className="wr-flags">
                      {it.flags.map((f) => <span key={f} className={`wr-flag wr-flag--${it.severity}`}>{f}</span>)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="wr-agenda-hint">↑ ↓ to move through the agenda</p>
      </aside>

      <Sheet
        item={item}
        index={index}
        total={items.length}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        onLogged={() => go(index + 1)}
      />
    </div>
  );
}
