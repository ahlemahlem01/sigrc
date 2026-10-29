import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  createStoredPermission,
  listAvailablePermissionCodes,
  listStoredPermissions,
  setStoredPermissionActive,
  StoredPermission,
  updateStoredPermission,
} from '../../services/adminService';
import { normalizeRoles } from '../../utils/roles';
import { categoryTitle, permissionHelp, permissionTitle } from '../../utils/permissionLanguage';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const CATEGORIES = ['Claims', 'CAPA', 'Quality', 'Alerts', 'Employees', 'Reports', 'Admin'];

const emptyForm = { name: '', displayName: '', description: '', category: 'CAPA' };

export default function PermissionsCatalogPage() {
  const { t, i18n: { language } } = useTranslation();
  const { accessToken, user } = useAuth();
  const isSuperadmin = normalizeRoles(user).includes('superadmin');
  const [rows, setRows] = useState<StoredPermission[]>([]);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('all');
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [availableCodes, setAvailableCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // the right that was just created: its group opens in the list below and the line is highlighted
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [createdCategory, setCreatedCategory] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      setRows(await listStoredPermissions(accessToken));
    } catch (err: any) {
      setError(err?.response?.data?.message || i18n.t('permCatalog.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!justCreated) return;
    const line = document.getElementById(`perm-${justCreated.replace(/[^a-z0-9_-]/gi, '_')}`);
    if (line) line.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [justCreated, rows, openKeys]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = rows.filter((row) => {
      if (domain !== 'all' && (row.category || 'Autre') !== domain) return false;
      if (!term) return true;
      return [row.name, row.displayName, row.description, row.category]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
    const map = new Map<string, StoredPermission[]>();
    visible.forEach((row) => {
      const key = row.category || 'Autre';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    });
    const result: { key: string; title: string; permissions: StoredPermission[] }[] = [];
    map.forEach((permissions, key) => result.push({ key, title: categoryTitle(key), permissions }));
    result.sort((a, b) => a.title.localeCompare(b.title, language));
    return result;
  }, [rows, search, domain, language]);

  const domains = useMemo(() => {
    const names: string[] = [];
    rows.forEach((row) => {
      const key = row.category || 'Autre';
      if (names.indexOf(key) < 0) names.push(key);
    });
    names.sort((a, b) => a.localeCompare(b, language));
    return names;
  }, [rows, language]);

  // the area of a right follows the start of its code
  const CATEGORY_OF_PREFIX: Record<string, string> = {
    claims: 'Claims', data: 'Claims', capa: 'CAPA', analysis: 'Quality', '8d': 'Quality', assistant: 'Quality',
    alerts: 'Alerts', employees: 'Employees', reports: 'Reports', admin: 'Admin',
  };

  const startCreate = () => {
    setEditingId('new');
    setForm(emptyForm);
    setError('');
    if (accessToken) listAvailablePermissionCodes(accessToken).then(setAvailableCodes).catch(() => setAvailableCodes([]));
  };

  // choosing a code fills the label, the explanation and the area, which stay editable
  const pickCode = (code: string) => {
    if (!code) { setForm({ ...emptyForm }); return; }
    const prefix = code.split(':')[0];
    setForm({
      name: code,
      displayName: permissionTitle(code),
      description: permissionHelp(code),
      category: CATEGORY_OF_PREFIX[prefix] || form.category,
    });
  };

  const startEdit = (row: StoredPermission) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      category: row.category || 'CAPA',
    });
    setError('');
  };

  const save = async () => {
    if (!accessToken || !isSuperadmin) return;
    if (!form.name.trim() || !form.category.trim()) {
      setError(t('permCatalog.required'));
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      name: form.name.trim(),
      displayName: form.displayName.trim() || form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
    };
    try {
      if (editingId === 'new') await createStoredPermission(accessToken, payload);
      else if (editingId) await updateStoredPermission(accessToken, editingId, payload);
      const wasNew = editingId === 'new';
      setEditingId(null);
      setNotice(wasNew ? t('permCatalog.created') : t('permCatalog.updated'));
      await load();
      if (wasNew) {
        setSearch('');
        setDomain('all');
        setOpenKeys((prev) => (prev.indexOf(payload.category) >= 0 ? prev : [...prev, payload.category]));
        setJustCreated(payload.name);
        setCreatedCategory(payload.category);
        window.setTimeout(() => setJustCreated(null), 30000);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || t('permCatalog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: StoredPermission) => {
    if (!accessToken || !isSuperadmin) return;
    setError('');
    setNotice('');
    try {
      await setStoredPermissionActive(accessToken, row.id, !row.isActive);
      setNotice(row.isActive ? t('permCatalog.deactivated') : t('permCatalog.reactivated'));
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || t('permCatalog.toggleFailed'));
    }
  };

  return (
    <div className="pm-page">
      <style>{PAGE_CSS}</style>
      <div className="pm-head">
        <div>
          <p className="pm-kicker">{t('permMatrix.rights', { count: rows.length })} · {t('permCatalog.categories', { count: domains.length })}</p>
          <p>
            {isSuperadmin
              ? t('permCatalog.superadminHelp')
              : t('permCatalog.readOnlyHelp')}
          </p>
        </div>
        {isSuperadmin && (
          <button type="button" className="pm-btn sm" onClick={startCreate}>{t('permCatalog.newPermission')}</button>
        )}
      </div>

      <details className="pm-help">
        <summary>{t('permCatalog.help.title')}</summary>
        <div className="pm-help-body">
          <p>{t('permCatalog.help.what')}</p>
          <ol>
            <li>{t('permCatalog.help.step1')}</li>
            <li>{t('permCatalog.help.step2')}</li>
            <li>{t('permCatalog.help.step3')}</li>
            <li>{t('permCatalog.help.step4')}</li>
          </ol>
          <ul>
            <li><strong>{t('permCatalog.help.delegateTitle')}</strong> {t('permCatalog.help.delegate')}</li>
            <li><strong>{t('permCatalog.help.roleTitle')}</strong> {t('permCatalog.help.role')}</li>
            <li><strong>{t('permCatalog.help.limitTitle')}</strong> {t('permCatalog.help.limit')}</li>
            <li><strong>{t('permCatalog.help.relogTitle')}</strong> {t('permCatalog.help.relog')}</li>
            <li><strong>{t('permCatalog.help.deactivateTitle')}</strong> {t('permCatalog.help.deactivate')}</li>
          </ul>
        </div>
      </details>

      {error && <div className="pm-alert bad">{error}</div>}
      {notice && (
        <div className="pm-alert ok">
          {notice}
          {justCreated && (
            <> <Link className="pm-assign-link" to={`/admin/permissions/assign?category=${encodeURIComponent(createdCategory)}&focus=${encodeURIComponent(justCreated)}`}>{t('permCatalog.assignIt')}</Link></>
          )}
        </div>
      )}

      {isSuperadmin && editingId && (
        <div className="pm-form">
          <label>{t('permCatalog.label')}<input className="pm-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder={t('permCatalog.labelPh')} /></label>
          <label>{t('permCatalog.category')}
            <select className="pm-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(domains.length ? domains : CATEGORIES).map((category) => <option key={category} value={category}>{categoryTitle(category)}</option>)}
            </select>
          </label>
          <label className="pm-span">{t('permCatalog.allows')}<textarea className="pm-input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('permCatalog.allowsPh')} /></label>
          <label className="pm-span">{t('permCatalog.internalRef')}
            {editingId === 'new' ? (
              <>
                <select className="pm-input" value={form.name} onChange={(e) => pickCode(e.target.value)}>
                  <option value="">{t('permCatalog.pickCode')}</option>
                  {availableCodes.map((code) => <option key={code} value={code}>{permissionTitle(code)} — {code}</option>)}
                </select>
                {availableCodes.length === 0 && <small>{t('permCatalog.noCodeLeft')}</small>}
              </>
            ) : (
              <input className="pm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="claims:create" />
            )}
          </label>
          <div className="pm-form-actions">
            <button type="button" className="pm-btn ghost sm" onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
            <button type="button" className="pm-btn sm" disabled={saving} onClick={() => void save()}>{saving ? t('common.saving') : t('common.save')}</button>
          </div>
        </div>
      )}

      <div className="pm-toolbar">
        <label className="pm-search-wrap">
          <i className="ti ti-search" />
          <input className="pm-search" placeholder={t('permCatalog.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <div className="pm-chips" role="tablist" aria-label={t('permCatalog.filterAria')}>
        <button type="button" className={`pm-chip${domain === 'all' ? ' on' : ''}`} onClick={() => setDomain('all')}>{t('permCatalog.allCategories')}</button>
        {domains.map((item) => (
          <button
            key={item}
            type="button"
            className={`pm-chip${domain === item ? ' on' : ''}`}
            onClick={() => {
              setDomain(item);
              setOpenKeys((prev) => prev.indexOf(item) >= 0 ? prev : [...prev, item]);
            }}
          >
            {categoryTitle(item)}
          </button>
        ))}
      </div>

      {loading ? <p className="pm-muted">{t('common.loading')}</p> : (
        <div className="pm-groups">
          {groups.map((group) => {
            const open = domain === group.key || openKeys.indexOf(group.key) >= 0;
            return (
              <section key={group.key} className="pm-group">
                <button
                  type="button"
                  className="pm-group-head"
                  aria-expanded={open}
                  onClick={() => setOpenKeys((prev) => (
                    prev.indexOf(group.key) >= 0 ? prev.filter((id) => id !== group.key) : [...prev, group.key]
                  ))}
                >
                  <i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
                  <span>{group.title}</span>
                  <em>{group.permissions.length}</em>
                </button>
                {open && (
                  <ul>
                    {group.permissions.map((row) => (
                      <li key={row.id || row.name} id={`perm-${row.name.replace(/[^a-z0-9_-]/gi, '_')}`} className={`${row.isActive ? '' : 'off'}${row.name === justCreated ? ' new' : ''}`.trim()} title={permissionHelp(row.name, row.description)}>
                        <div className="pm-line">
                          <strong>{permissionTitle(row.name, row.displayName)}</strong>
                          <span>{permissionHelp(row.name, row.description)}</span>
                          {!row.isActive && <b className="pm-off">{t('activity.inactive')}</b>}
                          {row.name === justCreated && <b className="pm-new">{t('permCatalog.newBadge')}</b>}
                        </div>
                        {isSuperadmin && (
                          <RowMenu
                            active={row.isActive}
                            onEdit={() => startEdit(row)}
                            onToggle={() => void toggleActive(row)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {groups.length === 0 && <p className="pm-muted">{t('permCatalog.noMatch')}</p>}
        </div>
      )}
    </div>
  );
}

function RowMenu({ active, onEdit, onToggle }: { active: boolean; onEdit: () => void; onToggle: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="pm-menu" ref={ref}>
      <button type="button" className="pm-menu-btn" aria-label={t('common.actions')} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <i className="ti ti-dots-vertical" />
      </button>
      {open && (
        <div className="pm-menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>{t('common.edit')}</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onToggle(); }}>{active ? t('permCatalog.deactivate') : t('permCatalog.reactivate')}</button>
        </div>
      )}
    </div>
  );
}

const PAGE_CSS = `
  .pm-page { color: #0f172a; max-width: 980px; }
  .pm-head { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 14px; }
  .pm-kicker { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #000168; }
  .pm-head p, .pm-muted { margin: 0; color: #64748b; font-size: 13px; }
  .pm-btn { background: #000168; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pm-btn.sm { padding: 4px 10px; font-size: 12px; border-radius: 6px; line-height: 1.3; }
  .pm-btn.ghost { background: #fff; color: #000168; border: 1px solid #c7d2fe; }
  .pm-btn:disabled { opacity: .6; cursor: not-allowed; }
  .pm-form { display: grid; grid-template-columns: 1fr 1fr 180px; gap: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  .pm-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
  .pm-form .pm-span, .pm-form-actions { grid-column: 1 / -1; }
  .pm-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .pm-input { width: 100%; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 13px; font-weight: 400; color: #0f172a; background: #fff; }
  .pm-search { width: 100%; box-sizing: border-box; border: 0; border-radius: 8px; padding: 6px 10px 6px 4px; font: inherit; font-size: 13px; font-weight: 400; color: #0f172a; background: transparent; }
  .pm-search-wrap { width: 280px; max-width: 100%; display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
  .pm-search-wrap i { margin-left: 8px; color: #94a3b8; font-size: 14px; }
  .pm-toolbar { display: flex; margin-bottom: 10px; }
  .pm-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .pm-chip { border: 1px solid #e2e8f0; background: #fff; color: #334155; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .pm-chip.on { background: #000168; color: #fff; border-color: #000168; }
  .pm-chip:hover { border-color: #c7d2fe; color: #000168; }
  .pm-chip.on:hover { color: #fff; }
  .pm-groups { display: flex; flex-direction: column; gap: 8px; }
  .pm-group { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
  .pm-group-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 11px 14px; background: transparent; border: 0; border-radius: 12px; cursor: pointer; color: #000168; font: inherit; font-weight: 600; text-align: left; }
  .pm-group-head span { font-size: 13px; font-weight: 600; letter-spacing: .01em; line-height: 1.3; }
  .pm-group-head:hover { background: #f8fafc; }
  .pm-group-head i { font-size: 16px; color: #64748b; }
  .pm-group-head em { margin-left: auto; font-style: normal; background: #e8e8f5; color: #000168; border-radius: 999px; min-width: 22px; text-align: center; padding: 1px 7px; font-size: 12px; }
  .pm-group ul { list-style: none; margin: 0; padding: 0 0 4px; border-top: 1px solid #f1f5f9; }
  .pm-group li { display: flex; align-items: center; gap: 12px; min-height: 38px; padding: 4px 8px 4px 36px; }
  .pm-group li.off .pm-line { opacity: .55; }
  .pm-line { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 12px; }
  .pm-line strong { flex: 0 0 260px; font-size: 13.5px; font-weight: 650; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pm-line span { min-width: 0; font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pm-off { flex-shrink: 0; font-size: 11px; font-weight: 700; color: #b45309; background: #fef3c7; border-radius: 999px; padding: 2px 7px; }
  .pm-menu { position: relative; flex-shrink: 0; }
  .pm-menu-btn { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: #475569; cursor: pointer; }
  .pm-menu-btn:hover { background: #f1f5f9; color: #000168; }
  .pm-menu-pop { position: absolute; right: 0; top: 30px; z-index: 5; min-width: 148px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 24px rgba(15, 23, 42, .08); padding: 4px; }
  .pm-menu-pop button { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 6px; padding: 7px 10px; font: inherit; font-size: 13px; color: #0f172a; cursor: pointer; }
  .pm-menu-pop button:hover { background: #f8fafc; color: #000168; }
  .pm-help { border: 1px solid #c7d2fe; background: #eef2ff; border-radius: 10px; margin: 0 0 14px; }
  .pm-help summary { cursor: pointer; padding: 10px 14px; font-size: 13px; font-weight: 700; color: #000168; }
  .pm-help-body { padding: 0 16px 12px; font-size: 13px; color: #334155; line-height: 1.55; }
  .pm-help-body p { margin: 0 0 8px; }
  .pm-help-body ol, .pm-help-body ul { margin: 0 0 6px; padding-left: 20px; }
  .pm-help-body li { margin-bottom: 4px; }
  .pm-group li.new { background: #ecfdf5; box-shadow: inset 0 0 0 2px #34d399; border-radius: 8px; }
  .pm-new { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: #059669; color: #fff; font-size: 11px; font-weight: 700; }
  .pm-assign-link { margin-left: 6px; font-weight: 700; color: #000168; text-decoration: underline; }
  .pm-alert { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
  .pm-alert.bad { background: #fef2f2; color: #b91c1c; }
  .pm-alert.ok { background: #f0fdf4; color: #15803d; }
  @media (max-width: 800px) {
    .pm-form { grid-template-columns: 1fr; }
    .pm-line { flex-wrap: wrap; }
    .pm-line strong { flex-basis: 100%; }
  }
`;
