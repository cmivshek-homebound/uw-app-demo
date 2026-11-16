import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import ProvenanceValue, { ProvenanceLegend } from '../components/ProvenanceValue';
import { INTEGRATIONS, SCREENS } from '../data/integrations';
import './IntegrationsPage.css';

// ── Data sources & integrations ────────────────────────────────
// Renders the registry in data/integrations.ts: each source, the fields it
// feeds, and the screens that show them.

export default function IntegrationsPage() {
  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Data sources</h1>
          <p className="oq-subtitle">
            Where every number in the app comes from. Values carry the matching marker; hover one for its source.
          </p>
        </div>
      </div>

      <ProvenanceLegend />

      <div className="ig-table-wrap">
        <table className="ig-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Field</th>
              <th>Screens</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map((source) => (
              <Fragment key={source.id}>
                {source.fields.map((f, i) => (
                  <tr key={f.field} className={i === 0 ? 'ig-row--first' : undefined}>
                    {i === 0 && (
                      <td rowSpan={source.fields.length} className="ig-source">
                        <span className="ig-source-name">
                          {source.marker ? <ProvenanceValue info={source.marker}>{source.name}</ProvenanceValue> : source.name}
                        </span>
                        <span className="ig-source-kind">{source.kind}</span>
                        <p className="ig-source-desc">{source.description}</p>
                      </td>
                    )}
                    <td className="ig-field">{f.field}</td>
                    <td>
                      <ul className="ig-screens">
                        {f.screens.map((id) => (
                          <li key={id}>
                            <Link to={SCREENS[id].example} className="ig-screen">{SCREENS[id].label}</Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ig-foot">
        Two other markers appear alongside these. <strong>Analyst</strong> values (checkmark) are reviewed underwrites,
        approved marks, overrides with their reason, scenario inputs and underwriting assumptions.{' '}
        <strong>Computed</strong> values carry no visible tag: they're calculated in the app from the sources
        above, such as portfolio rollups, day counts and scenario outputs, and hovering one says how. Listing pace norms
        on For sale are placeholder benchmarks, tagged “Market norm”.
      </p>
    </div>
  );
}
