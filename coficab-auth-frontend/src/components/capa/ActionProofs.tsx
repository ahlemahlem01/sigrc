import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadPlanActionProof, getPlanActionDocuments, PlanActionProof } from '../../services/actionPlanService';
import { dateLocale } from '../../i18n';

const isImage = (p: PlanActionProof) => /^image\//.test(p.fileType) || /\.(png|jpe?g|gif|webp)$/i.test(p.fileName);

/** The proofs attached to one action: who added each one and when, a preview for the images, and a download. `refreshKey` reloads the list after an upload. */
export default function ActionProofs({ token, planActionId, count, refreshKey = 0 }: { token: string; planActionId: string; count: number; refreshKey?: string | number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [proofs, setProofs] = useState<PlanActionProof[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setError(false);
    getPlanActionDocuments(token, planActionId)
      .then(async (res) => {
        if (!live) return;
        setProofs(res.data);
        const urls: Record<string, string> = {};
        await Promise.all(res.data.filter(isImage).map(async (p) => {
          try { urls[p.id] = URL.createObjectURL(await downloadPlanActionProof(token, p.id)); } catch { /* no preview */ }
        }));
        if (live) setPreviews((old) => { Object.values(old).forEach((u) => URL.revokeObjectURL(u)); return urls; });
      })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [open, token, planActionId, count, refreshKey]);

  const save = async (p: PlanActionProof) => {
    const url = URL.createObjectURL(await downloadPlanActionProof(token, p.id));
    const a = document.createElement('a');
    a.href = url; a.download = p.fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (count <= 0) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: '#000168', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {t('proofs.toggle', { count })} {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="m-0 mt-2 p-0 list-none grid gap-2">
          {error && <li className="text-xs text-red-600">{t('proofs.loadError')}</li>}
          {proofs.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              {previews[p.id]
                ? <img src={previews[p.id]} alt="" className="w-14 h-14 object-cover rounded-md bg-slate-100" />
                : <div className="w-14 h-14 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">{(p.fileName.split('.').pop() || '').toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate" title={p.fileName}>{p.fileName}</div>
                <div className="text-[11px] text-slate-500">
                  {t('proofs.by', { name: p.uploadedByName || t('proofs.unknown') })} · {new Date(p.createdAt).toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button type="button" onClick={() => void save(p)} className="text-xs font-semibold rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50">{t('proofs.download')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
