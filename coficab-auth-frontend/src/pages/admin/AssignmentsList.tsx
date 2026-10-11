import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { assignActionPlanToUser, getActionPlans, getAllAssignments } from '../../services/actionPlanService';
import { getUsers } from '../../services/adminService';
import TableSkeleton from '../../components/TableSkeleton';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
const unwrapList = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
};

function CreateAssignmentModal({
  users,
  plans,
  onClose,
  onCreated,
}: {
  users: any[];
  plans: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [userId, setUserId] = useState('');
  const [actionPlanId, setActionPlanId] = useState('');
  const [permissions, setPermissions] = useState({ view: true, edit: true, delete: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!userId || !actionPlanId) {
      setError(t('assignmentsList.selectBoth'));
      return;
    }
    if (!permissions.view && !permissions.edit && !permissions.delete) {
      setError(t('assignmentsList.permissionRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await assignActionPlanToUser(accessToken!, {
        userId,
        actionPlanId,
        permissions,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || t('assignmentsList.assignFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="asl-overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('asl-overlay')) onClose(); }}>
      <div className="asl-modal">
        <div className="asl-modal-head">
          <div>
            <div className="asl-modal-title">{t('assignmentsList.newAssignment')}</div>
            <div className="asl-modal-sub">{t('assignmentsList.modalSub')}</div>
          </div>
          <button type="button" className="asl-modal-close" onClick={onClose} aria-label={t('fiveWhy.close')}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="asl-modal-body">
          {error && <div className="asl-form-error"><i className="ti ti-alert-circle" /> {error}</div>}
          <div className="asl-field">
            <label className="asl-label">{t('employeesAdmin.roleUser')}</label>
            <select className="asl-input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— {t('managedClaims.chooseEmployee')} —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.email} {u.department ? `(${u.department})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="asl-field">
            <label className="asl-label">{t('planList.modalKicker')}</label>
            <select className="asl-input" value={actionPlanId} onChange={(e) => setActionPlanId(e.target.value)}>
              <option value="">— {t('assignmentsList.choosePlan')} —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.name || p.id}
                </option>
              ))}
            </select>
          </div>
          <div className="asl-field">
            <label className="asl-label">{t('assignmentsList.permissions')}</label>
            <div className="asl-perm-row">
              {([
                ['view', 'closedArchive.view', 'ti-eye'],
                ['edit', 'common.edit', 'ti-pencil'],
                ['delete', 'common.delete', 'ti-trash'],
              ] as const).map(([key, label, icon]) => (
                <label key={key} className={`asl-perm-toggle${permissions[key] ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={permissions[key]}
                    onChange={() => setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={{ display: 'none' }}
                  />
                  <i className={`ti ${icon}`} /> {t(label)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="asl-modal-foot">
          <button type="button" className="asl-btn asl-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="asl-btn asl-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t('assignmentsMap.assigning') : t('assignmentsList.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentsList() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterPerm, setFilterPerm] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadAssignments();
    loadEmployeeNames();
    loadFormData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, []);

  const loadFormData = async () => {
    if (!accessToken) return;
    try {
      const [usersRes, plansRes] = await Promise.all([
        getUsers(accessToken),
        getActionPlans(accessToken),
      ]);
      const allUsers = usersRes ?? [];
      setUsers(allUsers.filter((u: any) => !u.roles?.some((r: string) => ['admin', 'superadmin'].includes(r))));
      setPlans(unwrapList(plansRes.data));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const res = await getAllAssignments(accessToken!);
      setAssignments(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

const loadEmployeeNames = async () => {
  try {
    const users = await getUsers(accessToken!);
    const map: Record<string, string> = {};
    (users ?? []).forEach((u: any) => {
      const id = String(u.id || '').trim().toLowerCase();
      const name = u.fullName || u.email;
      if (id && name && !/^[0-9a-f-]{8,}$/i.test(String(name))) map[id] = name;
    });
    setEmployeeNames(map);
  } catch (e) {
    console.error(e);
  }
};

  const employeeLabel = (id: string) => {
    const name = employeeNames[String(id || '').trim().toLowerCase()];
    if (name) return name;
    return t('claimDetail.unassigned');
  };

  const statusCode = (raw: unknown) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === '1' || s === 'created' || s === 'draft') return 1;
    if (s === '2' || s === 'ongoing') return 2;
    if (s === '3' || s === 'closed') return 3;
    if (s === '4' || s === 'archived') return 4;
    return 0;
  };

  const people = Array.from(
    new Map(
      assignments
        .filter((a) => a.assignedToId)
        .map((a) => [String(a.assignedToId).trim().toLowerCase(), employeeLabel(a.assignedToId)] as const),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], i18n.language));

  const filtered = assignments.filter((a) => {
    const status = statusCode(a.status);
    const userId = String(a.assignedToId || '').trim().toLowerCase();
    const term = search.trim().toLowerCase();
    if (filterStatus !== 'all' && String(status) !== filterStatus) return false;
    if (filterUser !== 'all' && userId !== filterUser) return false;
    if (filterPerm === 'view' && !a.permissions?.view) return false;
    if (filterPerm === 'edit' && !a.permissions?.edit) return false;
    if (filterFrom || filterTo) {
      const raw = a.createdAt ? new Date(a.createdAt) : null;
      if (!raw || Number.isNaN(raw.getTime())) return false;
      raw.setHours(0, 0, 0, 0);
      if (filterFrom && raw.getTime() < new Date(filterFrom).getTime()) return false;
      if (filterTo) {
        const end = new Date(filterTo);
        end.setHours(0, 0, 0, 0);
        if (raw.getTime() > end.getTime()) return false;
      }
    }
    if (!term) return true;
    return (
      a.title?.toLowerCase().includes(term) ||
      employeeLabel(a.assignedToId).toLowerCase().includes(term)
    );
  });
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length);

  const statusLabel = (s: number) =>
    s === 1 ? t('planView.statusDraft') : s === 2 ? t('status.ongoing') : s === 3 ? t('status.closed') : t('status.archived');
  const statusClass = (s: number) =>
    s === 1 ? 'r-us' : s === 2 ? 'r-ad' : s === 3 ? 'r-sa' : '';

  return (
    <>
      <style>{
        `
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #000168; --navy-mid: #00009e; --navy-light: #eef2ff;
          --white: #ffffff; --bg: #f4f6fb; --border: #e4e8f2; --border2: #f0f2f8;
          --text: #0d1340; --text2: #374151; --muted: #64748b; --subtle: #94a3b8;
          --font-head: Inter, sans-serif; --font-body: 'Inter', sans-serif;
        }
        .asl-wrap { padding: 20px 24px; font-family: var(--font-body); background: var(--bg); min-height: 100%; }
        .asl-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .asl-title { font-family: var(--font-head); font-size: 20px; font-weight: 700; color: var(--navy); }
        .asl-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--navy); margin-bottom: 4px; }
        .asl-sub { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
        .asl-actions { display: flex; gap: 10px; align-items: center; }
        .asl-srch { display: flex; align-items: center; gap: 6px; background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
        .asl-srch:focus-within { border-color: var(--navy); }
        .asl-srch i { font-size: 14px; color: var(--subtle); }
        .asl-srch input { border: none; outline: none; font-size: 12px; color: var(--text); width: 200px; font-family: var(--font-body); background: none; }
        .asl-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .asl-kpi { background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 16px; border-top: 3px solid var(--navy); }
        .asl-kpi-val { font-family: var(--font-head); font-size: 28px; font-weight: 700; color: var(--navy); }
        .asl-kpi-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-top: 4px; }
        .asl-card { background: var(--white); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .asl-card-head { padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border2); }
        .asl-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border2); }
        .asl-filters select, .asl-filters input { border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--text2); font-family: var(--font-body); background: #fff; width: 100%; min-width: 0; }
        .asl-filters select:hover, .asl-filters input:hover { border-color: #c7d2fe; }
        .asl-card-title { font-family: var(--font-head); font-size: 13px; font-weight: 700; color: var(--navy); }
        .asl-pill { background: var(--bg); border: 1px solid var(--border); border-radius: 20px; padding: 2px 9px; font-size: 10px; color: var(--muted); font-weight: 500; }
        .asl-card table { width: 100%; border-collapse: collapse; }
        .asl-card thead th { padding: 10px 16px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--subtle); background: #f8f9fc; border-bottom: 1px solid var(--border2); }
        .asl-card tbody td { padding: 13px 16px; border-bottom: 1px solid var(--border2); font-size: 12px; color: var(--text2); vertical-align: middle; }
        .asl-card tbody tr:last-child td { border-bottom: none; }
        .asl-card tbody tr:hover td { background: #fafbff; }
        .asl-rpill { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
        .r-sa { background: #ede9fe; color: #5b21b6; }
        .r-ad { background: #dbeafe; color: #1d4ed8; }
        .r-us { background: #f0fdf4; color: #15803d; }
        .asl-perm { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 500; margin: 1px; }
        .perm-on { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .perm-off { background: #f8fafc; color: #94a3b8; border: 1px solid var(--border); }
        .asl-uid { font-family: monospace; font-size: 10px; color: var(--muted); background: var(--bg); padding: 2px 6px; border-radius: 4px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
        .asl-ab { display: inline-flex; align-items: center; gap: 3px; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: #f8f9fc; color: var(--muted); transition: color .15s, border-color .15s; font-family: var(--font-body); }
        .asl-ab:hover { color: #b91c1c; border-color: #fca5a5; }
        .asl-empty { padding: 48px 24px; text-align: center; color: var(--muted); }
        .asl-empty i { font-size: 40px; display: block; margin-bottom: 12px; opacity: .3; }
        .asl-loading { padding: 48px 24px; text-align: center; color: var(--muted); font-size: 13px; }
        .asl-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; font-family: var(--font-body); }
        .asl-btn-primary { background: var(--navy); color: #fff; }
        .asl-btn-primary:hover { background: var(--navy-mid); }
        .asl-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .asl-btn-ghost { background: #f0f2f8; color: var(--text2); }
        .asl-btn-ghost:disabled { opacity: .4; cursor: not-allowed; }
        .asl-pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border2); font-size: 12px; color: var(--muted); }
        .asl-pager div { display: flex; align-items: center; gap: 8px; }
        .asl-pager-pos { font-variant-numeric: tabular-nums; min-width: 42px; text-align: center; }
        .asl-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .asl-modal { background: #fff; border-radius: 14px; width: 480px; max-width: calc(100vw - 32px); box-shadow: 0 24px 64px rgba(0,0,0,.18); }
        .asl-modal-head { display: flex; justify-content: space-between; gap: 12px; padding: 20px 20px 14px; border-bottom: 1px solid var(--border2); }
        .asl-modal-title { font-family: var(--font-head); font-size: 16px; font-weight: 700; color: var(--navy); }
        .asl-modal-sub { font-size: 12px; color: var(--muted); margin-top: 3px; }
        .asl-modal-close { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border); background: #f8f9fc; cursor: pointer; color: var(--muted); }
        .asl-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
        .asl-modal-foot { padding: 14px 20px; border-top: 1px solid var(--border2); display: flex; justify-content: flex-end; gap: 8px; }
        .asl-field { display: flex; flex-direction: column; gap: 6px; }
        .asl-label { font-size: 12px; font-weight: 600; color: var(--text2); }
        .asl-input { border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; font-size: 13px; color: var(--text); font-family: var(--font-body); }
        .asl-input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(0,1,104,.07); }
        .asl-form-error { display: flex; align-items: center; gap: 8px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #b91c1c; }
        .asl-perm-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .asl-perm-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 20px; border: 1px solid var(--border); background: #f8f9fc; font-size: 12px; color: var(--muted); cursor: pointer; }
        .asl-perm-toggle.on { background: #eef2ff; border-color: #a5b4fc; color: var(--navy); font-weight: 600; }
      `}</style>

      {showCreate && (
        <CreateAssignmentModal
          users={users}
          plans={plans}
          onClose={() => setShowCreate(false)}
          onCreated={loadAssignments}
        />
      )}

      <div className="asl-wrap">
        <div className="asl-header">
          <div>
            <div className="asl-eyebrow">{t('createPlan.eyebrow')}</div>
            <div className="asl-title">{t('assignmentsList.title')}</div>
            <div className="asl-sub">{t('assignmentsList.subtitle')}</div>
          </div>
          <div className="asl-actions">
            <button type="button" className="asl-btn asl-btn-primary" onClick={() => setShowCreate(true)}>
              <i className="ti ti-user-plus" /> {t('assignmentsList.newAssignment')}
            </button>
            <div className="asl-srch">
              <i className="ti ti-search" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={t('assignmentsList.searchPh')}
              />
            </div>
          </div>
        </div>

        <div className="asl-kpis">
          <div className="asl-kpi">
            <div className="asl-kpi-val">{assignments.length}</div>
            <div className="asl-kpi-lbl">{t('assignmentsList.kpiTotal')}</div>
          </div>
          <div className="asl-kpi" style={{ borderTopColor: '#16a34a' }}>
            <div className="asl-kpi-val" style={{ color: '#16a34a' }}>
              {new Set(assignments.map(a => a.assignedToId)).size}
            </div>
            <div className="asl-kpi-lbl">{t('assignmentsList.kpiUsers')}</div>
          </div>
          <div className="asl-kpi" style={{ borderTopColor: '#000168' }}>
            <div className="asl-kpi-val" style={{ color: '#000168' }}>
              {new Set(assignments.map(a => a.id)).size}
            </div>
            <div className="asl-kpi-lbl">{t('assignmentsList.kpiPlans')}</div>
          </div>
        </div>

        <div className="asl-card">
          <div className="asl-card-head">
            <span className="asl-card-title">{t('assignmentsList.listTitle')}</span>
            <span className="asl-pill">{t('departments.entries', { count: filtered.length })}</span>
          </div>
          <div className="asl-filters">
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
              <option value="all">{t('activity.all')}</option>
              <option value="1">{t('planView.statusDraft')}</option>
              <option value="2">{t('status.ongoing')}</option>
              <option value="3">{t('status.closed')}</option>
              <option value="4">{t('status.archived')}</option>
            </select>
            <select value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(1); }} aria-label={t('employeesAdmin.roleUser')}>
              <option value="all">{t('assignmentsList.allUsers')}</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select value={filterPerm} onChange={(e) => { setFilterPerm(e.target.value); setPage(1); }} aria-label={t('assignmentsList.right')}>
              <option value="all">{t('assignmentsList.allRights')}</option>
              <option value="view">{t('assignmentsList.canView')}</option>
              <option value="edit">{t('assignmentsList.canEdit')}</option>
            </select>
            <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }} aria-label={t('assignmentsList.assignedFrom')} title={t('assignmentsList.assignedFrom')} />
            <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(1); }} aria-label={t('assignmentsList.assignedTo')} title={t('assignmentsList.assignedTo')} />
          </div>

          {loading ? (
            <table>
              <thead>
                <tr>
                  <th>{t('planList.modalKicker')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('employeesAdmin.roleUser')}</th>
                  <th>{t('assignmentsList.permissions')}</th>
                  <th>{t('assignmentsList.assignedOn')}</th>
                </tr>
              </thead>
              <TableSkeleton cols={5} rows={8} />
            </table>
          ) : filtered.length === 0 ? (
            <div className="asl-empty">
              <i className="ti ti-user-off" />
              {t('assignmentsList.empty')}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('planList.modalKicker')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('employeesAdmin.roleUser')}</th>
                  <th>{t('assignmentsList.permissions')}</th>
                  <th>{t('assignmentsList.assignedOn')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{a.title}</td>
                    <td>
                      <span className={`asl-rpill ${statusClass(a.status)}`}>
                        {statusLabel(a.status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>
                          {employeeLabel(a.assignedToId)}
                        </span>
                        {a.updatedBy && (
                          <span style={{ fontSize: 10, color: 'var(--subtle)' }}>
                            {t('assignmentsMap.assignedBy', { name: employeeNames[a.updatedBy] || a.updatedBy })}
                          </span>
                        )}
                      </div>
                    </td>                    <td>
                      <span className={`asl-perm ${a.permissions?.view ? 'perm-on' : 'perm-off'}`}>
                        <i className="ti ti-eye" style={{ fontSize: 10 }} /> {t('closedArchive.view')}
                      </span>
                      <span className={`asl-perm ${a.permissions?.edit ? 'perm-on' : 'perm-off'}`}>
                        <i className="ti ti-pencil" style={{ fontSize: 10 }} /> {t('common.edit')}
                      </span>
                      
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleDateString(dateLocale()) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="asl-pager">
            <span>{rangeStart}–{rangeEnd} {t('permMatrix.of')} {filtered.length}</span>
            <div>
              <button type="button" className="asl-btn asl-btn-ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('qualityHistory.previous')}</button>
              <span className="asl-pager-pos">{currentPage} / {pageCount}</span>
              <button type="button" className="asl-btn asl-btn-ghost" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('qualityHistory.next')}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}