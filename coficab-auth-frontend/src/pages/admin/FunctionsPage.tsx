import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';
import { pn } from '../../utils/person';
import FilterSelect from '../../components/FilterSelect';

type Fn = {
  id: string; code: string; description: string; hierarchicalLink: string | null; functionalLink: string | null;
  departmentId: string; departmentName: string; permissions: string[]; hasJobDescription: boolean; jobDescriptionFileName: string | null; holders: number;
};
type Holder = { id: string; userId: string; userName: string; functionId: string; status: 'Active' | 'NotActive' | 'ByInterim'; startDate: string };
type Dept = { id: string; name: string };
type Perm = { code: string; label: string };
type Form = { id?: string; code: string; description: string; departmentId: string; hierarchicalLink: string; functionalLink: string; permissions: string[] };

const BASE = `${ACTION_PLAN_API_URL}/functions`;
const STATUSES: Holder['status'][] = ['Active', 'ByInterim', 'NotActive'];
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 18 };
const input: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 0 };
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: '#000168', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghost: React.CSSProperties = { ...btn, background: '#fff', color: '#000168', border: '1px solid #cbd5e1' };
const small: React.CSSProperties = { ...ghost, height: 28, padding: '0 10px', fontSize: 12 };

/**
 * The functions of the specification: code, description, department, hierarchical and functional links, job description
 * (PDF or Word), the rights a function carries, and who holds it (active, not active or by interim; a person can hold several).
 */
