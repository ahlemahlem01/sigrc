import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ACTION_PLAN_API_URL as BASE_URL } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n';

interface Organization {
  id: string;
  name: string;
  type: number;
  createdAt: string;
}

const ORG_TYPES: Record<number, string> = {
  1: 'Local',
  2: 'Corporate',
  3: 'Country + Regional + Corporate',
  4: 'Country + Corporate',
  5: 'Regional + Corporate',
};

const ORG_TYPE_COLORS: Record<number, { bg: string; color: string }> = {
  1: { bg: '#eff6ff', color: '#1d4ed8' },
  2: { bg: '#ede9fe', color: '#5b21b6' },
  3: { bg: '#f0fdf4', color: '#15803d' },
  4: { bg: '#fff7ed', color: '#9a3412' },
  5: { bg: '#fef2f2', color: '#b91c1c' },
};

const initials = (name: string) =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

const OrganizationList = () => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [form, setForm] = useState({ name: '', type: 1 });
  const [feedback, setFeedback] = useState('');

  const headers = { headers: { Authorization: `Bearer ${accessToken}` } };

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/organization`, headers);
      setOrgs(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  useEffect(() => { loadOrgs(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 1 });
    setShowModal(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setForm({ name: org.name, type: org.type });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await axios.put(`${BASE_URL}/organization/${editing.id}`, form, headers);
        setFeedback(t('orgs.updated'));
      } else {
        await axios.post(`${BASE_URL}/organization`, form, headers);
        setFeedback(t('orgs.created'));
      }
      setShowModal(false);
      loadOrgs();
    } catch (e) {
      console.error(e);
      setFeedback(t('deptForm.genericError'));
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm(t('orgs.archiveConfirm'))) return;
    try {
      await axios.delete(`${BASE_URL}/organization/${id}`, headers);
      setFeedback(t('orgs.archived'));
      loadOrgs();
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    ORG_TYPES[o.type]?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy:       #000168;
          --navy-mid:   #00009e;
          --navy-light: #eef2ff;
          --accent:     #0066cc;
          --white:      #ffffff;
          --bg:         #f4f6fb;
          --border:     #e4e8f2;
          --border2:    #f0f2f8;
          --text:       #0d1340;
          --text2:      #374151;
          --muted:      #64748b;
          --subtle:     #94a3b8;
          --font-head:  Inter, sans-serif;
          --font-body:  'Inter', sans-serif;
        }

        .ol-wrap {
          font-family: var(--font-body);
          background: var(--bg);
          min-height: 100dvh;
          padding: 28px 32px;
        }

        /* ── topbar ── */
        .ol-head {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 24px;
        }
        .ol-title {
          font-family: var(--font-head); font-size: 20px;
          font-weight: 700; color: var(--navy); letter-spacing: -0.3px;
        }
        .ol-sub {
          font-size: 12px; color: var(--muted); margin-top: 3px;
        }
        .ol-head-right { display: flex; align-items: center; gap: 10px; }

        .ol-srch {
          display: flex; align-items: center; gap: 7px;
          background: var(--white); border: 1px solid var(--border);
          border-radius: 8px; padding: 8px 12px; transition: border .15s;
        }
        .ol-srch:focus-within { border-color: var(--navy); }
        .ol-srch i { font-size: 14px; color: var(--subtle); }
        .ol-srch input {
          background: none; border: none; outline: none;
          font-size: 12px; color: var(--text); width: 180px;
          font-family: var(--font-body);
        }

        .ol-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 9px 16px; background: var(--navy); color: #fff;
          border: none; border-radius: 8px; font-size: 12px;
          font-weight: 600; cursor: pointer; font-family: var(--font-body);
          transition: background .15s; white-space: nowrap;
        }
        .ol-add-btn i { font-size: 15px; }
        .ol-add-btn:hover { background: var(--navy-mid); }

        /* ── feedback ── */
        .ol-alert {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; background: #f0fdf4;
          border: 1px solid #bbf7d0; border-radius: 10px;
          margin-bottom: 18px; font-size: 12px; color: #15803d;
        }
        .ol-alert i { font-size: 15px; }
        .ol-alert-x {
          margin-left: auto; background: none; border: none;
          cursor: pointer; color: #16a34a; display: flex;
        }

        /* ── kpi strip ── */
        .ol-kpis {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 12px; margin-bottom: 20px;
        }
        .ol-kpi {
          background: var(--white); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
          border-top: 3px solid transparent;
          display: flex; flex-direction: column; gap: 4px;
        }
        .ol-kpi-top {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 6px;
        }
        .ol-kpi-ico {
          width: 36px; height: 36px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
        }
        .ol-kpi-ico i { font-size: 18px; }
        .ol-kpi-val {
          font-family: var(--font-head); font-size: 24px;
          font-weight: 700; color: var(--text); letter-spacing: -0.5px;
          line-height: 1;
        }
        .ol-kpi-lbl {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 1px; color: var(--muted); font-weight: 500;
        }

        /* ── skeleton ── */
        @keyframes ol-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .sk { background: #e8ecf4; border-radius: 6px; animation: ol-pulse 1.5s ease-in-out infinite; }
        .sk-r { height: 11px; margin-bottom: 8px; }

        /* ── table card ── */
        .ol-card {
          background: var(--white); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
        }
        .ol-card-head {
          padding: 14px 20px; display: flex; align-items: center;
          justify-content: space-between; border-bottom: 1px solid var(--border2);
        }
        .ol-card-title-wrap { display: flex; align-items: center; gap: 8px; }
        .ol-card-title {
          font-family: var(--font-head); font-size: 13px;
          font-weight: 700; color: var(--navy);
        }
        .ol-pill {
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 20px; padding: 2px 9px;
          font-size: 10px; color: var(--muted); font-weight: 500;
        }

        /* ── table ── */
        .ol-table { width: 100%; border-collapse: collapse; }
        .ol-table thead th {
          padding: 10px 18px; text-align: left; font-size: 9px;
          font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--subtle); background: #f8f9fc;
          border-bottom: 1px solid var(--border2);
        }
        .ol-table tbody td {
          padding: 13px 18px; border-bottom: 1px solid var(--border2);
          font-size: 12px; color: var(--text2); vertical-align: middle;
          transition: color .15s;
        }
        .ol-table tbody tr:last-child td { border-bottom: none; }
        .ol-table tbody tr:hover td { color: var(--navy); }

        /* org cell */
        .ol-ocell { display: flex; align-items: center; gap: 10px; }
        .ol-oava {
          width: 34px; height: 34px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
          background: var(--navy-light); color: var(--navy);
        }
        .ol-oname { font-size: 13px; font-weight: 600; color: var(--text); }
        .ol-odate { font-size: 10px; color: var(--subtle); margin-top: 1px; }

        .ol-type-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
        }
        .ol-type-dot { width: 5px; height: 5px; border-radius: 50%; }

        /* actions */
        .ol-acts { display: flex; gap: 5px; }
        .ol-ab {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 5px 9px; border-radius: 6px; font-size: 10px;
          font-weight: 600; cursor: pointer; border: 1px solid var(--border);
          background: #f8f9fc; color: var(--muted);
          transition: color .15s, border-color .15s;
          white-space: nowrap; font-family: var(--font-body);
        }
        .ol-ab i { font-size: 12px; }
        .ol-ab-manage:hover { color: var(--navy); border-color: #93c5fd; }
        .ol-ab-edit:hover   { color: #1d4ed8; border-color: #93c5fd; }
        .ol-ab-arch:hover   { color: #b91c1c; border-color: #fca5a5; }

        /* empty */
        .ol-empty {
          padding: 64px 20px; text-align: center; color: var(--muted);
        }
        .ol-empty-icon {
          width: 56px; height: 56px; border-radius: 14px;
          background: var(--navy-light); display: flex;
          align-items: center; justify-content: center;
          margin: 0 auto 16px; font-size: 26px; color: var(--navy);
        }
        .ol-empty h3 {
          font-family: var(--font-head); font-size: 15px;
          font-weight: 700; color: var(--text); margin-bottom: 6px;
        }
        .ol-empty p { font-size: 12px; color: var(--subtle); margin-bottom: 16px; }

        /* ── modal ── */
        .ol-overlay {
          position: fixed; inset: 0; background: rgba(0,0,30,.35);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .ol-modal {
          background: var(--white); border-radius: 14px; width: 480px;
          max-height: 88vh; overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0,0,0,.18);
        }
        .ol-mhead {
          padding: 20px 24px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; background: var(--white); z-index: 10;
        }
        .ol-mtitle {
          font-family: var(--font-head); font-size: 15px;
          font-weight: 700; color: var(--navy);
        }
        .ol-mclose {
          background: none; border: none; font-size: 18px; cursor: pointer;
          color: var(--muted); padding: 4px 8px; border-radius: 4px;
          transition: color .15s;
        }
        .ol-mclose:hover { color: var(--navy); }
        .ol-mbody { padding: 22px 24px; }
        .ol-mfoot {
          padding: 14px 24px; border-top: 1px solid var(--border);
          display: flex; justify-content: flex-end; gap: 10px;
          position: sticky; bottom: 0; background: var(--white);
        }

        /* form */
        .ol-fg { margin-bottom: 16px; }
        .ol-fg:last-child { margin-bottom: 0; }
        .ol-lbl {
          display: block; font-size: 10px; font-weight: 600;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--muted); margin-bottom: 5px;
        }
        .ol-inp {
          width: 100%; padding: 9px 12px; border: 1.5px solid var(--border);
          border-radius: 7px; font-size: 13px; font-family: var(--font-body);
          color: var(--text); outline: none; background: var(--bg);
          transition: border-color .15s, background .15s;
        }
        .ol-inp:focus { border-color: var(--navy); background: var(--white); }
        .ol-sel {
          width: 100%; padding: 9px 12px; border: 1.5px solid var(--border);
          border-radius: 7px; font-size: 13px; font-family: var(--font-body);
          color: var(--text); outline: none; background: var(--bg); cursor: pointer;
        }
        .ol-sel:focus { border-color: var(--navy); background: var(--white); }

        /* type cards */
        .ol-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ol-type-card {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 12px; border: 1.5px solid var(--border);
          border-radius: 8px; cursor: pointer; font-size: 12px;
          color: var(--text2); transition: border-color .15s, color .15s;
        }
        .ol-type-card:hover { border-color: var(--navy); color: var(--navy); }
        .ol-type-card.sel {
          border-color: var(--navy); color: var(--navy);
          font-weight: 600; background: var(--navy-light);
        }
        .ol-type-card-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }

        /* buttons */
        .ol-btn {
          padding: 9px 18px; border-radius: 7px; font-size: 12px;
          font-weight: 700; cursor: pointer; border: none;
          font-family: var(--font-head); transition: all .15s;
        }
        .btn-primary { background: var(--navy); color: #fff; }
        .btn-primary:hover { background: var(--navy-mid); }
        .btn-ghost {
          background: var(--bg); color: var(--text2);
          border: 1px solid var(--border);
        }
        .btn-ghost:hover { background: var(--border); }

        @media (max-width: 900px) {
          .ol-kpis { grid-template-columns: repeat(2, 1fr); }
          .ol-wrap { padding: 16px; }
        }
      `}</style>

      <div className="ol-wrap">

        {/* header */}
        <div className="ol-head">
          <div>
            <div className="ol-title">{t('orgs.title')}</div>
            <div className="ol-sub">{t('orgs.subtitle')}</div>
          </div>
          <div className="ol-head-right">
            <div className="ol-srch">
              <i className="ti ti-search" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('activityTracking.searchPh')}
              />
            </div>
            <button className="ol-add-btn" onClick={openCreate}>
              <i className="ti ti-building-plus" /> {t('orgs.new')}
            </button>
          </div>
        </div>

        {/* feedback */}
        {feedback && (
          <div className="ol-alert">
            <i className="ti ti-circle-check" />
            {feedback}
            <button className="ol-alert-x" onClick={() => setFeedback('')}>
              <i className="ti ti-x" />
            </button>
          </div>
        )}

        {/* kpis */}
        <div className="ol-kpis">
          <div className="ol-kpi" style={{ borderTopColor: '#000168' }}>
            <div className="ol-kpi-top">
              <div className="ol-kpi-ico" style={{ background: '#E6F1FB' }}>
                <i className="ti ti-building" style={{ color: '#0C447C' }} />
              </div>
            </div>
            <div className="ol-kpi-val" style={{ color: '#000168' }}>{orgs.length}</div>
            <div className="ol-kpi-lbl">{t('orgs.total')}</div>
          </div>
          <div className="ol-kpi" style={{ borderTopColor: '#16a34a' }}>
            <div className="ol-kpi-top">
              <div className="ol-kpi-ico" style={{ background: '#f0fdf4' }}>
                <i className="ti ti-map-pin" style={{ color: '#16a34a' }} />
              </div>
            </div>
            <div className="ol-kpi-val" style={{ color: '#15803d' }}>
              {orgs.filter(o => o.type === 1).length}
            </div>
            <div className="ol-kpi-lbl">{t('orgs.locals')}</div>
          </div>
          <div className="ol-kpi" style={{ borderTopColor: '#7c3aed' }}>
            <div className="ol-kpi-top">
              <div className="ol-kpi-ico" style={{ background: '#ede9fe' }}>
                <i className="ti ti-world" style={{ color: '#6d28d9' }} />
              </div>
            </div>
            <div className="ol-kpi-val" style={{ color: '#5b21b6' }}>
              {orgs.filter(o => o.type === 2).length}
            </div>
            <div className="ol-kpi-lbl">Corporate</div>
          </div>
        </div>

        {/* table card */}
        <div className="ol-card">
          <div className="ol-card-head">
            <div className="ol-card-title-wrap">
              <span className="ol-card-title">{t('orgs.listTitle')}</span>
              <span className="ol-pill">{t('departments.entries', { count: filtered.length })}</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 20 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid #f0f2f8' }}>
                  <div className="sk" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sk sk-r" style={{ width: '40%', marginBottom: 6 }} />
                    <div className="sk sk-r" style={{ width: '25%' }} />
                  </div>
                  <div className="sk sk-r" style={{ width: 80, margin: 0 }} />
                  <div className="sk sk-r" style={{ width: 120, margin: 0 }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ol-empty">
              <div className="ol-empty-icon"><i className="ti ti-building-off" /></div>
              <h3>{t('orgs.empty')}</h3>
              <p>
                {search
                  ? t('orgs.noSearchResult')
                  : t('orgs.createFirst')}
              </p>
              {!search && (
                <button className="ol-add-btn" style={{ margin: '0 auto' }} onClick={openCreate}>
                  <i className="ti ti-building-plus" /> {t('orgs.new')}
                </button>
              )}
            </div>
          ) : (
            <table className="ol-table">
              <thead>
                <tr>
                  <th>{t('usersAdmin.organization')}</th>
                  <th>{t('planDetail.type')}</th>
                  <th>{t('orgs.createdOn')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => {
                  const tc = ORG_TYPE_COLORS[org.type] ?? { bg: '#f4f6fb', color: '#64748b' };
                  return (
                    <tr key={org.id}>
                      <td>
                        <div className="ol-ocell">
                          <div className="ol-oava" style={{ background: tc.bg, color: tc.color }}>
                            {initials(org.name)}
                          </div>
                          <div>
                            <div className="ol-oname">{org.name}</div>
                            <div className="ol-odate">ID: {org.id.slice(0, 8)}…</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="ol-type-pill" style={{ background: tc.bg, color: tc.color }}>
                          <span className="ol-type-dot" style={{ background: tc.color }} />
                          {ORG_TYPES[org.type]}
                        </span>
                      </td>
                      <td>
                        {new Date(org.createdAt).toLocaleDateString(dateLocale(), {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td>
                        <div className="ol-acts">
                          <button
                            className="ol-ab ol-ab-manage"
                            onClick={() => navigate(`/admin/departments?organizationId=${encodeURIComponent(org.id)}`)}
                          >
                            <i className="ti ti-arrow-right" /> {t('orgs.manage')}
                          </button>
                          <button className="ol-ab ol-ab-edit" onClick={() => openEdit(org)}>
                            <i className="ti ti-pencil" /> {t('common.edit')}
                          </button>
                          <button className="ol-ab ol-ab-arch" onClick={() => handleArchive(org.id)} title={t('alerts.archive')} aria-label={t('alerts.archive')}>
                            <i className="ti ti-archive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="ol-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="ol-modal">
            <div className="ol-mhead">
              <span className="ol-mtitle">
                {editing ? `${t('common.edit')} — ${editing.name}` : t('orgs.new')}
              </span>
              <button className="ol-mclose" onClick={() => setShowModal(false)} aria-label={t('fiveWhy.close')}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="ol-mbody">
              <div className="ol-fg">
                <label className="ol-lbl">{t('orgs.name')}</label>
                <input
                  className="ol-inp"
                  placeholder={t('orgs.namePh')}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="ol-fg">
                <label className="ol-lbl" style={{ marginBottom: 10 }}>{t('orgs.type')}</label>
                <div className="ol-type-grid">
                  {Object.entries(ORG_TYPES).map(([key, label]) => {
                    const k = Number(key);
                    const tc = ORG_TYPE_COLORS[k] ?? { bg: '#f4f6fb', color: '#64748b' };
                    return (
                      <div
                        key={key}
                        className={`ol-type-card${form.type === k ? ' sel' : ''}`}
                        onClick={() => setForm({ ...form, type: k })}
                      >
                        <span className="ol-type-card-dot" style={{ background: tc.color }} />
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="ol-mfoot">
              <button className="ol-btn btn-ghost" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="ol-btn btn-primary" onClick={handleSubmit}>
                {editing ? t('common.save') : t('orgs.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrganizationList;