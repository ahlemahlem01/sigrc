import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { dateLocale } from '../../i18n';
import {
  HistoryBatch,
  HistoryCommitResult,
  HistoryPreview,
  historyImportService,
} from '../../services/historyImportService';
import { defectLabel } from '../../utils/defectLabel';

const NAVY = '#000168';

const HistoryImportPage: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [result, setResult] = useState<HistoryCommitResult | null>(null);
  const [batches, setBatches] = useState<HistoryBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!accessToken) return;
    try {
      setBatches(await historyImportService.batches(accessToken));
    } catch {
      setBatches([]);
    }
  }, [accessToken]);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const fail = (e: any) => setError(e?.response?.data?.message || t('historyImport.failed'));

  const download = async () => {
    if (!accessToken) return;
    setError(null);
    try { await historyImportService.downloadTemplate(accessToken); } catch (e) { fail(e); }
  };

  const pick = async (f: File | null) => {
    setPreview(null);
    setResult(null);
    setError(null);
    setFile(f);
    if (!f || !accessToken) return;
    setBusy(true);
    try {
      setPreview(await historyImportService.preview(f, accessToken));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const confirm = async () => {
    if (!file || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await historyImportService.commit(file, accessToken));
      reset();
      await loadBatches();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (b: HistoryBatch) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await historyImportService.setArchived(b.id, !b.isArchived, accessToken);
      await loadBatches();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale()) : '—');

  return (
    <div className="hi-page">
      <style>{`
        .hi-page { font-family: Inter, system-ui, sans-serif; color: #0f172a; max-width: 980px; margin: 0 auto; padding: 8px 4px 40px; }
        .hi-page h1 { margin: 0 0 6px; font-size: 22px; color: ${NAVY}; }
        .hi-lead { margin: 0 0 18px; color: #64748b; font-size: 14px; line-height: 1.5; }
        .hi-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 18px; margin-bottom: 14px; }
        .hi-card h2 { margin: 0 0 4px; font-size: 15px; color: ${NAVY}; display: flex; gap: 8px; align-items: center; }
        .hi-step { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: ${NAVY}; color: #fff; font-size: 12px; align-items: center; justify-content: center; }
        .hi-card p { margin: 0 0 10px; font-size: 13px; color: #64748b; line-height: 1.5; }
        .hi-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 9px; padding: 8px 12px; font-size: 13px; font-weight: 650; cursor: pointer; border: 1px solid #d6dbe6; background: #fff; font-family: inherit; color: #0f172a; }
        .hi-btn.primary { background: ${NAVY}; color: #fff; border-color: ${NAVY}; }
        .hi-btn:disabled { opacity: .55; cursor: not-allowed; }
        .hi-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .hi-stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
        .hi-stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #64748b; }
        .hi-stat b { display: block; font-size: 18px; color: ${NAVY}; }
        .hi-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
        .hi-table th { text-align: left; color: #64748b; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        .hi-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
        .hi-alert { padding: 10px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 12px; }
        .hi-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .hi-alert.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; display: flex; gap: 8px; align-items: center; }
        .hi-alert.warn { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
        .hi-alert ul { margin: 6px 0 0; padding-left: 18px; }
        .hi-muted { color: #94a3b8; }
      `}</style>

      <h1>{t('historyImport.title')}</h1>
      <p className="hi-lead">{t('historyImport.lead')}</p>

      {error && <div className="hi-alert err">{error}</div>}
      {result && (
        <div className="hi-alert ok">
          <CheckCircle2 size={16} />
          {t('historyImport.done', { count: result.imported, causes: result.causes, skipped: result.skippedDuplicates + result.errors.length })}
        </div>
      )}

      <section className="hi-card">
        <h2><span className="hi-step">1</span> {t('historyImport.step1')}</h2>
        <p>{t('historyImport.step1Hint')}</p>
        <button type="button" className="hi-btn" onClick={() => void download()}>
          <Download size={14} /> {t('historyImport.template')}
        </button>
      </section>

      <section className="hi-card">
        <h2><span className="hi-step">2</span> {t('historyImport.step2')}</h2>
        <p>{t('historyImport.step2Hint')}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          hidden
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
        <div className="hi-row">
          <button type="button" className="hi-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {t('historyImport.choose')}
          </button>
          {file && <span className="hi-muted"><FileSpreadsheet size={13} /> {file.name}</span>}
        </div>

        {preview && (
          <>
            <div className="hi-stats">
              <div className="hi-stat"><b>{preview.importable}</b>{t('historyImport.statImportable')}</div>
              <div className="hi-stat"><b>{preview.causes}</b>{t('historyImport.statCauses')}</div>
              <div className="hi-stat"><b>{preview.duplicates.length}</b>{t('historyImport.statDuplicates')}</div>
              <div className="hi-stat"><b>{preview.errors.length}</b>{t('historyImport.statErrors')}</div>
            </div>

            {preview.errors.length > 0 && (
              <div className="hi-alert warn">
                {t('historyImport.errorsTitle')}
                <ul>
                  {preview.errors.slice(0, 20).map((er, i) => (
                    <li key={i}>{er.sheet} · {t('historyImport.line', { line: er.line })} : {er.message}</li>
                  ))}
                  {preview.errors.length > 20 && <li>{t('historyImport.more', { count: preview.errors.length - 20 })}</li>}
                </ul>
              </div>
            )}
            {preview.duplicates.length > 0 && (
              <div className="hi-alert warn">
                {t('historyImport.duplicatesTitle')}
                <ul>
                  {preview.duplicates.slice(0, 10).map((d) => <li key={d.line}>{t('historyImport.line', { line: d.line })} : {d.title}</li>)}
                </ul>
              </div>
            )}

            {preview.sample.length > 0 && (
              <table className="hi-table">
                <thead>
                  <tr>
                    <th>{t('historyImport.colTitle')}</th>
                    <th>{t('historyImport.colDefect')}</th>
                    <th>{t('historyImport.colDetected')}</th>
                    <th>{t('historyImport.colClosed')}</th>
                    <th>{t('historyImport.colLine')}</th>
                    <th>{t('historyImport.colCauses')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((s) => (
                    <tr key={s.line}>
                      <td>{s.title}</td>
                      <td>{defectLabel(s.defectType)}</td>
                      <td>{fmt(s.detectionDate)}</td>
                      <td>{fmt(s.closedDate)}</td>
                      <td>{s.productionLine || '—'}</td>
                      <td>{s.causes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className="hi-card">
        <h2><span className="hi-step">3</span> {t('historyImport.step3')}</h2>
        <p>{t('historyImport.step3Hint')}</p>
        <div className="hi-row">
          <button type="button" className="hi-btn primary" disabled={busy || !preview || preview.importable === 0} onClick={() => void confirm()}>
            <CheckCircle2 size={14} /> {t('historyImport.confirm', { count: preview?.importable ?? 0 })}
          </button>
          {file && <button type="button" className="hi-btn" disabled={busy} onClick={reset}>{t('common.cancel')}</button>}
        </div>
      </section>

      <section className="hi-card">
        <h2>{t('historyImport.batchesTitle')}</h2>
        <p>{t('historyImport.batchesHint')}</p>
        {batches.length === 0 ? (
          <p className="hi-muted">{t('historyImport.noBatches')}</p>
        ) : (
          <table className="hi-table">
            <thead>
              <tr>
                <th>{t('historyImport.colFile')}</th>
                <th>{t('historyImport.colDate')}</th>
                <th>{t('historyImport.colClaims')}</th>
                <th>{t('historyImport.colCauses')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.fileName}</td>
                  <td>{fmt(b.createdAt)}</td>
                  <td>{b.claimCount}</td>
                  <td>{b.causeCount}</td>
                  <td>{b.isArchived ? t('historyImport.archived') : t('historyImport.active')}</td>
                  <td>
                    <button type="button" className="hi-btn" disabled={busy} onClick={() => void toggle(b)}>
                      {b.isArchived ? <><RotateCcw size={13} /> {t('historyImport.restore')}</> : <><Archive size={13} /> {t('historyImport.archive')}</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default HistoryImportPage;