export default function FunctionsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${accessToken}` }), [accessToken]);

  const [functions, setFunctions] = useState<Fn[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [newHolder, setNewHolder] = useState({ userId: '', status: 'Active' as Holder['status'] });

  const fail = (e: unknown) => {
    const m = axios.isAxiosError(e) ? (e.response?.data as any)?.message : null;
    setMessage({ text: m || t('functions.failed'), error: true });
  };

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [f, d, p, o] = await Promise.all([
        axios.get<Fn[]>(BASE, { headers, params: deptFilter ? { departmentId: deptFilter } : undefined }),
        axios.get(`${BASE}/departments`, { headers }),
        axios.get<Perm[]>(`${BASE}/permissions`, { headers }),
        axios.get(`${ACTION_PLAN_API_URL}/organization`, { headers }).catch(() => ({ data: [] as any[] })),
      ]);
      // the same department name can exist in several organizations: the organization is shown beside it
      const orgs = new Map<string, string>(((o.data as any[]) ?? []).map((x) => [String(x.id ?? x.Id), String(x.name ?? x.Name)]));
      setFunctions(f.data);
      setDepartments((d.data as any[]).map((x) => {
        const name = x.name ?? x.Name;
        const org = orgs.size > 1 ? orgs.get(String(x.organizationId ?? x.OrganizationId)) : undefined;
        return { id: x.id ?? x.Id, name: org ? `${name} · ${org}` : name };
      }));
      setPerms(p.data);
    } catch (e) { fail(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, deptFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!accessToken) return;
    // an administrator is offered the people of his own department; the superadmin everyone
    axios.get<{ id: string; name: string }[]>(`${BASE}/people`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => setPeople((r.data ?? []).filter((x) => x.id && x.name)))
      .catch(() => setPeople([]));
  }, [accessToken]);

  const loadHolders = useCallback(async (functionId: string) => {
    const r = await axios.get<Holder[]>(`${BASE}/assignments`, { headers, params: { functionId } });
    setHolders(r.data);
  }, [headers]);

  const save = async () => {
    if (!form) return;
    setMessage(null);
    const body = { code: form.code, description: form.description, departmentId: form.departmentId, hierarchicalLink: form.hierarchicalLink || null, functionalLink: form.functionalLink || null, permissions: form.permissions };
    try {
      if (form.id) await axios.put(`${BASE}/${form.id}`, body, { headers });
      else await axios.post(BASE, body, { headers });
      setForm(null);
      setMessage({ text: t('functions.saved'), error: false });
      await load();
    } catch (e) { fail(e); }
  };

  const archive = async (id: string) => {
    try { await axios.delete(`${BASE}/${id}`, { headers }); await load(); } catch (e) { fail(e); }
  };

  const upload = async (id: string, file: File | undefined) => {
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try { await axios.post(`${BASE}/${id}/job-description`, data, { headers }); setMessage({ text: t('functions.saved'), error: false }); await load(); } catch (e) { fail(e); }
  };

  const download = async (f: Fn) => {
    try {
      const r = await axios.get(`${BASE}/${f.id}/job-description`, { headers, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.jobDescriptionFileName || 'job-description';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { fail(e); }
  };

  const toggleHolders = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    await loadHolders(id);
  };

  const addHolder = async () => {
    if (!openId || !newHolder.userId) return;
    try {
      await axios.post(`${BASE}/assignments`, { userId: newHolder.userId, functionId: openId, status: newHolder.status }, { headers });
      setNewHolder({ userId: '', status: 'Active' });
      await Promise.all([loadHolders(openId), load()]);
    } catch (e) { fail(e); }
  };

  const setStatus = async (h: Holder, status: string) => {
    try { await axios.put(`${BASE}/assignments/${h.id}`, { status }, { headers }); await Promise.all([loadHolders(h.functionId), load()]); } catch (e) { fail(e); }
  };

  const removeHolder = async (h: Holder) => {
    try { await axios.delete(`${BASE}/assignments/${h.id}`, { headers }); await Promise.all([loadHolders(h.functionId), load()]); } catch (e) { fail(e); }
  };

  const permLabel = (code: string) => perms.find((p) => p.code === code)?.label ?? code;
  const emptyForm = (): Form => ({ code: '', description: '', departmentId: deptFilter || departments[0]?.id || '', hierarchicalLink: '', functionalLink: '', permissions: [] });

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#000168', margin: '0 0 6px' }}>{t('functions.title')}</h1>
          <p style={{ color: '#64748b', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 20px', maxWidth: 680 }}>{t('functions.subtitle')}</p>
        </div>
        {!form && <button type="button" style={btn} onClick={() => setForm(emptyForm())}>{t('functions.add')}</button>}
      </div>

      {message && <p role="status" style={{ fontSize: 13, color: message.error ? '#b91c1c' : '#047857', margin: '0 0 12px' }}>{message.text}</p>}

      {form && (
        <section style={card}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{form.id ? t('functions.edit') : t('functions.add')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ fontSize: 12 }}>{t('functions.code')}<input style={{ ...input, width: '100%' }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>{t('functions.department')}
              <select style={{ ...input, width: '100%' }} value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, gridColumn: '1 / -1' }}>{t('functions.description')}<input style={{ ...input, width: '100%' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>{t('functions.hierarchical')}
              <select style={{ ...input, width: '100%' }} value={form.hierarchicalLink} onChange={(e) => setForm({ ...form, hierarchicalLink: e.target.value })}>
                <option value="">{t('functions.none')}</option>
                {functions.filter((f) => f.id !== form.id).map((f) => <option key={f.id} value={f.code}>{f.code} · {f.description}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12 }}>{t('functions.functional')}
              <select style={{ ...input, width: '100%' }} value={form.functionalLink} onChange={(e) => setForm({ ...form, functionalLink: e.target.value })}>
                <option value="">{t('functions.none')}</option>
                {functions.filter((f) => f.id !== form.id).map((f) => <option key={f.id} value={f.code}>{f.code} · {f.description}</option>)}
              </select>
            </label>
          </div>
          <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 10, margin: '14px 0 0', padding: '8px 12px' }}>
            <legend style={{ fontSize: 12, padding: '0 6px' }}>{t('functions.rights')}</legend>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>{t('functions.rightsHelp')}</p>
            {perms.map((p) => (
              <label key={p.code} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '2px 0' }}>
                <input type="checkbox" checked={form.permissions.includes(p.code)} onChange={(e) => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, p.code] : form.permissions.filter((c) => c !== p.code) })} />
                {p.label}
              </label>
            ))}
          </fieldset>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" style={btn} onClick={() => void save()}>{t('common.save')}</button>
            <button type="button" style={ghost} onClick={() => { setForm(null); setMessage(null); }}>{t('common.cancel')}</button>
          </div>
        </section>
      )}

      <section style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{t('functions.department')}</span>
          <div style={{ width: 240 }}>
            <FilterSelect value={deptFilter} onChange={setDeptFilter} allLabel={t('functions.allDepartments')} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </div>
          <span className="fn-count">{t('functions.count', { count: functions.length })}</span>
        </div>

        {functions.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b' }}>{t('functions.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="fn-table">
              <thead>
                <tr>
                  <th>{t('functions.code')}</th><th>{t('functions.description')}</th><th>{t('functions.department')}</th>
                  <th>{t('functions.hierarchical')}</th><th>{t('functions.functional')}</th><th>{t('functions.rights')}</th><th>{t('functions.jobDescription')}</th><th>{t('functions.holders')}</th><th />
                </tr>
              </thead>
              <tbody>
                {functions.map((f) => (
                  <Fragment key={f.id}>
                    <tr className="fn-row">
                      <td><span className="fn-code">{f.code}</span></td>
                      <td className="fn-desc">{f.description}</td>
                      <td><span className="fn-dept">{f.departmentName}</span></td>
                      <td>{f.hierarchicalLink ? <span className="fn-link">{f.hierarchicalLink}</span> : <span className="fn-none">—</span>}</td>
                      <td>{f.functionalLink ? <span className="fn-link">{f.functionalLink}</span> : <span className="fn-none">—</span>}</td>
                      <td>
                        {f.permissions.length
                          ? <div className="fn-rights">{f.permissions.map((c) => <span key={c} className="fn-right">{permLabel(c)}</span>)}</div>
                          : <span className="fn-none">—</span>}
                      </td>
                      <td>
                        <div className="fn-actions fn-start">
                          {f.hasJobDescription && <button type="button" style={small} className="fn-btn" onClick={() => void download(f)} title={f.jobDescriptionFileName ?? ''}>{t('functions.download')}</button>}
                          <label style={small} className="fn-btn fn-file">
                            {f.hasJobDescription ? t('functions.replace') : t('functions.upload')}
                            <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={(e) => { void upload(f.id, e.target.files?.[0]); e.target.value = ''; }} />
                          </label>
                        </div>
                      </td>
                      <td><button type="button" style={small} className="fn-btn" onClick={() => void toggleHolders(f.id)}>{f.holders} · {openId === f.id ? t('functions.close') : t('functions.manage')}</button></td>
                      <td>
                        <div className="fn-actions">
                        <button type="button" style={small} className="fn-btn" onClick={() => setForm({ id: f.id, code: f.code, description: f.description, departmentId: f.departmentId, hierarchicalLink: f.hierarchicalLink ?? '', functionalLink: f.functionalLink ?? '', permissions: f.permissions })}>{t('common.edit')}</button>
                        <button type="button" style={small} className="fn-btn" onClick={() => void archive(f.id)}>{t('functions.archive')}</button>
                        </div>
                      </td>
                    </tr>
                    {openId === f.id && (
                      <tr key={`${f.id}-h`} style={{ background: '#f8fafc' }}>
                        <td colSpan={9} style={{ padding: 12 }}>
                          {holders.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>{t('functions.noHolder')}</p>}
                          {holders.map((h) => (
                            <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', flexWrap: 'wrap' }}>
                              <strong style={{ minWidth: 180 }}>{pn(h.userName)}</strong>
                              <select aria-label={t('functions.status')} style={input} value={h.status} onChange={(e) => void setStatus(h, e.target.value)}>
                                {STATUSES.map((s) => <option key={s} value={s}>{t(`functions.statuses.${s}`)}</option>)}
                              </select>
                              <button type="button" style={small} onClick={() => void removeHolder(h)}>{t('functions.remove')}</button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            <select aria-label={t('functions.person')} style={{ ...input, minWidth: 220 }} value={newHolder.userId} onChange={(e) => setNewHolder({ ...newHolder, userId: e.target.value })}>
                              <option value="">{t('functions.choosePerson')}</option>
                              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <select aria-label={t('functions.status')} style={input} value={newHolder.status} onChange={(e) => setNewHolder({ ...newHolder, status: e.target.value as Holder['status'] })}>
                              {STATUSES.map((s) => <option key={s} value={s}>{t(`functions.statuses.${s}`)}</option>)}
                            </select>
                            <button type="button" style={btn} disabled={!newHolder.userId} onClick={() => void addHolder()}>{t('functions.assign')}</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <style>{`
        .fn-count { font-size: 12px; font-weight: 600; color: #475569; background: #f1f5f9; border-radius: 999px; padding: 3px 10px; }
        .fn-table { width: 100%; font-size: 13px; border-collapse: separate; border-spacing: 0; }
        .fn-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #64748b; padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        .fn-table th:first-child { border-top-left-radius: 10px; }
        .fn-table th:last-child { border-top-right-radius: 10px; }
        .fn-table td { padding: 14px 12px; vertical-align: middle; border-bottom: 1px solid #eef2f7; }
        .fn-row:hover td { background: #fafbff; }
        .fn-code { display: inline-block; font-weight: 800; font-size: 12px; color: #000168; background: #eef0ff; border-radius: 6px; padding: 4px 8px; white-space: nowrap; }
        .fn-desc { font-weight: 600; color: #1e293b; min-width: 130px; }
        .fn-dept { display: inline-block; font-size: 12px; font-weight: 600; color: #0f766e; background: #ecfdf5; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
        .fn-link { display: inline-block; font-size: 12px; font-weight: 600; color: #475569; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
        .fn-none { color: #cbd5e1; }
        .fn-rights { display: flex; flex-wrap: wrap; gap: 4px; min-width: 190px; max-width: 280px; }
        .fn-right { font-size: 11.5px; color: #334155; background: #f1f5f9; border-radius: 6px; padding: 2px 8px; line-height: 1.5; }
        .fn-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: nowrap; }
        .fn-start { justify-content: flex-start; }
        .fn-btn { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; height: 30px; box-sizing: border-box; transition: background .15s, border-color .15s; }
        .fn-btn:hover { background: #f1f3fb; border-color: #000168; }
        .fn-file { cursor: pointer; }
      `}</style>
    </div>
  );
}
