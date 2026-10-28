import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { CapaErrorBanner, CapaPageHeader, capaBtnPrimary, capaBtnSecondary, capaSelectCls } from '../../components/capa/CapaAdminUi';
import { cvReviewService, CvReviewItem, CvReviewStatus } from '../../services/cvReviewService';
import { referenceListsService } from '../../services/referenceListsService';
import { defectLabel } from '../../utils/defectLabel';

const TABS: CvReviewStatus[] = ['pending', 'validated', 'rejected'];

/** Where the quality engineer decides which field photos may train the image model (nothing trains without a validation). */
export default function CvReviewPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<CvReviewStatus>('pending');
  const [items, setItems] = useState<CvReviewItem[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<string[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError('');
    try {
      const rows = await cvReviewService.list(tab, accessToken);
      setItems(rows);
      const urls: Record<string, string> = {};
      await Promise.all(rows.map(async (r) => { try { urls[r.claimId] = await cvReviewService.photo(r.claimId, accessToken); } catch { /* the card shows without the photo */ } }));
      setPhotos((old) => { Object.values(old).forEach((u) => URL.revokeObjectURL(u)); return urls; });
    } catch {
      setError(t('cvReview.loadError'));
    }
  }, [accessToken, tab, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!accessToken) return;
    referenceListsService.get(accessToken)
      .then((r) => setCodes(r.lists['defect-type'].filter((i) => i.isActive && !i.mergedInto).map((i) => i.value)))
      .catch(() => setCodes([]));
  }, [accessToken]);

  const decide = async (row: CvReviewItem, status: 'VALIDATED' | 'REJECTED') => {
    if (!accessToken) return;
    setBusy(row.claimId);
    setError('');
    try {
      await cvReviewService.decide(row.claimId, status, status === 'VALIDATED' ? (choice[row.claimId] || row.operatorDefectType) : undefined, accessToken);
      await load();
    } catch {
      setError(t('cvReview.saveError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl pb-8">
      <CapaPageHeader eyebrow={t('adminNav.settings')} title={t('cvReview.title')} subtitle={t('cvReview.subtitle')} />
      {error && <CapaErrorBanner message={error} />}
      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? capaBtnPrimary : capaBtnSecondary} onClick={() => setTab(s)}>
            {t(`cvReview.tab.${s}`)}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{t(`cvReview.empty.${tab}`)}</p>
      ) : (
        <ul className="grid gap-3 list-none p-0 m-0">
          {items.map((r) => (
            <li key={r.claimId} className="flex flex-wrap gap-4 p-3 rounded-xl border border-slate-200 bg-white">
              {photos[r.claimId]
                ? <img src={photos[r.claimId]} alt="" className="w-40 h-32 object-cover rounded-lg bg-slate-100" />
                : <div className="w-40 h-32 rounded-lg bg-slate-100" />}
              <div className="flex-1 min-w-[220px] text-sm text-slate-700">
                <p className="m-0 font-semibold text-[#000168]">{r.reference || r.title}</p>
                <p className="m-0 mt-1">{t('cvReview.operator')} : <strong>{defectLabel(r.operatorDefectType)}</strong></p>
                <p className="m-0">
                  {t('cvReview.model')} : {r.predictedDefectType ? defectLabel(r.predictedDefectType) : '—'}
                  {r.confidence != null ? ` (${Math.round(r.confidence * 100)} %)` : ''}
                </p>
                {tab === 'validated' && <p className="m-0 mt-1">{t('cvReview.trainsAs')} : <strong>{defectLabel(r.defectType)}</strong></p>}
                {tab === 'pending' && (
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <select className={`${capaSelectCls} max-w-[260px]`} aria-label={t('cvReview.label')} value={choice[r.claimId] ?? r.operatorDefectType}
                      onChange={(e) => setChoice((c) => ({ ...c, [r.claimId]: e.target.value }))}>
                      {Array.from(new Set([r.operatorDefectType, ...codes])).map((c) => <option key={c} value={c}>{defectLabel(c)}</option>)}
                    </select>
                    <button className={capaBtnPrimary} disabled={busy === r.claimId} onClick={() => decide(r, 'VALIDATED')}>{t('cvReview.validate')}</button>
                    <button className={capaBtnSecondary} disabled={busy === r.claimId} onClick={() => decide(r, 'REJECTED')}>{t('cvReview.reject')}</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
