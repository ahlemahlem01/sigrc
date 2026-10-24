import { useEffect, useState } from 'react';
import { Info, Microscope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { MiningContext, MiningInsights, miningService } from '../../../services/miningService';
import { defectLabel } from '../../../utils/defectLabel';

/** Fetches the insights once; the page shares the result between the panel and the priority-cause card. */
export function useMiningInsights(context: MiningContext | null) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<MiningInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const claimId = context?.claimId;
  const defectType = context?.defectType;
  const productionLine = context?.productionLine;
  const shift = context?.shift;
  const clientId = context?.clientId;
  const enabled = !!context;

  useEffect(() => {
    if (!accessToken || !enabled) return;
    let cancelled = false;
    setLoading(true);
    miningService
      .insights({ claimId, defectType, productionLine, shift, clientId }, accessToken)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ available: false, reason: 'error' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, enabled, claimId, defectType, productionLine, shift, clientId]);

  return { data, loading };
}

interface Props {
  data: MiningInsights | null;
  loading: boolean;
  /** Shortcut: keep a suggested root cause as the priority cause (typing one by hand stays possible). */
  onPick?: (cause: { text: string; category: string }) => void;
}

/** Decision aids mined from the closed-dossier history. They never replace manual entry. */
export default function MiningInsightsPanel({ data, loading, onPick }: Props) {
  const { t } = useTranslation();

  const cat = (c: string) => t(`ishikawa.cat.${c}`, { defaultValue: c });
  const attr = (key: string, value: string) =>
    t(`mining.attr.${key}`, { value: key === 'severity' ? t(`mining.sev.${value}`, { defaultValue: value }) : value });

  const meta = data?.meta;
  const insufficient = !!meta && !meta.rulesSufficient;
  const restricted = !!meta?.restricted;

  return (
    <section className="mi-panel" aria-live="polite">
      <style>{`
        .mi-panel { margin-top: 18px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 18px; }
        .mi-panel h3 { margin: 0 0 2px; font-size: 16px; color: #000168; display: flex; gap: 8px; align-items: center; }
        .mi-sub { margin: 0 0 12px; font-size: 12.5px; color: #64748b; }
        .mi-note { display: flex; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font-size: 13px; margin-bottom: 12px; }
        .mi-block { margin-top: 14px; }
        .mi-block h4 { margin: 0 0 6px; font-size: 13px; color: #334155; }
        .mi-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
        .mi-list li { font-size: 13px; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 10px; line-height: 1.45; }
        .mi-list li.match { border-color: #c7d2fe; background: #eef2ff; }
        .mi-muted { color: #64748b; font-size: 12px; }
        .mi-more { margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        .mi-more summary { cursor: pointer; font-size: 13px; font-weight: 650; color: #334155; }
        .mi-trend { margin: 0 0 6px; font-size: 13px; color: #334155; }
        .mi-bars { display: flex; align-items: flex-end; gap: 3px; height: 44px; margin: 6px 0 8px; }
        .mi-bars span { flex: 1; background: #94a3b8; border-radius: 2px 2px 0 0; min-width: 4px; }
        .mi-pick { margin-left: 4px; border: 1px solid #000168; background: #fff; color: #000168; border-radius: 8px; padding: 2px 8px; font-size: 12px; font-weight: 650; cursor: pointer; font-family: inherit; }
        .mi-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .mi-table th { text-align: left; color: #64748b; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
        .mi-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
      `}</style>

      <h3><Microscope size={16} aria-hidden /> {t('mining.title')}</h3>
      <p className="mi-sub">{t('mining.subtitleSimple')}</p>

      {loading && <p className="mi-muted">{t('mining.loading')}</p>}

      {!loading && data && !data.available && (
        <div className="mi-note"><Info size={16} aria-hidden /> {t('mining.unavailable')}</div>
      )}

      {!loading && data?.available && meta && (
        <>
          {insufficient && (
            <div className="mi-note">
              <Info size={16} aria-hidden />
              <span>{t('mining.thinSimple')}</span>
            </div>
          )}

          {data.rootCauses?.sufficient && data.rootCauses.causes.length > 0 && (
            <div className="mi-block">
              <h4>{t('mining.rootCausesTitle', { count: data.rootCauses.dossiers })}</h4>
              <ul className="mi-list">
                {data.rootCauses.causes.map((c) => (
                  <li key={c.category + c.text}>
                    <strong>{c.text}</strong>{' '}
                    <span className="mi-muted">
                      · {cat(c.category)} · {t('mining.dossiersCount', { count: c.dossiers })}
                      {c.rootDossiers ? ` · ${t('mining.asRoot', { count: c.rootDossiers })}` : ''}
                    </span>
                    {onPick && (
                      <>
                        {' '}
                        <button type="button" className="mi-pick" onClick={() => onPick({ text: c.text, category: c.category })}>
                          {t('priorityCause.keepThis')}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.similar?.available && (!restricted || data.similar.causes.length > 0) && (
            <div className="mi-block">
              <h4>{t('mining.similarTitle', { count: data.similar.count })}</h4>
              {restricted ? (
                <>
                  <p className="mi-muted">{t('mining.similarSummary')}</p>
                  <ul className="mi-list">
                    {data.similar.causes.map((c) => (
                      <li key={c.category + c.text}>
                        <strong>{c.text}</strong> <span className="mi-muted">· {cat(c.category)} · {t('mining.dossiersCount', { count: c.dossiers })}</span>
                        {onPick && (
                          <button type="button" className="mi-pick" onClick={() => onPick({ text: c.text, category: c.category })}>
                            {t('priorityCause.keepThis')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <ul className="mi-list">
                  {data.similar.cases.map((c) => (
                    <li key={c.id}>
                      <strong>{c.title}</strong>{' '}
                      <span className="mi-muted">
                        · {c.line || '—'} · {t('mining.similarity', { pct: Math.round(c.similarity * 100) })}
                      </span>
                      {c.rootCauses.length > 0 && (
                        <div className="mi-muted">
                          {t('mining.rootCause')} :
                          {c.rootCauses.map((rc) => (
                            <span key={rc.text} style={{ marginLeft: 6 }}>
                              {rc.text} ({cat(rc.category ?? '')})
                              {onPick && (
                                <button type="button" className="mi-pick" onClick={() => onPick({ text: rc.text, category: rc.category })}>
                                  {t('priorityCause.keepThis')}
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(data.rules?.length ?? 0) > 0 && (
            <div className="mi-block">
              <h4>{t('mining.rulesTitleSimple')}</h4>
              <ul className="mi-list">
                {data.rules!.slice(0, 3).map((r, i) => (
                  <li key={i} className={r.matchesCurrent ? 'match' : undefined}>
                    {t('mining.ruleSimple', {
                      conditions: r.antecedent.map((a) => attr(a.key, a.value)).join(' + '),
                      defect: defectLabel(r.defect),
                      confidence: Math.round(r.confidence * 100),
                      support: r.support,
                      total: r.antecedentCount,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.trend?.sufficient && data.trend.current?.direction === 'up' && (
            <div className="mi-block">
              <p className="mi-trend"><strong>{t('mining.trendTitle')} :</strong> {t('mining.trendSimpleUp', { defect: defectLabel(data.trend.defect) })}</p>
            </div>
          )}

          <details className="mi-more">
            <summary>{t('mining.moreDetails')}</summary>
          {(data.rules?.length ?? 0) > 0 && (
            <div className="mi-block">
              <h4>{t('mining.rulesTitle')}</h4>
              <ul className="mi-list">
                {data.rules!.map((r, i) => (
                  <li key={i} className={r.matchesCurrent ? 'match' : undefined}>
                    {t('mining.rule', {
                      conditions: r.antecedent.map((a) => attr(a.key, a.value)).join(' + '),
                      defect: defectLabel(r.defect),
                      confidence: Math.round(r.confidence * 100),
                      support: r.support,
                      total: r.antecedentCount,
                      lift: r.lift,
                    })}
                  </li>
                ))}
              </ul>
              <p className="mi-muted">{t('mining.rulesHint')}</p>
            </div>
          )}

          {data.trend?.sufficient && (data.trend.current || data.trend.rising.length > 0) && (
            <div className="mi-block">
              <h4>{t('mining.trendTitle')}</h4>
              {data.trend.current && data.trend.defect && (
                <p className="mi-trend">
                  <strong>{defectLabel(data.trend.defect)}</strong> : {t(`mining.trend.${data.trend.current.direction}`, {
                    recent: data.trend.current.recent,
                    expected: data.trend.current.expected,
                    ratio: data.trend.current.ratio,
                  })}
                </p>
              )}
              {data.trend.monthly.length > 0 && (
                <div className="mi-bars" role="img" aria-label={t('mining.trendBarsLabel')}>
                  {data.trend.monthly.map((m) => {
                    const max = Math.max(1, ...data.trend!.monthly.map((x) => x.count));
                    return <span key={m.month} title={`${m.month} : ${m.count}`} style={{ height: `${Math.max(4, (m.count / max) * 100)}%` }} />;
                  })}
                </div>
              )}
              {data.trend.rising.length > 0 && (
                <>
                  <p className="mi-muted">{t('mining.risingTitle')}</p>
                  <ul className="mi-list">
                    {data.trend.rising.map((r) => (
                      <li key={r.defect}>
                        <strong>{defectLabel(r.defect)}</strong> <span className="mi-muted">· {t('mining.trend.up', { recent: r.recent, expected: r.expected, ratio: r.ratio })}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mi-muted">{t('mining.trendHint')}</p>
            </div>
          )}

          {data.repeatedLots && (data.repeatedLots.count > 0 || data.repeatedLots.currentLotDossiers > 0) && (
            <div className="mi-block">
              <h4>{t('mining.lotsTitle')}</h4>
              {data.repeatedLots.currentLotDossiers > 0 && (
                <p className="mi-trend">{t('mining.currentLot', { count: data.repeatedLots.currentLotDossiers })}</p>
              )}
              {restricted ? (
                data.repeatedLots.count > 0 && <p className="mi-muted">{t('mining.lotsAggregate', { count: data.repeatedLots.count })}</p>
              ) : (
                <ul className="mi-list">
                  {data.repeatedLots.lots.map((l) => (
                    <li key={l.lot}>
                      <strong>{l.lot}</strong> <span className="mi-muted">· {t('mining.dossiersCount', { count: l.dossiers })} · {l.defects.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(data.weightedPareto?.defectType.length ?? 0) > 0 && (
            <div className="mi-block">
              <h4>{t('mining.impactTitle')}</h4>
              <table className="mi-table">
                <thead>
                  <tr>
                    <th>{t('mining.colDefect')}</th>
                    <th>{t('mining.colCount')}</th>
                    <th>{t('mining.colImpact')}</th>
                    <th>{t('mining.colPpm')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weightedPareto!.defectType.slice(0, 6).map((r) => (
                    <tr key={r.category}>
                      <td>{defectLabel(r.category)}</td>
                      <td>{r.count}</td>
                      <td>{r.sharePct} %</td>
                      <td>{r.ppm ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mi-muted">{t('mining.impactHint')}</p>
            </div>
          )}
          </details>
        </>
      )}
    </section>
  );
}
