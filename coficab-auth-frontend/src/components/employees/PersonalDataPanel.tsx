import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';

type Data = {
  firstName: string; lastName: string; site: string; additionalEmails: string;
  dateOfBirth: string; nationalities: string; cinNumber: string; cinDate: string; cinCountry: string;
  passportNumber: string; passportValidFrom: string; passportValidTill: string; passportCountry: string;
  fatherName: string; fatherLastName: string; motherName: string; motherLastName: string;
};

const EMPTY: Data = {
  firstName: '', lastName: '', site: '', additionalEmails: '',
  dateOfBirth: '', nationalities: '', cinNumber: '', cinDate: '', cinCountry: '', passportNumber: '', passportValidFrom: '', passportValidTill: '',
  passportCountry: '', fatherName: '', fatherLastName: '', motherName: '', motherLastName: '',
};

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
const box: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginTop: 16 };
const input: React.CSSProperties = { width: '100%', height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' };

/**
 * Personal data of the specification: identity (CIN), passport, nationalities, parents. Only the administrators read and write it:
 * it is never shown to colleagues.
 */
export default function PersonalDataPanel({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const url = `${ACTION_PLAN_API_URL}/admin/employees/profiles/${userId}/personal`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [data, setData] = useState<Data>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const r = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const d = r.data ?? {};
      setData({
        firstName: d.firstName ?? '', lastName: d.lastName ?? '', site: d.site ?? '', additionalEmails: (d.additionalEmails ?? []).join(', '),
        dateOfBirth: day(d.dateOfBirth), nationalities: (d.nationalities ?? []).join(', '), cinNumber: d.cinNumber ?? '', cinDate: day(d.cinDate), cinCountry: d.cinCountry ?? '',
        passportNumber: d.passportNumber ?? '', passportValidFrom: day(d.passportValidFrom), passportValidTill: day(d.passportValidTill), passportCountry: d.passportCountry ?? '',
        fatherName: d.fatherName ?? '', fatherLastName: d.fatherLastName ?? '', motherName: d.motherName ?? '', motherLastName: d.motherLastName ?? '',
      });
    } catch { setData(EMPTY); }
    setLoaded(true);
  }, [accessToken, url]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setMsg(null);
    const orNull = (v: string) => (v.trim() ? v.trim() : null);
    try {
      await axios.put(url, {
        firstName: orNull(data.firstName), lastName: orNull(data.lastName), site: orNull(data.site),
        additionalEmails: data.additionalEmails.split(',').map((n) => n.trim()).filter(Boolean),
        dateOfBirth: orNull(data.dateOfBirth), nationalities: data.nationalities.split(',').map((n) => n.trim()).filter(Boolean),
        cinNumber: orNull(data.cinNumber), cinDate: orNull(data.cinDate), cinCountry: orNull(data.cinCountry),
        passportNumber: orNull(data.passportNumber), passportValidFrom: orNull(data.passportValidFrom), passportValidTill: orNull(data.passportValidTill), passportCountry: orNull(data.passportCountry),
        fatherName: orNull(data.fatherName), fatherLastName: orNull(data.fatherLastName), motherName: orNull(data.motherName), motherLastName: orNull(data.motherLastName),
      }, { headers });
      setMsg({ text: t('personalData.saved'), error: false });
    } catch (e) {
      const m = axios.isAxiosError(e) ? (e.response?.data as any)?.message : null;
      setMsg({ text: m || t('personalData.failed'), error: true });
    }
  };

  const field = (key: keyof Data, label: string, type: 'text' | 'date' = 'text') => (
    <label style={{ fontSize: 12 }}>{label}
      <input style={input} type={type} value={data[key]} onChange={(e) => setData({ ...data, [key]: e.target.value })} />
    </label>
  );
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 };

  return (
    <section style={box} aria-label={t('personalData.title')}>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{t('personalData.title')}</h2>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>{t('personalData.help')}</p>
      {!loaded ? <p style={{ fontSize: 13 }}>…</p> : (
        <>
          <div style={grid}>
            {field('firstName', t('personalData.firstName'))}
            {field('lastName', t('personalData.lastName'))}
            {field('site', t('personalData.site'))}
            {field('additionalEmails', t('personalData.additionalEmails'))}
          </div>
          <div style={grid}>
            {field('dateOfBirth', t('personalData.dateOfBirth'), 'date')}
            {field('nationalities', t('personalData.nationalities'))}
          </div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('personalData.cin')}</h3>
          <div style={grid}>
            {field('cinNumber', t('personalData.number'))}
            {field('cinDate', t('personalData.date'), 'date')}
            {field('cinCountry', t('personalData.country'))}
          </div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('personalData.passport')}</h3>
          <div style={grid}>
            {field('passportNumber', t('personalData.number'))}
            {field('passportValidFrom', t('personalData.validFrom'), 'date')}
            {field('passportValidTill', t('personalData.validTill'), 'date')}
            {field('passportCountry', t('personalData.country'))}
          </div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('personalData.parents')}</h3>
          <div style={grid}>
            {field('fatherName', t('personalData.fatherName'))}
            {field('fatherLastName', t('personalData.fatherLastName'))}
            {field('motherName', t('personalData.motherName'))}
            {field('motherLastName', t('personalData.motherLastName'))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={() => void save()} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 0, background: '#000168', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('common.save')}</button>
            {msg && <span role="status" style={{ fontSize: 13, color: msg.error ? '#b91c1c' : '#047857' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
