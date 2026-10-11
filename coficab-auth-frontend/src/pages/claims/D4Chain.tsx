import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { isPlatformAdmin } from '../../utils/roles';
import { D4ChainStatus, d4ChainService } from '../../services/d4ChainService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';

const CATEGORIES = ['Manpower', 'Machine', 'Material', 'Method', 'Milieu', 'Measurement'] as const;

interface Props {
  claimId: string;
  /** The root cause written in the 5 Why (when shown there): lets the analyst add it to the Ishikawa in one click. */
  rootCauseText?: string;
}

/**
 * What is still missing before the 5 Why can be sent for validation (D4 chain).
 * Renders nothing for dossiers that are exempt (already submitted/validated or closed).
 */
export function D4ChainChecklist({ claimId, rootCauseText }: Props) {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const admin = isPlatformAdmin(user);
  const [status, setStatus] = useState<D4ChainStatus | null>(null);
  const [category, setCategory] = useState<string>('Machine');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setStatus(await d4ChainService.get(claimId, accessToken));
    } catch {
      setStatus(null);
    }
  }, [claimId, accessToken]);

  useEffect(() => { void load(); }, [load]);

  const addRoot = async () => {
    if (!accessToken || !rootCauseText) return;
    setBusy(true);
    setError(null);
    try {
      await qualityAnalysisService.addIshikawaCause(
        {
          claimId,
          category,
          causeDescription: rootCauseText,
          isRootCause: true,
          source: 'MANUAL',
          createdBy: String((user as any)?.id || (user as any)?.sub || ''),
        },
        accessToken,
      );
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || t('d4Chain.failed'));
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await d4ChainService.release(claimId, reason, accessToken));
      setReason('');
    } catch (e: any) {
      setError(e?.response?.data?.message || t('d4Chain.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.exempt) return null;

  const box: React.CSSProperties = { margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5 };

  if (status.satisfied) {
    return (
      <div role="note" style={{ ...box, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857' }}>
        <CheckCircle2 size={14} aria-hidden style={{ verticalAlign: 'text-bottom' }} />{' '}
        {status.overridden ? t('d4Chain.released') : t('d4Chain.complete')}
      </div>
    );
  }

  const item = (ok: boolean, label: string, action: React.ReactNode) => (
    <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '4px 0' }}>
      {ok ? <CheckCircle2 size={16} aria-hidden color="#047857" style={{ flexShrink: 0, marginTop: 2 }} /> : <Circle size={16} aria-hidden color="#9a3412" style={{ flexShrink: 0, marginTop: 2 }} />}
      <span>
        {label}
        {!ok && action ? <> — {action}</> : null}
      </span>
    </li>
  );

  const linkStyle: React.CSSProperties = { color: '#1d4ed8' };
  const btn: React.CSSProperties = { border: '1px solid #000168', background: '#000168', color: '#fff', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div role="note" style={{ ...box, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
      <strong>{t('d4Chain.title')}</strong>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
        {item(status.priorityCause, t('d4Chain.priority'),
          <Link to={`/pages/front/quality-analyses/pareto/${claimId}`} style={linkStyle}>{t('d4Chain.choose')}</Link>)}
        {item(status.rootInIshikawa, t('d4Chain.root'),
          rootCauseText ? (
            <span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('priorityCause.category')} style={{ fontSize: 12, margin: '0 6px' }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`ishikawa.cat.${c}`)}</option>)}
              </select>
              <button type="button" style={btn} disabled={busy} onClick={() => void addRoot()}>{t('d4Chain.addRoot')}</button>
            </span>
          ) : (
            <Link to={`/pages/front/quality-analyses/ishikawa/${claimId}`} style={linkStyle}>{t('d4Chain.markRoot')}</Link>
          ))}
      </ul>
      {error && <div role="alert" style={{ color: '#b91c1c', marginTop: 6 }}>{error}</div>}

      {admin && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>{t('d4Chain.releaseSummary')}</summary>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('d4Chain.reasonPh')}
              aria-label={t('d4Chain.reasonPh')}
              style={{ flex: '1 1 260px', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' }}
            />
            <button type="button" style={btn} disabled={busy || reason.trim().length < 10} onClick={() => void release()}>{t('d4Chain.release')}</button>
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{t('d4Chain.releaseHint')}</div>
        </details>
      )}
    </div>
  );
}
