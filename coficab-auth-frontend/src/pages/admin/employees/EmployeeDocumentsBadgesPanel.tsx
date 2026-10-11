import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { adminEmployeeService } from '../../../services/adminEmployeeService';
import { downloadDocument } from '../../../services/documentService';
import { BADGE_DEFINITIONS } from '../../../utils/badges';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../../i18n';

/** Must match DocumentStorage.AllowedExtensions on the API. */
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods';

const typeFromName = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toUpperCase() ?? '';
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(ext)) return 'IMG';
  return ext || 'FILE';
};

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.error || err?.response?.data?.message || fallback;

const fmt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
};

type Props = {
  token: string;
  userId: string;
  employeeName: string;
  adminName?: string;
  badges: any[];
  onBadgesChanged: () => Promise<void> | void;
};

/**
 * Admin employee file: the employee's documents (list, upload, download) and badge awarding.
 * The API notifies the employee for each new document or badge.
 */
export default function EmployeeDocumentsBadgesPanel({ token, userId, employeeName, adminName, badges, onBadgesChanged }: Props) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [badgeId, setBadgeId] = useState(BADGE_DEFINITIONS[0]?.id ?? '');
  const [comment, setComment] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [badgeMsg, setBadgeMsg] = useState<{ text: string; err?: boolean } | null>(null);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const list = await adminEmployeeService.getUserDocuments(token, userId);
      setDocs(Array.isArray(list) ? list : []);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setDocMsg(null);
    const form = new FormData();
    form.append('file', file);
    form.append('userId', userId);
    form.append('name', docName.trim() || file.name);
    form.append('type', typeFromName(file.name));
    form.append('category', 'General');
    form.append('description', description.trim());
    form.append('createdBy', adminName || 'Admin');
    try {
      await adminEmployeeService.uploadDocument(token, form);
      setDocMsg({ text: t('employeeFile.docAdded', { name: employeeName }) });
      setFile(null);
      setDocName('');
      setDescription('');
      if (fileInput.current) fileInput.current.value = '';
      await loadDocs();
    } catch (err) {
      setDocMsg({ text: apiError(err, t('employeeFile.docUploadFailed')), err: true });
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (doc: any) => {
    try {
      const blob = await downloadDocument(String(doc.id), token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(doc.name || 'document');
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDocMsg({ text: t('employeeFile.docDownloadFailed'), err: true });
    }
  };

  const onAward = async (e: FormEvent) => {
    e.preventDefault();
    const def = BADGE_DEFINITIONS.find((d) => d.id === badgeId);
    if (!def) return;
    setAwarding(true);
    setBadgeMsg(null);
    try {
      await adminEmployeeService.awardBadge(token, {
        userId,
        name: def.name,
        description: comment.trim() || def.description,
        icon: def.id,
        color: def.color,
        category: def.id,
      });
      setBadgeMsg({ text: t('employeeFile.badgeAwarded', { badge: t(`employeeBadges.defs.${def.id}.name`, { defaultValue: def.name }), name: employeeName }) });
      setComment('');
      await onBadgesChanged();
    } catch (err) {
      setBadgeMsg({ text: apiError(err, t('employeeFile.badgeFailed')), err: true });
    } finally {
      setAwarding(false);
    }
  };

  return (
    <>
      <style>{`
        .edb-field select, .edb-field textarea {
          width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
          border: 1px solid #e4e8f2; font: inherit; font-size: 13px; background: #fff;
        }
        .edb-field textarea { resize: vertical; min-height: 38px; }
        .edb-docs { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .edb-doc { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e4e8f2; border-radius: 8px; }
        .edb-doc-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .edb-doc-meta { font-size: 11.5px; color: #64748b; }
        .edb-doc > div { min-width: 0; flex: 1; }
        .edb-divider { border: 0; border-top: 1px solid #eef1f7; margin: 14px 0; }
      `}</style>

      <section className="eap-panel">
        <h2 className="eap-h">{t('employeesAdmin.tabDocuments')}</h2>

        {docsLoading ? (
          <p className="eap-empty">{t('common.loading')}</p>
        ) : docs.length === 0 ? (
          <p className="eap-empty" style={{ marginBottom: 14 }}>{t('employeeFile.noDocs')}</p>
        ) : (
          <ul className="edb-docs">
            {docs.map((d) => (
              <li key={String(d.id)} className="edb-doc">
                <i className={`ti ${d.type === 'IMG' ? 'ti-photo' : 'ti-file-text'}`} />
                <div>
                  <div className="edb-doc-name" title={d.name}>{d.name}</div>
                  <div className="edb-doc-meta">
                    {[d.type, fmt(d.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button type="button" className="eap-btn" onClick={() => void onDownload(d)}>
                  <i className="ti ti-download" /> {t('qualityHistory.open')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <hr className="edb-divider" />
        <form className="eap-form" onSubmit={onUpload}>
          <div className="eap-field">
            <label htmlFor="edb-file">{t('employeeFile.file')} *</label>
            <input
              id="edb-file"
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="eap-field">
            <label htmlFor="edb-name">{t('employeeFile.displayName')}</label>
            <input id="edb-name" value={docName} placeholder={file?.name ?? t('employeeFile.fileName')} onChange={(e) => setDocName(e.target.value)} />
          </div>
          <div className="eap-field edb-field">
            <label htmlFor="edb-desc">{t('claimDetail.description')}</label>
            <textarea id="edb-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="eap-form-actions">
            <button type="submit" className="eap-btn primary" disabled={!file || uploading}>
              <i className="ti ti-upload" /> {uploading ? t('fiveWhy.sending') : t('employeeFile.addDoc')}
            </button>
            {docMsg && <span className={`eap-msg${docMsg.err ? ' err' : ''}`}>{docMsg.text}</span>}
          </div>
        </form>
      </section>

      <section className="eap-panel">
        <h2 className="eap-h">{t('employeeFile.recognition')}</h2>
        <p className="eap-sub">{t('employeeFile.recognitionSub')}</p>
        {badges.length === 0 ? (
          <p className="eap-empty" style={{ marginBottom: 14 }}>{t('employeeFile.noBadges')}</p>
        ) : (
          <div className="eap-badges" style={{ marginBottom: 14 }}>
            {badges.map((b: any, i: number) => (
              <span key={String(b.id ?? i)} className="eap-badge" title={b.description || ''}>
                <i className="ti ti-award" />
                {b.title || b.name || b.badgeName || b.label || 'Badge'}
              </span>
            ))}
          </div>
        )}

        <hr className="edb-divider" />
        <form className="eap-form" onSubmit={onAward}>
          <div className="eap-field edb-field">
            <label htmlFor="edb-badge">{t('employeeFile.badge')} *</label>
            <select id="edb-badge" value={badgeId} onChange={(e) => setBadgeId(e.target.value)}>
              {BADGE_DEFINITIONS.map((d) => <option key={d.id} value={d.id}>{t(`employeeBadges.defs.${d.id}.name`, { defaultValue: d.name })} — {t(`employeeBadges.defs.${d.id}.description`, { defaultValue: d.description })}</option>)}
            </select>
          </div>
          <div className="eap-field edb-field">
            <label htmlFor="edb-comment">{t('employeeFile.message')}</label>
            <textarea id="edb-comment" rows={2} value={comment} placeholder={t('employeeFile.messagePh')} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="eap-form-actions">
            <button type="submit" className="eap-btn primary" disabled={!badgeId || awarding}>
              <i className="ti ti-award" /> {awarding ? t('employeeFile.awarding') : t('employeeFile.award')}
            </button>
            {badgeMsg && <span className={`eap-msg${badgeMsg.err ? ' err' : ''}`}>{badgeMsg.text}</span>}
          </div>
        </form>
      </section>
    </>
  );
}
