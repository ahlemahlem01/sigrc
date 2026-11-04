import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';
import { normalizeRoles } from '../../utils/roles';

type Licence = { id: string; key: string; isGlobal: boolean; maxUsers: number; expiresAt: string; siteId: string | null; siteName: string | null };
type ModuleRow = { code: string; name: string; isActive: boolean };
type Digest = { mode: number; hour: number; day: number; daysMask: number };
type Overview = {
  status: { state: string; daysLeft: number | null; expiresAt: string | null };
  usersUsed: number; usersMax: number | null; items: Licence[];
};

const BASE = `${ACTION_PLAN_API_URL}/system`;
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 18 };
const input: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 };
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: '#000168', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { ...btn, background: '#fff', color: '#000168', border: '1px solid #cbd5e1' };

/**
 * Settings of the specification: the automatic logout delay (set by the local administrator) and the licences
 * (recorded by the superadmin, who is the supplier; the administrator sees them).
 */
export default function SecuritySettingsPage() {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const isSuper = !!user && normalizeRoles(user as any).includes('superadmin');
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [idle, setIdle] = useState('30');
  const [idleMsg, setIdleMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState<{ id?: string; key: string; isGlobal: boolean; maxUsers: string; expiresAt: string } | null>(null);
  const [licMsg, setLicMsg] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [digest, setDigest] = useState<Digest>({ mode: 0, hour: 8, day: 1, daysMask: 62 });
  const [digestMsg, setDigestMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
      const [s, l, m, d] = await Promise.all([
        axios.get(`${BASE}/session`, auth),
        axios.get<Overview>(`${BASE}/licences`, auth),
        axios.get<ModuleRow[]>(`${BASE}/modules`, auth),
        axios.get<Digest>(`${BASE}/notifications`, auth),
      ]);
      setIdle(String(s.data?.idleMinutes ?? 30));
      setOverview(l.data);
      setModules(m.data);
      setDigest(d.data);
    } catch { /* the page stays empty */ }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const saveIdle = async () => {
    setIdleMsg(null);
    try {
      await axios.put(`${BASE}/session`, { idleMinutes: Number(idle) }, { headers });
      setIdleMsg({ text: t('security.saved'), error: false });
    } catch (e) {
      const m = axios.isAxiosError(e) ? (e.response?.data as any)?.message : null;
      setIdleMsg({ text: m || t('security.saveFailed'), error: true });
    }
  };

  const saveLicence = async () => {
    if (!form) return;
    setLicMsg(null);
    const body = { key: form.key, isGlobal: form.isGlobal, maxUsers: Number(form.maxUsers), expiresAt: new Date(form.expiresAt).toISOString(), siteId: null };
    try {
      if (form.id) await axios.put(`${BASE}/licences/${form.id}`, body, { headers });
      else await axios.post(`${BASE}/licences`, body, { headers });
      setForm(null);
      await load();
    } catch (e) {
      const m = axios.isAxiosError(e) ? (e.response?.data as any)?.message : null;
      setLicMsg(m || t('security.saveFailed'));
    }
  };

  const toggleModule = async (code: string, isActive: boolean) => {
    try {
      await axios.put(`${BASE}/modules/${code}`, { isActive }, { headers });
      setModules((rows) => rows.map((m) => (m.code === code ? { ...m, isActive } : m)));
    } catch { /* the switch stays where it was */ }
  };

  const saveDigest = async () => {
    setDigestMsg(null);
    try {
      await axios.put(`${BASE}/notifications`, digest, { headers });
      setDigestMsg({ text: t('security.saved'), error: false });
    } catch (e) {
      const m = axios.isAxiosError(e) ? (e.response?.data as any)?.message : null;
      setDigestMsg({ text: m || t('security.saveFailed'), error: true });
    }
  };

  const archive = async (id: string) => {
    await axios.delete(`${BASE}/licences/${id}`, { headers });
    await load();
  };

  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  const stateLabel = (s: string) => t(`security.state.${s}`);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#000168', margin: '0 0 4px' }}>{t('security.title')}</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>{t('security.subtitle')}</p>

      <section style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{t('security.idleTitle')}</h2>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>{t('security.idleHelp')}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input aria-label={t('security.idleTitle')} style={{ ...input, width: 90 }} type="number" min={0} max={480} value={idle} onChange={(e) => setIdle(e.target.value)} />
          <span style={{ fontSize: 13 }}>{t('security.minutes')}</span>
          <button type="button" style={btn} onClick={() => void saveIdle()}>{t('common.save')}</button>
          {idleMsg && <span style={{ fontSize: 13, color: idleMsg.error ? '#b91c1c' : '#047857' }}>{idleMsg.text}</span>}
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{t('security.notifTitle')}</h2>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>{t('security.notifHelp')}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label={t('security.notifMode')} style={input} value={digest.mode} onChange={(e) => setDigest({ ...digest, mode: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((m) => <option key={m} value={m}>{t(`security.notifModes.${m}`)}</option>)}
          </select>
          {digest.mode !== 0 && (
            <label style={{ fontSize: 13 }}>{t('security.notifHour')}{' '}
              <input aria-label={t('security.notifHour')} style={{ ...input, width: 64 }} type="number" min={0} max={23} value={digest.hour} onChange={(e) => setDigest({ ...digest, hour: Number(e.target.value) })} /> h
            </label>
          )}
          {digest.mode === 2 && (
            <select aria-label={t('security.notifDay')} style={input} value={digest.day} onChange={(e) => setDigest({ ...digest, day: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{t(`security.days.${d}`)}</option>)}
            </select>
          )}
          {digest.mode === 3 && (
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={(digest.daysMask & (1 << d)) !== 0} onChange={(e) => setDigest({ ...digest, daysMask: e.target.checked ? digest.daysMask | (1 << d) : digest.daysMask & ~(1 << d) })} />
                  {t(`security.days.${d}`)}
                </label>
              ))}
            </span>
          )}
          <button type="button" style={btn} onClick={() => void saveDigest()}>{t('common.save')}</button>
          {digestMsg && <span style={{ fontSize: 13, color: digestMsg.error ? '#b91c1c' : '#047857' }}>{digestMsg.text}</span>}
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{t('security.modulesTitle')}</h2>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>{isSuper ? t('security.modulesHelpSuper') : t('security.modulesHelp')}</p>
        {modules.map((m) => (
          <label key={m.code} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, padding: '4px 0' }}>
            <input type="checkbox" checked={m.isActive} disabled={!isSuper} onChange={(e) => void toggleModule(m.code, e.target.checked)} />
            {m.name}
            <span style={{ fontSize: 12, color: m.isActive ? '#047857' : '#b91c1c' }}>{m.isActive ? t('security.moduleOn') : t('security.moduleOff')}</span>
          </label>
        ))}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{t('security.licenceTitle')}</h2>
          {isSuper && !form && (
            <button type="button" style={btn} onClick={() => setForm({ key: '', isGlobal: true, maxUsers: '50', expiresAt: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) })}>
              {t('security.addLicence')}
            </button>
          )}
        </div>
        <p style={{ color: '#64748b', fontSize: 13, margin: '6px 0 12px' }}>{isSuper ? t('security.licenceHelpSuper') : t('security.licenceHelp')}</p>

        {overview && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
            <div><div style={{ color: '#64748b' }}>{t('security.status')}</div><strong>{stateLabel(overview.status.state)}</strong>{overview.status.daysLeft != null && overview.status.state !== 'none' ? ` · ${t('security.daysLeft', { count: overview.status.daysLeft })}` : ''}</div>
            <div><div style={{ color: '#64748b' }}>{t('security.users')}</div><strong>{overview.usersUsed}{overview.usersMax != null ? ` / ${overview.usersMax}` : ''}</strong></div>
          </div>
        )}

        {form && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 12 }}>
            <input style={{ ...input, width: 180 }} placeholder={t('security.key')} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            <input style={{ ...input, width: 100 }} type="number" min={1} placeholder={t('security.maxUsers')} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} />
            <input style={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            <button type="button" style={btn} onClick={() => void saveLicence()}>{t('common.save')}</button>
            <button type="button" style={btnGhost} onClick={() => { setForm(null); setLicMsg(null); }}>{t('common.cancel')}</button>
            {licMsg && <span style={{ fontSize: 13, color: '#b91c1c' }}>{licMsg}</span>}
          </div>
        )}

        {overview && overview.items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b' }}>{t('security.noLicence')}</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '6px 4px' }}>{t('security.key')}</th><th>{t('security.scope')}</th><th>{t('security.maxUsers')}</th><th>{t('security.expires')}</th><th />
              </tr>
            </thead>
            <tbody>
              {(overview?.items ?? []).map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 600 }}>{l.key}</td>
                  <td>{l.isGlobal ? t('security.global') : l.siteName || t('security.site')}</td>
                  <td>{l.maxUsers}</td>
                  <td>{day(l.expiresAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {isSuper && (
                      <>
                        <button type="button" style={{ ...btnGhost, height: 28, marginRight: 6 }} onClick={() => setForm({ id: l.id, key: l.key, isGlobal: l.isGlobal, maxUsers: String(l.maxUsers), expiresAt: l.expiresAt.slice(0, 10) })}>{t('common.edit')}</button>
                        <button type="button" style={{ ...btnGhost, height: 28 }} onClick={() => void archive(l.id)}>{t('security.archive')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
