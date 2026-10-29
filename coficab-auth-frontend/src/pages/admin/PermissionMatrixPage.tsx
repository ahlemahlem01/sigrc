import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  assignStoredPermission,
  getUsers,
  listStoredPermissions,
  revokeStoredPermission,
  StoredPermission,
  UserDto,
} from '../../services/adminService';
import { categoryTitle, permissionHelp, permissionTitle } from '../../utils/permissionLanguage';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const PAGE_SIZE = 12;
// a right created in the last day is flagged as new, so it is found at once in the matrix
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

export default function PermissionMatrixPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [params] = useSearchParams();
  const focusName = params.get('focus');
  const [users, setUsers] = useState<UserDto[]>([]);
  const [permissions, setPermissions] = useState<StoredPermission[]>([]);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  // what each person's role already gives: shown as granted, and not removable from here
  const [inherited, setInherited] = useState<Record<string, string[]>>({});
  const [userQuery, setUserQuery] = useState('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const [userRows, permissionRows] = await Promise.all([
        getUsers(accessToken),
        listStoredPermissions(accessToken),
      ]);
      const next: Record<string, string[]> = {};
      const fromRole: Record<string, string[]> = {};
      userRows.forEach((user) => {
        next[user.id] = user.permissions || [];
        fromRole[user.id] = user.inheritedPermissions || [];
      });
      setUsers(userRows);
      setGrants(next);
      setInherited(fromRole);
      setPermissions(permissionRows.filter((row) => row.isActive));
    } catch (err: any) {
      setError(err?.response?.data?.message || i18n.t('permMatrix.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => {
    const names: string[] = [];
    permissions.forEach((row) => {
      if (row.category && names.indexOf(row.category) < 0) names.push(row.category);
    });
    names.sort((a, b) => a.localeCompare(b, i18n.language));
    return names;
  }, [permissions]);

  const isNew = useCallback((row: StoredPermission) => {
    if (focusName && row.name === focusName) return true;
    const created = row.createdAt ? Date.parse(row.createdAt) : NaN;
    return Number.isFinite(created) && Date.now() - created < NEW_FOR_MS;
  }, [focusName]);

  const newByCategory = useMemo(() => {
    const names = new Set<string>();
    permissions.forEach((row) => { if (row.category && isNew(row)) names.add(row.category); });
    return names;
  }, [permissions, isNew]);

  // opens on the area of the right that was just created (or asked for in the link), otherwise on the first area
  useEffect(() => {
    if (category || categories.length === 0) return;
    const wanted = params.get('category');
    const newest = permissions
      .filter((row) => row.category && isNew(row))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    setCategory(wanted && categories.indexOf(wanted) >= 0 ? wanted : newest?.category || categories[0]);
  }, [category, categories, permissions, params, isNew]);

  useEffect(() => { setPage(0); }, [userQuery, permissionQuery, category]);

  const visibleUsers = useMemo(() => {
    const term = userQuery.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.fullName, user.email, user.department].join(' ').toLowerCase().includes(term)
    );
  }, [users, userQuery]);

  const visiblePermissions = useMemo(() => {
    const term = permissionQuery.trim().toLowerCase();
    return permissions.filter((row) => {
      if (row.category !== category) return false;
      if (!term) return true;
      return [row.name, row.displayName, row.description, permissionTitle(row.name, row.displayName)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [permissions, permissionQuery, category]);

  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const pageUsers = visibleUsers.slice(start, start + PAGE_SIZE);

  const toggle = async (user: UserDto, permission: StoredPermission) => {
    if (!accessToken) return;
    const key = `${user.id}:${permission.id}`;
    const previous = grants[user.id] || [];
    const owned = previous.includes(permission.name);
    setBusyKey(key);
    setError('');
    setGrants((prev) => ({
      ...prev,
      [user.id]: owned ? previous.filter((name) => name !== permission.name) : previous.concat(permission.name),
    }));
    try {
      if (owned) await revokeStoredPermission(accessToken, user.id, permission.id);
      else await assignStoredPermission(accessToken, user.id, permission.id);
    } catch (err: any) {
      setGrants((prev) => ({ ...prev, [user.id]: previous }));
      setError(err?.response?.data?.message || t('permMatrix.updateFailed'));
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="mx-page">
      <style>{PAGE_CSS}</style>
      <p className="mx-kicker">{t('permMatrix.users', { count: users.length })} · {t('permMatrix.rights', { count: permissions.length })}</p>
      <p className="mx-muted">{t('permMatrix.help')}</p>
      <details className="mx-help">
        <summary>{t('permMatrix.helpDetails.title')}</summary>
        <ul>
          <li><strong>{t('permMatrix.helpDetails.greyTitle')}</strong> {t('permMatrix.helpDetails.grey')}</li>
          <li><strong>{t('permMatrix.helpDetails.addTitle')}</strong> {t('permMatrix.helpDetails.add')}</li>
          <li><strong>{t('permMatrix.helpDetails.relogTitle')}</strong> {t('permMatrix.helpDetails.relog')}</li>
          <li><strong>{t('permMatrix.helpDetails.newTitle')}</strong> {t('permMatrix.helpDetails.new')}</li>
        </ul>
      </details>

      <div className="mx-chips" role="tablist" aria-label={t('permMatrix.domain')}>
        {categories.map((item) => (
          <button key={item} type="button" className={`mx-chip${category === item ? ' on' : ''}`} onClick={() => setCategory(item)}>
            {categoryTitle(item)}{newByCategory.has(item) && <span className="mx-dot" title={t('permMatrix.newRight')} />}
          </button>
        ))}
      </div>

      <div className="mx-filters">
        <label className="mx-search">
          <i className="ti ti-search" />
          <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder={t('permMatrix.searchUser')} />
        </label>
        <label className="mx-search">
          <i className="ti ti-search" />
          <input value={permissionQuery} onChange={(e) => setPermissionQuery(e.target.value)} placeholder={t('permMatrix.searchRight')} />
        </label>
      </div>

      {error && <div className="mx-alert">{error}</div>}
      {loading ? <p className="mx-muted">{t('common.loading')}</p> : (
        <>
          <div className="mx-scroll">
            <table>
              <thead>
                <tr>
                  <th className="mx-user">{t('employeesAdmin.roleUser')}</th>
                  {visiblePermissions.map((permission) => (
                    <th key={permission.id} title={permissionHelp(permission.name, permission.description)}>
                      {permissionTitle(permission.name, permission.displayName)}
                      {isNew(permission) && <b className="mx-new">{t('permCatalog.newBadge')}</b>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="mx-user">
                      <strong>{user.fullName || user.email}</strong>
                      <small>{user.email}</small>
                    </td>
                    {visiblePermissions.map((permission) => {
                      const fromRole = (inherited[user.id] || []).indexOf(permission.name) >= 0;
                      const checked = fromRole || (grants[user.id] || []).indexOf(permission.name) >= 0;
                      const key = `${user.id}:${permission.id}`;
                      return (
                        <td key={permission.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={fromRole || busyKey === key}
                            title={fromRole ? t('permMatrix.fromRole') : undefined}
                            aria-label={t('permMatrix.cellAria', { right: permissionTitle(permission.name, permission.displayName), user: user.fullName || user.email })}
                            onChange={() => void toggle(user, permission)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {pageUsers.length === 0 && (
                  <tr><td className="mx-user">{t('permMatrix.noUsers')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mx-pager">
            <span>
              {visibleUsers.length === 0 ? '0' : `${start + 1}–${Math.min(start + PAGE_SIZE, visibleUsers.length)}`} {t('permMatrix.of')} {visibleUsers.length}
              {' · '}{t('permMatrix.rightsShown', { count: visiblePermissions.length })}
            </span>
            <div>
              <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{t('qualityHistory.previous')}</button>
              <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>{t('qualityHistory.next')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_CSS = `
  .mx-page { color: #0f172a; }
  .mx-kicker { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #000168; }
  .mx-help { border: 1px solid #c7d2fe; background: #eef2ff; border-radius: 10px; margin: 0 0 12px; }
  .mx-help summary { cursor: pointer; padding: 9px 14px; font-size: 13px; font-weight: 700; color: #000168; }
  .mx-help ul { margin: 0; padding: 0 16px 10px 34px; font-size: 13px; color: #334155; line-height: 1.55; }
  .mx-help li { margin-bottom: 4px; }
  .mx-dot { display: inline-block; width: 8px; height: 8px; margin-left: 7px; border-radius: 50%; background: #10b981; vertical-align: middle; }
  .mx-new { display: block; width: fit-content; margin: 4px auto 0; padding: 1px 8px; border-radius: 999px; background: #059669; color: #fff; font-size: 11px; font-weight: 700; }
  .mx-muted { margin: 0 0 12px; color: #64748b; font-size: 13px; }
  .mx-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .mx-chip { border: 1px solid #e2e8f0; background: #fff; color: #334155; border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .mx-chip.on { background: #000168; color: #fff; border-color: #000168; }
  .mx-chip:hover { border-color: #c7d2fe; color: #000168; }
  .mx-chip.on:hover { color: #fff; }
  .mx-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .mx-search { flex: 1; min-width: 220px; display: flex; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
  .mx-search i { margin-left: 10px; color: #94a3b8; }
  .mx-search input { width: 100%; border: 0; background: transparent; padding: 8px 10px; font: inherit; font-size: 13px; color: #0f172a; }
  .mx-scroll { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; max-height: calc(100vh - 280px); }
  .mx-scroll table { border-collapse: separate; border-spacing: 0; min-width: 100%; }
  .mx-scroll th, .mx-scroll td { border-bottom: 1px solid #f1f5f9; padding: 8px 10px; text-align: center; background: #fff; font-size: 12px; }
  .mx-scroll th { position: sticky; top: 0; z-index: 2; background: #f8fafc; font-weight: 700; color: #000168; max-width: 140px; line-height: 1.25; }
  .mx-user { position: sticky; left: 0; z-index: 1; text-align: left !important; min-width: 200px; max-width: 240px; background: #fff; box-shadow: 1px 0 0 #e2e8f0; }
  .mx-scroll th.mx-user { z-index: 3; background: #f8fafc; }
  .mx-user strong, .mx-user small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mx-user small { font-weight: 500; color: #64748b; font-size: 11px; }
  .mx-scroll input { width: 15px; height: 15px; accent-color: #000168; }
  .mx-pager { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; font-size: 12px; color: #64748b; }
  .mx-pager button { margin-left: 6px; padding: 4px 10px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #000168; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .mx-pager button:disabled { opacity: .45; cursor: not-allowed; }
  .mx-alert { background: #fef2f2; color: #b91c1c; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 13px; }
`;
