import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eightDHistoryService, type EightDReportModel, type EightDReportVersionRow } from '../../services/eightDHistoryService';
import { dateLocale } from '../../i18n';

type Props = {
  claimId: string;
  token: string;
  onClose: () => void;
  /** the PDF has been rebuilt from the edited report */
  onSaved: () => void;
};

const field: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, color: '#64748b', margin: '8px 0 3px' };
const section: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#1e2a5a', margin: '18px 0 4px', paddingTop: 12, borderTop: '1px solid #e2e8f0' };
const rowBox: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginBottom: 8, background: '#f8fafc' };
const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' };

/**
 * Edits the customer 8D report: every text and figure of the PDF. Saving creates a new version (the earlier ones stay readable) and
 * rebuilds the PDF from the edited report. "Reload from the data" starts again from what the claim holds today.
 */
export default function EightDReportEditor({ claimId, token, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [model, setModel] = useState<EightDReportModel | null>(null);
  const [version, setVersion] = useState(0);
  const [versions, setVersions] = useState<EightDReportVersionRow[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [report, history] = await Promise.all([eightDHistoryService.report(claimId, token), eightDHistoryService.reportVersions(claimId, token)]);
      setModel(report.model);
      setVersion(report.version);
      setVersions(history);
    } catch {
      setNotice({ ok: false, text: t('eightDReport.loadFailed') });
    } finally {
      setBusy(false);
    }
  }, [claimId, token, t]);

  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<EightDReportModel>) => setModel((m) => (m ? { ...m, ...patch } : m));

  const save = async () => {
    if (!model) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await eightDHistoryService.saveReport(claimId, model, note.trim() || null, token);
      setNote('');
      setNotice({ ok: true, text: t('eightDReport.saved', { n: saved.version }) });
      onSaved();
      await load();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.message || t('eightDReport.saveFailed') });
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    try {
      setModel(await eightDHistoryService.freshReport(claimId, token));
      setNotice({ ok: true, text: t('eightDReport.reloaded') });
    } catch {
      setNotice({ ok: false, text: t('eightDReport.loadFailed') });
    } finally {
      setBusy(false);
    }
  };

  const takeVersion = async (n: number) => {
    setBusy(true);
    try {
      const v = await eightDHistoryService.reportVersion(claimId, n, token);
      setModel(v.model);
      setNotice({ ok: true, text: t('eightDReport.viewing', { n }) });
    } catch {
      setNotice({ ok: false, text: t('eightDReport.loadFailed') });
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof EightDReportModel, name: string, area = false) => (
    <>
      <span style={label}>{name}</span>
      {area
        ? <textarea rows={3} style={field} value={String(model?.[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<EightDReportModel>)} />
        : <input style={field} value={String(model?.[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<EightDReportModel>)} />}
    </>
  );

  const removeBtn = (onClick: () => void) => (
    <button type="button" style={{ ...smallBtn, color: '#b91c1c' }} onClick={onClick} aria-label={t('eightDReport.removeRow')} title={t('eightDReport.removeRow')}>×</button>
  );

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 920, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t('eightDReport.title')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{t('eightDReport.hint')}</p>
        </div>

        <div style={{ padding: '4px 20px 16px', overflowY: 'auto', flex: 1 }}>
          {!model ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>{busy ? '…' : t('eightDReport.loadFailed')}</p>
          ) : (
            <>
              <div style={section}>{t('eightDReport.header')}</div>
              {text('company', t('eightDReport.company'))}
              {text('title', t('eightDReport.reportTitle'))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>{text('reference', t('eightDReport.reference'))}</div>
                <div>{text('date', t('eightDReport.date'))}</div>
              </div>
              {text('intro', t('eightDReport.intro'), true)}

              <div style={section}>{t('eightDReport.ishikawa')}</div>
              {text('ishikawaHeading', t('eightDReport.heading'))}
              {model.ishikawa.map((row, i) => (
                <div key={i} style={{ ...rowBox, display: 'grid', gridTemplateColumns: '1fr 2fr 80px auto', gap: 8, alignItems: 'end' }}>
                  <div><span style={label}>{t('eightDReport.category')}</span><input style={field} value={row.category} onChange={(e) => set({ ishikawa: model.ishikawa.map((r, k) => (k === i ? { ...r, category: e.target.value } : r)) })} /></div>
                  <div><span style={label}>{t('eightDReport.description')}</span><input style={field} value={row.description} onChange={(e) => set({ ishikawa: model.ishikawa.map((r, k) => (k === i ? { ...r, description: e.target.value } : r)) })} /></div>
                  <div><span style={label}>{t('eightDReport.major')}</span><input style={field} value={row.major} onChange={(e) => set({ ishikawa: model.ishikawa.map((r, k) => (k === i ? { ...r, major: e.target.value } : r)) })} /></div>
                  {removeBtn(() => set({ ishikawa: model.ishikawa.filter((_, k) => k !== i) }))}
                </div>
              ))}
              <button type="button" style={smallBtn} onClick={() => set({ ishikawa: [...model.ishikawa, { category: '', description: '', major: 'Non' }] })}>+ {t('eightDReport.addRow')}</button>

              <div style={section}>{t('eightDReport.priority')}</div>
              {text('priorityHeading', t('eightDReport.heading'))}
              {model.priority ? (
                <div style={rowBox}>
                  <span style={label}>{t('eightDReport.priorityText')}</span>
                  <textarea rows={2} style={field} value={model.priority.text} onChange={(e) => set({ priority: { ...model.priority!, text: e.target.value } })} />
                  <span style={label}>{t('eightDReport.priorityMeta')}</span>
                  <input style={field} value={model.priority.meta} onChange={(e) => set({ priority: { ...model.priority!, meta: e.target.value } })} />
                  <div style={{ marginTop: 6 }}><button type="button" style={{ ...smallBtn, color: '#b91c1c' }} onClick={() => set({ priority: null })}>{t('eightDReport.removeBlock')}</button></div>
                </div>
              ) : (
                <button type="button" style={smallBtn} onClick={() => set({ priority: { text: '', meta: '' } })}>+ {t('eightDReport.addBlock')}</button>
              )}

              <div style={section}>{t('eightDReport.fiveWhy')}</div>
              {text('fiveWhyHeading', t('eightDReport.heading'))}
              {model.fiveWhy ? (
                <>
                  <span style={label}>{t('eightDReport.problem')}</span>
                  <textarea rows={2} style={field} value={model.fiveWhy.problem} onChange={(e) => set({ fiveWhy: { ...model.fiveWhy!, problem: e.target.value } })} />
                  <span style={label}>{t('eightDReport.statusLine')}</span>
                  <input style={field} value={model.fiveWhy.statusLine} onChange={(e) => set({ fiveWhy: { ...model.fiveWhy!, statusLine: e.target.value } })} />
                  <div style={{ height: 8 }} />
                  {model.fiveWhy.rows.map((row, i) => {
                    const upd = (patch: Partial<typeof row>) => set({ fiveWhy: { ...model.fiveWhy!, rows: model.fiveWhy!.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) } });
                    return (
                      <div key={i} style={{ ...rowBox, display: 'grid', gridTemplateColumns: '90px 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                        <div><span style={label}>#</span><input style={field} value={row.label} onChange={(e) => upd({ label: e.target.value })} /></div>
                        <div><span style={label}>{t('eightDReport.question')}</span><input style={field} value={row.question} onChange={(e) => upd({ question: e.target.value })} /></div>
                        <div><span style={label}>{t('eightDReport.answer')}</span><input style={field} value={row.answer} onChange={(e) => upd({ answer: e.target.value })} /></div>
                        {removeBtn(() => set({ fiveWhy: { ...model.fiveWhy!, rows: model.fiveWhy!.rows.filter((_, k) => k !== i) } }))}
                      </div>
                    );
                  })}
                  <button type="button" style={smallBtn} onClick={() => set({ fiveWhy: { ...model.fiveWhy!, rows: [...model.fiveWhy!.rows, { label: '', question: '', answer: '' }] } })}>+ {t('eightDReport.addRow')}</button>
                  <span style={label}>{t('eightDReport.rootCause')}</span>
                  <textarea rows={3} style={field} value={model.fiveWhy.rootCause} onChange={(e) => set({ fiveWhy: { ...model.fiveWhy!, rootCause: e.target.value } })} />
                </>
              ) : (
                <button type="button" style={smallBtn} onClick={() => set({ fiveWhy: { problem: '', statusLine: '', rows: [], rootCause: '' } })}>+ {t('eightDReport.addBlock')}</button>
              )}

              <div style={section}>{t('eightDReport.capa')}</div>
              {text('capaHeading', t('eightDReport.heading'))}
              {model.capa ? (
                <>
                  <span style={label}>{t('eightDReport.capaTitle')}</span>
                  <input style={field} value={model.capa.title} onChange={(e) => set({ capa: { ...model.capa!, title: e.target.value } })} />
                  <div style={{ height: 8 }} />
                  {model.capa.rows.map((row, i) => {
                    const upd = (patch: Partial<typeof row>) => set({ capa: { ...model.capa!, rows: model.capa!.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) } });
                    return (
                      <div key={i} style={{ ...rowBox, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                        <div><span style={label}>{t('eightDReport.action')}</span><input style={field} value={row.action} onChange={(e) => upd({ action: e.target.value })} /></div>
                        <div><span style={label}>{t('eightDReport.deadline')}</span><input style={field} value={row.deadline} onChange={(e) => upd({ deadline: e.target.value })} /></div>
                        <div><span style={label}>{t('eightDReport.status')}</span><input style={field} value={row.status} onChange={(e) => upd({ status: e.target.value })} /></div>
                        {removeBtn(() => set({ capa: { ...model.capa!, rows: model.capa!.rows.filter((_, k) => k !== i) } }))}
                      </div>
                    );
                  })}
                  <button type="button" style={smallBtn} onClick={() => set({ capa: { ...model.capa!, rows: [...model.capa!.rows, { action: '', deadline: '', status: '' }] } })}>+ {t('eightDReport.addRow')}</button>
                </>
              ) : (
                <button type="button" style={smallBtn} onClick={() => set({ capa: { title: '', rows: [] } })}>+ {t('eightDReport.addBlock')}</button>
              )}

              <div style={section}>{t('eightDReport.conclusion')}</div>
              {text('conclusionHeading', t('eightDReport.heading'))}
              {text('conclusion', t('eightDReport.conclusionText'), true)}

              <div style={section}>{t('eightDReport.versions')}</div>
              {versions.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{t('eightDReport.neverEdited')}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {versions.map((v) => (
                    <li key={v.versionNumber} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                      <strong>{t('eightDReport.versionLabel', { n: v.versionNumber })}{v.versionNumber === version ? ` · ${t('eightDReport.current')}` : ''}</strong>
                      <span style={{ color: '#64748b', flex: 1 }}>
                        {new Date(v.savedAt).toLocaleString(dateLocale())}{v.savedByName ? ` · ${v.savedByName}` : ''}{v.note ? ` · ${v.note}` : ''}
                      </span>
                      <button type="button" style={smallBtn} disabled={busy} onClick={() => void takeVersion(v.versionNumber)}>{t('eightDReport.take')}</button>
                    </li>
                  ))}
                </ul>
              )}

              <span style={{ ...label, marginTop: 14 }}>{t('eightDReport.note')}</span>
              <input style={field} value={note} maxLength={1000} placeholder={t('eightDReport.notePh')} onChange={(e) => setNote(e.target.value)} />
            </>
          )}
          {notice && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, border: `1px solid ${notice.ok ? '#a7f3d0' : '#fecaca'}`, background: notice.ok ? '#ecfdf5' : '#fef2f2', color: notice.ok ? '#065f46' : '#991b1b' }}>{notice.text}</div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" className="e8d-btn" disabled={busy} onClick={() => void reload()} title={t('eightDReport.reloadHint')}>{t('eightDReport.reload')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="e8d-btn" onClick={onClose}>{t('eightDReport.close')}</button>
            <button type="button" className="e8d-btn primary" disabled={busy || !model} onClick={() => void save()}>{t('eightDReport.save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
