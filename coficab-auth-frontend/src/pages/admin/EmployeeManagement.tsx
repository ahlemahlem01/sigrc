import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminEmployeeService } from '../../services/adminEmployeeService';
import { isPlatformAdmin } from '../../utils/roles';
import { ACTION_PLAN_ORIGIN } from '../../config/apiEnv';
import { CsvImportButton } from '../../components/CsvImportButton';
import { createUser, getPermissions, getUsers, unlockUser, lockUser, importUsersCsv } from '../../services/adminService';
import { fetchEmployeePerformance, EmployeePerformanceRow } from '../../services/employeePerformanceService';
import { fetchAccountHistory, AccountHistoryRow } from '../../services/accountHistoryService';
import UserAvatar from '../../components/UserAvatar';
import TablePagination from '../../components/TablePagination';
import TableSkeleton, { TableLoadingBanner } from '../../components/TableSkeleton';
import { downloadTable, readPrefs } from '../../utils/dataExchange';
import { downloadDocument } from '../../services/documentService';
import EmployeePerformanceTable from './employees/EmployeePerformanceTable';
import EmployeeDetailDrawer from './employees/EmployeeDetailDrawer';
import AccountHistoryTable from './employees/AccountHistoryTable';
import { inferWorkFieldsFromDepartment, phoneFromId } from '../../utils/employeeWorkFields';
import { permissionTitle } from '../../utils/permissionLanguage';
import {
  ACTIVITY_STATUS_OPTIONS,
  activityStatusClass,
  activityStatusLabel,
  normalizeActivityStatus,
  type ActivityStatus,
} from '../../utils/activityStatus';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

const fmtLockUntil = (iso?: string | null) => {
  if (!iso) return i18n.t('employeesAdmin.untilUnlock');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() > 9000) return i18n.t('employeesAdmin.untilUnlock');
  return d.toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '—';
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
};

const badgeColor: Record<string, string> = {
  Performance:   '#f59e0b',
  Collaboration: '#3b82f6',
  Innovation:    '#8b5cf6',
  Leadership:    '#000168',
  Commitment:    '#dc2626',
  General:       '#64748b',
};

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.items))       return raw.items;
  return [];
};

const isAdminRole = (roles: string[] | undefined) =>
  (roles ?? []).some((r) => ['admin', 'superadmin'].includes(String(r).toLowerCase()));

const fixMojibake = (text?: string): string => {
  if (!text || !/[\u00C3\u00C2\u00E2]/.test(text)) return text ?? '';
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
};

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const formatCategory = (raw?: string) => {
  const value = String(raw ?? '').trim();
  if (!value) return '—';

  const KNOWN = ['general', 'first_plan', 'streak', 'speed', 'perfect_quarter', 'performance', 'collaboration', 'innovation', 'leadership', 'commitment'];

  const key = value.toLowerCase();
  if (KNOWN.includes(key)) return i18n.t(`employeesAdmin.badgeCategory.${key}`);

  return value
    .replace(/^performance-/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const displayCell = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return text || '—';
};

const stripEmojiIcon = (icon?: string) => {
  if (!icon) return '';
  if (/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF✅🏅📋💬📢]/u.test(icon)) return '';
  return icon;
};

function inferBadgeCategory(name?: string, description?: string): string {
  const text = `${name ?? ''} ${description ?? ''}`.toLowerCase();
  if (text.includes('premier plan') || text.includes('first plan')) return 'first_plan';
  if (text.includes('ponctuel') || text.includes('délai') || text.includes('delai')) return 'speed';
  if (text.includes('sans retard')) return 'streak';
  if (text.includes('multi')) return 'performance-multitask';
  if (text.includes('triple') || text.includes('succès') || text.includes('succes')) return 'streak';
  if (text.includes('perfection')) return 'performance';
  if (text.includes('team')) return 'collaboration';
  if (text.includes('dedication') || text.includes('engagement')) return 'commitment';
  if (text.includes('innov')) return 'innovation';
  if (text.includes('leader')) return 'leadership';
  return 'performance';
}

function resolveEmployeeName(userId: string, profiles: any[], authUsers: any[]): string {
  const key = userId.trim().toLowerCase();
  if (!key) return '—';

  const profile = profiles.find((p) => String(pick(p, 'id', 'Id', 'userId', 'UserId') ?? '').toLowerCase() === key);
  const auth = authUsers.find((u) => String(pick(u, 'id', 'Id') ?? '').toLowerCase() === key);

  const fromProfile = pick(profile, 'fullName', 'FullName', 'name', 'Name');
  const fromAuth = pick(auth, 'fullName', 'FullName');
  if (fromProfile) return String(fromProfile).trim();
  if (fromAuth) return String(fromAuth).trim();

  const email = pick(profile, 'email', 'Email') ?? pick(auth, 'email', 'Email');
  if (email && String(email).includes('@')) {
    return String(email).split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return '—';
}

function enrichBadges(raw: any[], profiles: any[], authUsers: any[]) {
  const ownerById = Object.fromEntries(
    profiles
      .map((p) => {
        const id = String(pick(p, 'id', 'Id', 'userId', 'UserId') ?? '').trim().toLowerCase();
        return id ? [id, p] as const : null;
      })
      .filter(Boolean) as [string, any][],
  );

  return unwrap(raw).map((b) => {
    const ownerId = String(b.__ownerId ?? pick(b, 'userId', 'UserId') ?? '').trim();
    const userId = ownerId || String(pick(b, 'userId', 'UserId') ?? '').trim();
    const owner = ownerId ? ownerById[ownerId.toLowerCase()] : undefined;
    const badgeName = fixMojibake(pick(b, 'name', 'Name') ?? '');
    const badgeDescription = fixMojibake(pick(b, 'description', 'Description') ?? '');
    const category =
      pick(b, 'category', 'Category', 'type', 'Type', 'badgeType', 'BadgeType')
      ?? inferBadgeCategory(badgeName, badgeDescription);
    const userNameFromApi = pick(b, 'userName', 'UserName');
    const typeLabelFromApi = pick(b, 'typeLabel', 'TypeLabel');
    const ownerName = pick(owner, 'fullName', 'FullName', 'name', 'Name');
    return {
      id: pick(b, 'id', 'Id'),
      userId,
      name: badgeName || '—',
      description: badgeDescription || '—',
      category,
      typeLabel: typeLabelFromApi ?? formatCategory(category),
      color: pick(b, 'color', 'Color') ?? '#64748b',
      icon: stripEmojiIcon(pick(b, 'icon', 'Icon')),
      earnedAt: pick(b, 'earnedAt', 'EarnedAt', 'createdAt', 'CreatedAt', 'awardedAt', 'AwardedAt'),
      userName:
        userNameFromApi
        ?? ownerName
        ?? resolveEmployeeName(userId, profiles, authUsers),
    };
  });
}

function enrichDocuments(raw: any[], profiles: any[], authUsers: any[]) {
  return unwrap(raw).map((d) => {
    const userId = String(pick(d, 'userId', 'UserId') ?? '').trim();
    const userNameFromApi = pick(d, 'userName', 'UserName');
    return {
      ...d,
      id: String(pick(d, 'id', 'Id') ?? ''),
      name: pick(d, 'name', 'Name') ?? '—',
      type: pick(d, 'type', 'Type') ?? 'FILE',
      category: pick(d, 'category', 'Category') ?? '',
      createdBy: pick(d, 'createdBy', 'CreatedBy') ?? '—',
      filePath: pick(d, 'filePath', 'FilePath', 'url', 'Url') ?? '',
      description: pick(d, 'description', 'Description') ?? '',
      createdAt: pick(d, 'createdAt', 'CreatedAt', 'lastViewed', 'LastViewed'),
      userId,
      userName:
        userNameFromApi
        ?? resolveEmployeeName(userId, profiles, authUsers),
    };
  });
}

function mergeEmployeeProfiles(profilesRaw: any[], authUsers: any[]) {
  const authById = Object.fromEntries(
    authUsers.map((u) => [String(pick(u, 'id', 'Id') ?? '').toLowerCase(), u]),
  );
  const merged = unwrap(profilesRaw).map((p: any) => {
    const id = String(pick(p, 'userId', 'UserId', 'id', 'Id') ?? '').trim();
    const auth = authById[id.toLowerCase()];
    const department =
      pick(p, 'department', 'Department', 'departmentName', 'DepartmentName')
      ?? pick(auth, 'department', 'Department')
      ?? '—';
    const inferred = inferWorkFieldsFromDepartment(department);
    const telephone =
      pick(p, 'telephone', 'Telephone', 'phone', 'Phone')
      || phoneFromId(id);
    return {
      ...p,
      id,
      fullName:
        pick(p, 'name', 'Name', 'fullName', 'FullName')
        ?? pick(auth, 'fullName', 'FullName')
        ?? '—',
      email: pick(p, 'email', 'Email') ?? pick(auth, 'email', 'Email') ?? '—',
      department,
      role: pick(p, 'role', 'Role') ?? auth?.roles?.[0] ?? '—',
      roles: auth?.roles ?? (pick(p, 'role', 'Role') ? [pick(p, 'role', 'Role')] : []),
      isLockedOut: Boolean(pick(auth, 'isLockedOut', 'IsLockedOut') ?? pick(p, 'isLockedOut', 'IsLockedOut')),
      lockoutEnd: pick(auth, 'lockoutEnd', 'LockoutEnd') ?? null,
      accessFailedCount: Number(pick(auth, 'accessFailedCount', 'AccessFailedCount') ?? 0),
      hireDate: pick(p, 'hireDate', 'HireDate') ?? null,
      accountCreatedAt:
        pick(auth, 'createdAt', 'CreatedAt')
        ?? pick(p, 'createdAt', 'CreatedAt', 'accountCreatedAt', 'AccountCreatedAt', 'hireDate', 'HireDate')
        ?? null,
      managerName: pick(p, 'managerName', 'ManagerName') ?? '—',
      phone: telephone,
      telephone,
      poste: pick(p, 'poste', 'Poste') || inferred.poste,
      ligneProduction: pick(p, 'ligneProduction', 'LigneProduction') || inferred.ligneProduction,
      equipe: pick(p, 'equipe', 'Equipe') || inferred.equipe,
      profilePictureUrl: pick(p, 'profilePictureUrl', 'ProfilePictureUrl') ?? null,
      organizationName: auth?.organizationName ?? pick(p, 'organizationName', 'OrganizationName') ?? null,
      activityStatus: normalizeActivityStatus(pick(p, 'activityStatus', 'ActivityStatus')),
      lastActivityAt: pick(p, 'lastActivityAt', 'LastActivityAt') ?? null,
      lastLoginAt: pick(p, 'lastLoginAt', 'LastLoginAt') ?? pick(auth, 'lastLoginAt', 'LastLoginAt') ?? null,
      status:
        pick(p, 'status', 'Status')
        ?? (auth?.isLockedOut ? 'Verrouillé' : 'Actif'),
    };
  });

  const seen = new Set(merged.map((e) => String(e.id).toLowerCase()));
  authUsers
    .filter((u) => !isAdminRole(u.roles))
    .forEach((u) => {
      const id = String(pick(u, 'id', 'Id') ?? '').trim();
      if (!id || seen.has(id.toLowerCase())) return;
      const department = pick(u, 'department', 'Department') ?? '—';
      const inferred = inferWorkFieldsFromDepartment(department);
      const telephone = phoneFromId(id);
      merged.push({
        id,
        fullName: pick(u, 'fullName', 'FullName') ?? '—',
        email: pick(u, 'email', 'Email') ?? '—',
        department,
        role: u.roles?.[0] ?? '—',
        roles: u.roles,
        isLockedOut: Boolean(u.isLockedOut ?? pick(u, 'isLockedOut', 'IsLockedOut')),
        lockoutEnd: pick(u, 'lockoutEnd', 'LockoutEnd') ?? null,
        accessFailedCount: Number(pick(u, 'accessFailedCount', 'AccessFailedCount') ?? 0),
        hireDate: null,
        accountCreatedAt:
          pick(u, 'createdAt', 'CreatedAt')
          ?? pick(u, 'hireDate', 'HireDate')
          ?? null,
        managerName: '—',
        phone: telephone,
        telephone,
        poste: inferred.poste,
        ligneProduction: inferred.ligneProduction,
        equipe: inferred.equipe,
        profilePictureUrl: null,
        organizationName: pick(u, 'organizationName', 'OrganizationName') ?? null,
        activityStatus: 'Inactive' as ActivityStatus,
        lastActivityAt: null,
        lastLoginAt: pick(u, 'lastLoginAt', 'LastLoginAt') ?? null,
        status: (u.isLockedOut ?? pick(u, 'isLockedOut', 'IsLockedOut')) ? 'Verrouillé' : 'Actif',
      });
      seen.add(id.toLowerCase());
    });

  return merged.filter((e) => !isAdminRole(e.roles));
};

type Tab = 'profiles' | 'badges' | 'performance' | 'accountHistory' | 'documents';

function downloadEmployeeCsv(filename: string, rows: string[][]) {
  const columns = rows[0] || [];
  downloadTable(readPrefs().exportFormat, filename.replace(/\.csv$/i, ''), columns, rows.slice(1));
}

function cell(value: unknown) {
  if (value == null || value === '') return '';
  return String(value);
}

const MIN_LOADING_MS = 550;
const waitMinLoading = async (startedAt: number) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_LOADING_MS) {
    await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
  }
};

type CatalogPermission = { key: string; label: string };
type CatalogGroup = { key: string; label: string; permissions: CatalogPermission[] };

function appTitle(appId: string) {
  const known: Record<string, string> = {
    'action-plan-app': 'permissions.category.CAPA',
    'claims-app': 'permissions.category.Claims',
    'quality-app': 'permissions.category.Quality',
    'alerts-app': 'permissions.category.Alerts',
    'employees-app': 'permissions.category.Employees',
    'reports-app': 'permissions.category.Reports',
    'admin-app': 'frontNav.footerAdministration',
    'maintenance-app': 'permissions.category.Maintenance',
    'hr-app': 'permissions.category.RH',
  };
  if (known[appId]) return i18n.t(known[appId]);
  const title = appId.replace(/-app$/i, '').replace(/[-_]/g, ' ').trim();
  return title.replace(/\b\w/g, (c) => c.toUpperCase()) || i18n.t('employeesAdmin.badgeCategory.general');
}

function groupPermissions(rows: { name?: string; displayName?: string; appId?: string; Name?: string; DisplayName?: string; AppId?: string }[]): CatalogGroup[] {
  const groups = new Map<string, CatalogPermission[]>();
  for (const row of rows) {
    const key = String(row.name ?? row.Name ?? '').trim();
    if (!key) continue;
    const appId = String(row.appId ?? row.AppId ?? 'general').trim() || 'general';
    const label = permissionTitle(key, String(row.displayName ?? row.DisplayName ?? ''));
    const list = groups.get(appId) ?? [];
    list.push({ key, label });
    groups.set(appId, list);
  }
  const result: CatalogGroup[] = [];
  groups.forEach((permissions, key) => {
    result.push({ key, label: appTitle(key), permissions });
  });
  return result;
}

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [department, setDepartment] = useState('');
  const [poste,      setPoste]      = useState('');
  const [equipe,     setEquipe]     = useState('');
  const [ligneProduction, setLigneProduction] = useState('');
  const [telephone,  setTelephone]  = useState('');
  const [role,       setRole]       = useState('user');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<CatalogGroup[]>([]);
  const [permissionsError, setPermissionsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getPermissions(accessToken)
      .then((rows) => {
        if (!cancelled) setPermissionGroups(groupPermissions(rows as any));
      })
      .catch(() => {
        if (!cancelled) setPermissionsError(i18n.t('employeesAdmin.permsLoadFailed'));
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  const togglePermission = (perm: string) =>
    setSelectedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim()) { setError(t('employeesAdmin.nameEmailRequired')); return; }
    if (!poste.trim()) { setError(t('employeesAdmin.posteRequired')); return; }
    if (!equipe.trim()) { setError(t('employeesAdmin.teamRequired')); return; }
    setLoading(true); setError('');
    try {
      await createUser(accessToken!, { fullName, email, department, role, permissions: selectedPermissions });
      const users = await getUsers(accessToken!);
      const created = users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (created?.id) {
        await adminEmployeeService.updateProfile(accessToken!, created.id, {
          name: fullName.trim(),
          email: email.trim(),
          role,
          poste: poste.trim(),
          equipe: equipe.trim(),
          ligneProduction: ligneProduction.trim() || null,
          telephone: telephone.trim() || null,
          status: 'active',
        });
      }
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err?.message || t('employeesAdmin.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="em-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('em-overlay')) onClose(); }}>
      <div className="em-modal">
        {/* Header */}
        <div className="em-modal-head">
          <div>
            <div className="em-modal-title">{t('employeesAdmin.newEmployee')}</div>
            <div className="em-modal-sub">{t('employeesAdmin.newEmployeeSub')}</div>
          </div>
          <button className="em-modal-close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        {/* Body */}
        <div className="em-modal-body">
          {success ? (
            <div className="em-success">
              <div className="em-success-icon"><i className="ti ti-circle-check" /></div>
              <div className="em-success-msg">{t('employeesAdmin.created')}</div>
              <div className="em-success-sub">{t('employeesAdmin.createdSub')}</div>
            </div>
          ) : (
            <>
              {error && <div className="em-form-error"><i className="ti ti-alert-circle" /> {error}</div>}

              <div className="em-form-grid">
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.fullName')} <span className="em-req">*</span></label>
                  <input className="em-input" placeholder={t('employeesAdmin.fullNamePh')} value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.email')} <span className="em-req">*</span></label>
                  <input className="em-input" type="email" placeholder="email@coficab.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('planDetail.department')}</label>
                  <input className="em-input" placeholder={t('employeesAdmin.departmentPh')} value={department} onChange={e => setDepartment(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.poste')} <span className="em-req">*</span></label>
                  <input className="em-input" placeholder={t('employeesAdmin.postePh')} value={poste} onChange={e => setPoste(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.team')} <span className="em-req">*</span></label>
                  <input className="em-input" placeholder={t('employeesAdmin.teamPh')} value={equipe} onChange={e => setEquipe(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.line')}</label>
                  <input className="em-input" placeholder={t('employeesAdmin.linePh')} value={ligneProduction} onChange={e => setLigneProduction(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.phone')}</label>
                  <input className="em-input" placeholder="+216 70 123 456" value={telephone} onChange={e => setTelephone(e.target.value)} />
                </div>
                <div className="em-field">
                  <label className="em-label">{t('employeesAdmin.role')} <span className="em-req">*</span></label>
                  <select className="em-input" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="user">{t('employeesAdmin.roleUser')}</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
              </div>

              <div className="em-info-banner">
                <i className="ti ti-mail" />
                {t('employeesAdmin.tempPassword')}
              </div>

              <div className="em-field" style={{ marginTop: 16 }}>
                <label className="em-label">{t('employeesAdmin.permissions')}</label>
                {role === 'user' && (
                  <div className="em-perm-hint">
                    <i className="ti ti-info-circle" />
                    {t('employeesAdmin.permsUserHint')}
                  </div>
                )}
                {(role === 'admin' || role === 'superadmin') && (
                  <div className="em-perm-hint">
                    <i className="ti ti-info-circle" />
                    {t('employeesAdmin.permsAdminHint')}
                  </div>
                )}
                {permissionsError && <div className="em-form-error"><i className="ti ti-alert-circle" /> {permissionsError}</div>}
                {!permissionsError && permissionGroups.length === 0 && (
                  <div className="em-perm-hint">{t('employeesAdmin.permsLoading')}</div>
                )}
                <div className="em-perm-groups">
                  {permissionGroups.map(app => (
                    <div key={app.key} className="em-perm-group">
                      <div className="em-perm-group-title">{app.label}</div>
                      <div className="em-perms">
                        {app.permissions.map(({ key, label }) => {
                          const locked = key === 'data:import' && (role === 'admin' || role === 'superadmin');
                          const on = locked || selectedPermissions.includes(key);
                          return (
                          <label key={key} className={`em-perm-chip${on ? ' on' : ''}`} style={locked ? { opacity: 0.85 } : undefined}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={locked}
                              onChange={() => { if (!locked) togglePermission(key); }}
                              style={{ display: 'none' }}
                            />
                            <i className={`ti ${on ? 'ti-check' : 'ti-plus'}`} />
                            {label}{locked ? ` (${t('employeesAdmin.guaranteed')})` : ''}
                          </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="em-modal-foot">
            <button className="em-btn em-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button className="em-btn em-btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <><i className="ti ti-loader-2" style={{ animation: 'em-spin 1s linear infinite' }} /> {t('fiveWhy.creating')}</> : <><i className="ti ti-user-plus" /> {t('employeesAdmin.createEmployee')}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EmployeeManagement() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lockedOnly = searchParams.get('locked') === '1';

  const [tab,       setTab]       = useState<Tab>('profiles');
  const [profiles,  setProfiles]  = useState<any[]>([]);
  const [authUsers, setAuthUsers] = useState<any[]>([]);
  const [badges,    setBadges]    = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [performance, setPerformance] = useState<EmployeePerformanceRow[]>([]);
  const [accountHistory, setAccountHistory] = useState<AccountHistoryRow[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedPerf, setSelectedPerf] = useState<EmployeePerformanceRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [docOpeningId, setDocOpeningId] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | ActivityStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (lockedOnly) setTab('profiles');
  }, [lockedOnly]);

  useEffect(() => { setPage(1); }, [tab, search, lockedOnly, activityFilter]);

  const loadAll = useCallback(async () => {
    if (!accessToken) return;
    const startedAt = Date.now();
    setLoading(true);
    try {
      const [profilesRaw, documentsAll, usersRaw] = await Promise.all([
        adminEmployeeService.getAllProfiles(accessToken),
        adminEmployeeService.getAllDocuments(accessToken),
        getUsers(accessToken),
      ]);
      const merged = mergeEmployeeProfiles(profilesRaw, usersRaw);
      const badgesAll = await adminEmployeeService.getAllBadgesForEmployees(accessToken, merged);
      setProfiles(merged);
      setAuthUsers(usersRaw);
      setBadges(enrichBadges(badgesAll, merged, usersRaw));
      setDocuments(enrichDocuments(documentsAll, merged, usersRaw));
    } catch (e) {
      console.error('Failed to load employee data:', e);
    } finally {
      await waitMinLoading(startedAt);
      setLoading(false);
    }
  }, [accessToken]);

  const listMountedRef = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    if (listMountedRef.current) return;
    listMountedRef.current = true;
    loadAll();
  }, [accessToken, loadAll]);

  const loadPerformance = useCallback(async () => {
    if (!accessToken || profiles.length === 0) return;
    const startedAt = Date.now();
    setPerfLoading(true);
    try {
      const rows = await fetchEmployeePerformance(accessToken, profiles);
      setPerformance(rows);
    } catch (e) {
      console.error('Failed to load performance:', e);
    } finally {
      await waitMinLoading(startedAt);
      setPerfLoading(false);
    }
  }, [accessToken, profiles]);

  const loadAccountHistory = useCallback(async () => {
    if (!accessToken || profiles.length === 0) return;
    const startedAt = Date.now();
    setHistoryLoading(true);
    try {
      const rows = await fetchAccountHistory(accessToken, profiles, authUsers);
      setAccountHistory(rows);
    } catch (e) {
      console.error('Failed to load account history:', e);
    } finally {
      await waitMinLoading(startedAt);
      setHistoryLoading(false);
    }
  }, [accessToken, profiles, authUsers]);

  useEffect(() => {
    if (lockedOnly || !accessToken || profiles.length === 0) return;
    loadPerformance();
    loadAccountHistory();
  }, [lockedOnly, accessToken, profiles.length, loadPerformance, loadAccountHistory]);

  useEffect(() => {
    if (lockedOnly || tab !== 'performance' || profiles.length === 0) return;
    loadPerformance();
  }, [lockedOnly, tab, profiles.length, loadPerformance]);

  useEffect(() => {
    if (lockedOnly || tab !== 'accountHistory' || profiles.length === 0) return;
    loadAccountHistory();
  }, [lockedOnly, tab, profiles.length, loadAccountHistory]);

  const handleUnlock = async (id: string) => {
    if (!accessToken || !window.confirm(t('employeesAdmin.confirmUnlock'))) return;
    setUnlockingId(id);
    try {
      await unlockUser(accessToken, id);
      await loadAll();
    } catch (e) {
      console.error(e);
      window.alert(t('employeesAdmin.unlockFailed'));
    } finally {
      setUnlockingId(null);
    }
  };

  const handleLock = async (id: string) => {
    if (!accessToken || !window.confirm(t('employeesAdmin.confirmLock'))) return;
    setUnlockingId(id);
    try {
      await lockUser(accessToken, id);
      await loadAll();
    } catch (e) {
      console.error(e);
      window.alert(t('employeesAdmin.lockFailed'));
    } finally {
      setUnlockingId(null);
    }
  };

  const q = search.toLowerCase();
  const visibleProfiles = lockedOnly ? profiles.filter((p) => p.isLockedOut) : profiles;
  const filteredProfiles = visibleProfiles
    .filter((p) =>
      activityFilter === 'all' || normalizeActivityStatus(p.activityStatus) === activityFilter,
    )
    .filter((p) =>
      [p.name, p.fullName, p.email, p.department, p.role, p.managerName, p.phone, p.telephone, p.poste, p.equipe, p.ligneProduction, p.organizationName].some(
        (v) => v?.toLowerCase?.().includes(q) ?? String(v ?? '').toLowerCase().includes(q),
      ),
    );
  const filteredBadges = badges.filter(b => [b.name, b.category, b.userName, b.userId].some(v => v?.toLowerCase().includes(q)));

  const slicePage = <T,>(items: T[]) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedProfiles = slicePage(filteredProfiles);
  const pagedBadges = slicePage(filteredBadges);
  const filteredDocuments = documents.filter(d => [d.name, d.type, d.category, d.createdBy, d.userName, d.userId].some(v => String(v ?? '').toLowerCase().includes(q)));
  const pagedDocuments = slicePage(filteredDocuments);

  const exportCurrent = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (tab === 'badges' && !lockedOnly) {
      downloadEmployeeCsv(`employes-badges-${stamp}.csv`, [
        t('employeesAdmin.csvBadges').split('|'),
        ...filteredBadges.map((b) => [cell(b.name), cell(b.userName), cell(b.category), cell(b.description), cell(b.awardedAt ?? b.createdAt)]),
      ]);
      return;
    }
    if (tab === 'documents' && !lockedOnly) {
      downloadEmployeeCsv(`employes-documents-${stamp}.csv`, [
        t('employeesAdmin.csvDocuments').split('|'),
        ...filteredDocuments.map((d) => [cell(d.name), cell(d.type), cell(d.category), cell(d.userName), cell(d.createdBy)]),
      ]);
      return;
    }
    if (tab === 'performance' && !lockedOnly) {
      downloadEmployeeCsv(`employes-performance-${stamp}.csv`, [
        t('employeesAdmin.csvPerformance').split('|'),
        ...performance.map((row) => [
          cell(row.fullName), cell(row.email), cell(row.department), cell(row.poste),
          cell(row.activeDossiers), cell(row.closureRate), cell(row.avgDelayDays), cell(row.overdueCount), cell(row.workload),
        ]),
      ]);
      return;
    }
    if (tab === 'accountHistory' && !lockedOnly) {
      downloadEmployeeCsv(`employes-historique-${stamp}.csv`, [
        t('employeesAdmin.csvHistory').split('|'),
        ...accountHistory.map((row) => [
          cell(row.date), cell(row.employeeName), cell(row.employeeEmail), cell(row.eventType), cell(row.detail), cell(row.performedBy),
        ]),
      ]);
      return;
    }
    downloadEmployeeCsv(`employes-${stamp}.csv`, [
      t('employeesAdmin.csvProfiles').split('|'),
      ...filteredProfiles.map((p) => [
        cell(p.fullName ?? p.name), cell(p.email), cell(p.department ?? p.departmentName), cell(p.poste),
        cell(p.equipe), cell(p.ligneProduction), cell(p.telephone ?? p.phone), cell(p.role),
        activityStatusLabel(normalizeActivityStatus(p.activityStatus)),
        p.isLockedOut ? t('qualityHistory.yes') : t('qualityHistory.no'),
      ]),
    ]);
  };

  const handleDocOpen = async (doc: any, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const docId = String(doc?.id ?? doc?.Id ?? '').trim();
    if (!accessToken) {
      window.alert(t('closedArchive.sessionExpired'));
      return;
    }
    if (!docId) {
      window.alert(t('employeesAdmin.docIdMissing'));
      return;
    }

    const filePath = String(doc.filePath ?? doc.file_path ?? doc.FilePath ?? '');
    if (filePath.startsWith('blob:')) {
      window.alert(t('employeesAdmin.docNoFile'));
      return;
    }

    const openBlob = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const ext = (doc.type ?? '').toUpperCase();
      const previewable = ['PDF', 'IMG', 'JPG', 'JPEG', 'PNG'].includes(ext);
      if (previewable) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          const link = window.document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          window.document.body.appendChild(link);
          link.click();
          link.remove();
        }
      } else {
        const link = window.document.createElement('a');
        link.href = url;
        link.download = doc.name || 'document';
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    setDocOpeningId(docId);
    try {
      if (filePath.startsWith('/uploads/')) {
        const staticRes = await fetch(`${ACTION_PLAN_ORIGIN}${filePath}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (staticRes.ok) {
          openBlob(await staticRes.blob());
          return;
        }
      }

      const blob = await downloadDocument(docId, accessToken);
      openBlob(blob);
    } catch (err) {
      console.error('Document download failed:', err);
      if (filePath.startsWith('/uploads/')) {
        window.open(`${ACTION_PLAN_ORIGIN}${filePath}`, '_blank', 'noopener,noreferrer');
        return;
      }
      window.alert(t('employeesAdmin.docOpenFailed'));
    } finally {
      setDocOpeningId(null);
    }
  };

  const listLoadingLabel =
    tab === 'profiles' ? t('employeesAdmin.loadingProfiles')
    : tab === 'badges' ? t('employeesAdmin.loadingBadges')
    : tab === 'documents' ? t('employeesAdmin.loadingDocuments')
    : t('employeesAdmin.loadingData');

  const formatTabCount = (value: number, isLoading: boolean) => {
    if (isLoading && value === 0) return '…';
    return String(value);
  };

  const openEmployee = (employee: any) => navigate(`/admin/employees/${employee.id}`, { state: { employee } });

  const TABS: { id: Tab; label: string; icon: string; count: number; countLoading?: boolean }[] = [
    { id: 'profiles',       label: t('employeesAdmin.tabProfiles'),              icon: 'ti-users',        count: visibleProfiles.length, countLoading: loading },
    { id: 'badges',         label: t('employeesAdmin.tabBadges'),               icon: 'ti-award',        count: badges.length, countLoading: loading },
    { id: 'performance',    label: t('employeesAdmin.tabPerformance'),          icon: 'ti-chart-radar',  count: performance.length || profiles.length, countLoading: perfLoading && performance.length === 0 },
    { id: 'accountHistory', label: t('employeesAdmin.tabHistory'),  icon: 'ti-history',      count: accountHistory.length, countLoading: historyLoading && accountHistory.length === 0 },
    { id: 'documents',      label: t('employeesAdmin.tabDocuments'),            icon: 'ti-files',        count: documents.length, countLoading: loading },
  ];

  const openPerfDrawer = (row: EmployeePerformanceRow) => {
    setSelectedPerf(row);
    setDrawerOpen(true);
  };

  const activeCount = profiles.filter((p) => !p.isLockedOut).length;
  const lockedCount = profiles.filter((p) => p.isLockedOut).length;

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');

        .em-wrap { padding: 20px 24px 28px; font-family: 'Inter', sans-serif; max-width: 1280px; }

        .em-head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          margin-bottom: 18px; flex-wrap: wrap;
        }
        .em-head-title { font-size: 20px; font-weight: 800; color: #0d1340; letter-spacing: -0.02em; }
        .em-head-sub { font-size: 13px; color: #64748b; margin-top: 4px; max-width: 520px; line-height: 1.45; }
        .em-kpis { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .em-kpi {
          background: #fff; border: 1px solid #e4e8f2; border-radius: 12px;
          padding: 10px 14px; min-width: 108px;
          box-shadow: 0 1px 2px rgba(13,19,64,0.04);
        }
        .em-kpi-val { font-size: 22px; font-weight: 800; color: #000168; line-height: 1; }
        .em-kpi-lbl { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-top: 4px; }
        .em-kpi.locked .em-kpi-val { color: #dc2626; }

        .em-shell {
          background: #fff; border: 1px solid #e4e8f2; border-radius: 16px;
          box-shadow: 0 1px 2px rgba(13,19,64,0.04), 0 10px 30px rgba(13,19,64,0.04);
          overflow: hidden;
        }

        /* ── tab strip ── */
        .em-tab-strip {
          display: flex; gap: 6px; padding: 10px 14px;
          border-bottom: 1px solid #eef1f7; background: #fafbff;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .em-tab-strip::-webkit-scrollbar { display: none; }
        .em-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border: 1px solid transparent; border-radius: 999px;
          cursor: pointer; font-family: 'Inter', sans-serif; background: transparent;
          color: #64748b; transition: all .15s; white-space: nowrap; flex-shrink: 0;
          font-size: 13px; font-weight: 600;
        }
        .em-tab:hover { background: #fff; border-color: #e4e8f2; color: #000168; }
        .em-tab.active {
          background: #000168; color: #fff; border-color: #000168;
          box-shadow: 0 2px 8px rgba(0,1,104,.18);
        }
        .em-tab i { font-size: 15px; }
        .em-count {
          font-size: 10px; font-weight: 700; border-radius: 999px;
          padding: 2px 7px; min-width: 20px; text-align: center;
          background: rgba(0,0,0,.06); color: inherit;
        }
        .em-tab.active .em-count { background: rgba(255,255,255,.2); }
        .em-muted { color: #94a3b8; font-style: italic; font-size: 12px; }

        .em-panel { padding: 18px 18px 20px; }

        /* ── toolbar ── */
        .em-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .em-search {
          display: flex; align-items: center; gap: 8px; background: #f8f9fc;
          border: 1px solid #e4e8f2; border-radius: 10px; padding: 9px 12px;
          flex: 1; min-width: 220px; max-width: 360px;
        }
        .em-search:focus-within { border-color: #000168; background: #fff; box-shadow: 0 0 0 3px rgba(0,1,104,.06); }
        .em-search i { font-size: 15px; color: #94a3b8; }
        .em-search input { border: none; outline: none; font-size: 13px; color: #0d1340; background: transparent; width: 100%; font-family: 'Inter', sans-serif; }
        .em-search input::placeholder { color: #94a3b8; }
        .em-badge-count { font-size: 12px; color: #64748b; background: #f8f9fc; border: 1px solid #eef1f7; border-radius: 999px; padding: 7px 12px; }

        .em-table-wrap { overflow-x: auto; border: 1px solid #eef1f7; border-radius: 12px; }
        .em-table-wrap.is-loading { opacity: .85; }
        .em-locked-banner {
          display: flex; align-items: center; gap: 10px;
          background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
          padding: 12px 14px; margin-bottom: 16px; font-size: 12.5px; color: #991b1b;
        }
        .em-locked-banner i { font-size: 16px; flex-shrink: 0; }

        /* employee list */
        .em-list {
          border: 1px solid #eef1f7;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
        }
        .em-list-row {
          display: grid;
          grid-template-columns: minmax(200px, 1.35fr) minmax(160px, 1.2fr) 110px minmax(118px, max-content);
          gap: 12px 16px;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid #f0f2f8;
          transition: background .12s;
        }
        .em-list-row:last-child { border-bottom: none; }
        .em-list-row:hover { background: #fafbff; }
        .em-list-row.is-locked { background: #fffafa; }
        .em-list-row.is-locked:hover { background: #fff5f5; }
        .em-list-main { min-width: 0; }
        .em-list-name {
          font-size: 13.5px; font-weight: 700; color: #0d1340;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .em-list-email {
          font-size: 11.5px; color: #64748b; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .em-list-meta {
          display: flex; flex-direction: column; gap: 3px;
          min-width: 0; font-size: 12px; color: #64748b;
        }
        .em-list-meta-line {
          display: flex; align-items: center; gap: 6px;
          min-width: 0;
        }
        .em-list-meta-line i { font-size: 13px; color: #94a3b8; flex-shrink: 0; }
        .em-list-meta-text {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .em-list-status {
          display: flex; justify-content: center;
        }
        .em-actions {
          display: flex; gap: 6px; align-items: center; justify-content: flex-end;
          flex-wrap: nowrap;
        }
        @media (max-width: 920px) {
          .em-list-row {
            grid-template-columns: 1fr auto;
            grid-template-areas:
              "id actions"
              "meta meta"
              "status status";
          }
          .em-list-row > .em-name-cell { grid-area: id; }
          .em-list-row > .em-list-meta { grid-area: meta; }
          .em-list-row > .em-list-status { grid-area: status; justify-content: flex-start; }
          .em-list-row > .em-actions { grid-area: actions; }
        }

        .em-pagination {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef1f7;
          font-size: 12px; color: #64748b; flex-wrap: wrap;
        }
        .em-pagination-btns { display: flex; gap: 6px; }
        .em-page-btn {
          padding: 6px 12px; border-radius: 8px; border: 1px solid #e4e8f2; background: #fff;
          font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit;
        }
        .em-page-btn:hover:not(:disabled) { border-color: #000168; color: #000168; }
        .em-page-btn:disabled { opacity: .45; cursor: not-allowed; }

        .em-tl-type-pill {
          display: inline-flex; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .4px; padding: 3px 8px; border-radius: 999px; white-space: nowrap;
        }
        .em-tl-type-pill.badge { background: #fef3c7; color: #b45309; }
        .em-tl-type-pill.assignment { background: #dbeafe; color: #1d4ed8; }
        .em-tl-type-pill.completion { background: #dcfce7; color: #15803d; }
        .em-tl-type-pill.comment { background: #f3e8ff; color: #7c3aed; }
        .em-tl-type-pill.default { background: #f1f5f9; color: #64748b; }
        .em-emp-cell { font-weight: 600; color: #0d1340; white-space: nowrap; }

        .em-tab-help {
          display: flex; align-items: flex-start; gap: 10px;
          background: #f8faff; border: 1px solid #e0e7ff; border-radius: 10px;
          padding: 12px 14px; margin-bottom: 16px; font-size: 12.5px; color: #475569; line-height: 1.5;
        }
        .em-tab-help i { color: #000168; font-size: 16px; margin-top: 1px; flex-shrink: 0; }
        .em-badge-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
        .em-badge-name { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #0d1340; }
        .em-badge-emp, .em-badge-type { color: #374151 !important; font-size: 13px; }
        .em-badge-type { font-size: 12px; }

        .em-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .em-table th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; background: #f8f9fc; border-bottom: 1px solid #e4e8f2; }
        .em-table th:first-child { border-radius: 8px 0 0 0; }
        .em-table th:last-child  { border-radius: 0 8px 0 0; }
        .em-table td { padding: 12px 14px; border-bottom: 1px solid #f0f2f8; color: #374151; vertical-align: middle; }
        .em-table tr:last-child td { border-bottom: none; }
        .em-table tr:hover td { background: #fafbff; }

        /* ── avatar ── */
        .em-ava { width: 32px; height: 32px; border-radius: 8px; background: #000168; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #b5d4f4; flex-shrink: 0; }
        .em-name-cell { display: flex; align-items: center; gap: 10px; }

        /* ── chips ── */
        .em-role { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 20px; background: #eef2ff; color: #000168; }
        .em-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; }
        .em-status.active  { background: #dcfce7; color: #16a34a; }
        .em-status.locked  { background: #fee2e2; color: #dc2626; }
        .em-status.unknown { background: #f1f5f9; color: #64748b; }
        .em-status i { font-size: 11px; }

        .em-act {
          display: inline-flex; align-items: center; gap: 7px;
          height: 28px; padding: 0 11px 0 9px; border-radius: 8px;
          font-size: 12px; font-weight: 650; letter-spacing: .01em;
          border: 1px solid transparent; white-space: nowrap;
        }
        .em-act-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .em-act.act-active {
          background: #eef2ff; color: #000168; border-color: #c7d2fe;
        }
        .em-act.act-active .em-act-dot { background: #000168; }
        .em-act.act-low {
          background: #fff7ed; color: #9a3412; border-color: #fed7aa;
        }
        .em-act.act-low .em-act-dot { background: #ea580c; }
        .em-act.act-inactive {
          background: #f8fafc; color: #64748b; border-color: #e2e8f0;
        }
        .em-act.act-inactive .em-act-dot { background: #94a3b8; }

        .em-filter-select {
          height: 36px; border: 1px solid #e4e8f2; border-radius: 8px; background: #fff;
          padding: 0 10px; font: inherit; font-size: 12.5px; color: #0d1340; min-width: 150px;
        }

        /* ── badge chip ── */
        .em-badge-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 20px; color: #fff; }

        /* ── timeline ── */
        .em-tl { display: flex; flex-direction: column; }
        .em-tl-row { display: flex; gap: 16px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #f0f2f8; }
        .em-tl-row:last-child { border-bottom: none; }
        .em-tl-icon { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #eef2ff; color: #000168; }
        .em-tl-icon i { font-size: 16px; }
        .em-tl-body { flex: 1; min-width: 0; }
        .em-tl-title { font-size: 13px; font-weight: 600; color: #0d1340; }
        .em-tl-desc  { font-size: 12px; color: #64748b; margin-top: 2px; }
        .em-tl-meta  { font-size: 11px; color: #94a3b8; margin-top: 4px; display: flex; gap: 10px; flex-wrap: wrap; }
        .em-tl-type  { display: inline-flex; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; padding: 2px 7px; border-radius: 4px; background: #eef2ff; color: #000168; }

        /* ── doc ── */
        .em-doc-icon { width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .em-doc-name { font-size: 13px; font-weight: 600; color: #0d1340; }
        .em-doc-meta { font-size: 11px; color: #94a3b8; margin-top: 2px; }

        /* ── buttons ── */
        .em-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; border: 1px solid transparent; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .15s; }
        .em-btn-primary { background: #000168; color: #fff; }
        .em-btn-primary:hover { background: #00009e; }
        .em-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .em-btn-ghost { background: #f0f2f8; color: #374151; }
        .em-btn-ghost:hover { background: #e4e8f2; color: #000168; }
        .em-btn-ghost:disabled { opacity: .6; cursor: not-allowed; }
        .em-btn-danger { background: #fee2e2; color: #dc2626; padding: 6px 12px; font-size: 12px; }
        .em-btn-danger:hover { background: #fecaca; }
        .em-btn-danger:disabled { opacity: .6; cursor: not-allowed; }
        .em-btn-sm {
          height: 30px; padding: 0 10px; border-radius: 7px;
          font-size: 11.5px; font-weight: 600; gap: 5px;
          white-space: nowrap; line-height: 1;
        }
        .em-btn-sm i { font-size: 13px; }
        .em-btn-icon {
          width: 30px; min-width: 30px; height: 30px; padding: 0;
          justify-content: center; border-radius: 7px;
        }
        .em-btn-icon i { font-size: 14px; margin: 0; }
        .em-btn-view { background: #000168; color: #fff; border-color: #000168; }
        .em-btn-view:hover { background: #00009e; border-color: #00009e; }
        .em-btn-lock {
          background: #fff; color: #b91c1c; border-color: #fecaca;
        }
        .em-btn-lock:hover { background: #fef2f2; border-color: #f87171; }
        .em-btn-lock:disabled { opacity: .55; cursor: not-allowed; }
        .em-btn-unlock {
          background: #fff; color: #15803d; border-color: #bbf7d0;
        }
        .em-btn-unlock:hover { background: #f0fdf4; border-color: #86efac; }
        .em-btn-unlock:disabled { opacity: .55; cursor: not-allowed; }

        /* ── empty / skeleton ── */
        .em-empty { text-align: center; padding: 48px 24px; color: #94a3b8; }
        .em-empty i { font-size: 40px; color: #dde3ef; display: block; margin-bottom: 12px; }
        .em-empty p { font-size: 13px; }
        .em-sk { background: linear-gradient(90deg,#f0f2f8 25%,#e8eaf2 50%,#f0f2f8 75%); background-size: 200%; animation: em-sh 1.4s infinite; border-radius: 6px; }
        @keyframes em-sh { 0%{background-position:200%} 100%{background-position:-200%} }

        /* ── MODAL ── */
        .em-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
          animation: em-fade .18s ease;
        }
        @keyframes em-fade { from { opacity: 0 } to { opacity: 1 } }

        .em-modal {
          background: #fff; border-radius: 16px; width: 560px; max-width: calc(100vw - 32px);
          max-height: calc(100dvh - 48px); overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0,0,0,.18);
          animation: em-slide .2s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes em-slide { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

        .em-modal-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 24px 24px 0; border-bottom: 1px solid #f0f2f8; padding-bottom: 16px;
        }
        .em-modal-title { font-size: 17px; font-weight: 700; color: #0d1340; }
        .em-modal-sub   { font-size: 12px; color: #94a3b8; margin-top: 3px; }
        .em-modal-close {
          width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e4e8f2;
          background: #f8f9fc; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #64748b; flex-shrink: 0;
          transition: background .13s, color .13s;
        }
        .em-modal-close:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
        .em-modal-close i { font-size: 15px; }

        .em-modal-body { padding: 20px 24px; }
        .em-modal-foot {
          padding: 16px 24px; border-top: 1px solid #f0f2f8;
          display: flex; justify-content: flex-end; gap: 10px;
        }

        /* ── form elements ── */
        .em-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .em-field { display: flex; flex-direction: column; gap: 6px; }
        .em-label { font-size: 12px; font-weight: 600; color: #374151; }
        .em-req { color: #dc2626; }
        .em-input {
          border: 1px solid #e4e8f2; border-radius: 8px; padding: 9px 12px;
          font-size: 13px; color: #0d1340; background: #fff;
          font-family: 'Inter', sans-serif; outline: none; transition: border-color .15s;
          width: 100%;
        }
        .em-input:focus { border-color: #000168; box-shadow: 0 0 0 3px rgba(0,1,104,.07); }

        .em-info-banner {
          display: flex; align-items: center; gap: 8px;
          background: #eef2ff; border: 1px solid #c7d2fe;
          border-radius: 8px; padding: 10px 14px;
          font-size: 12px; color: #3730a3; margin-top: 16px;
        }
        .em-info-banner i { font-size: 14px; flex-shrink: 0; }

        .em-form-error {
          display: flex; align-items: center; gap: 8px;
          background: #fee2e2; border: 1px solid #fca5a5;
          border-radius: 8px; padding: 10px 14px;
          font-size: 12.5px; color: #dc2626; margin-bottom: 16px;
        }
        .em-form-error i { font-size: 14px; flex-shrink: 0; }

        /* ── permission groups ── */
        .em-perm-hint {
          display: flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: #64748b; margin-top: 4px;
        }
        .em-perm-hint i { font-size: 13px; color: #94a3b8; }
        .em-perm-groups { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
        .em-perm-group-title {
          font-size: 11px; font-weight: 700; color: #94a3b8;
          text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px;
        }
        .em-perms { display: flex; flex-wrap: wrap; gap: 8px; }
        .em-perm-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
          border: 1px solid #e4e8f2; background: #f8f9fc; color: #64748b;
          cursor: pointer; transition: all .13s; user-select: none;
        }
        .em-perm-chip i { font-size: 11px; }
        .em-perm-chip.on { background: #eef2ff; border-color: #a5b4fc; color: #000168; font-weight: 600; }
        .em-perm-chip:hover { border-color: #000168; color: #000168; }

        /* ── success ── */
        .em-success { text-align: center; padding: 32px 16px; }
        .em-success-icon { width: 60px; height: 60px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        .em-success-icon i { font-size: 28px; }
        .em-success-msg { font-size: 16px; font-weight: 700; color: #0d1340; }
        .em-success-sub { font-size: 13px; color: #64748b; margin-top: 6px; }

        @media (max-width: 900px) {
          .em-tab { padding: 7px 12px; font-size: 12px; }
        }
      `}</style>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={loadAll}
        />
      )}

      <EmployeeDetailDrawer
        row={selectedPerf}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedPerf(null); }}
      />

      <div className="em-wrap">
        <div className="em-head">
          <div>
            <div className="em-head-title">
              {lockedOnly ? t('employeesAdmin.titleLocked') : t('employeesAdmin.title')}
            </div>
            <div className="em-head-sub">
              {lockedOnly
                ? t('employeesAdmin.subtitleLocked')
                : t('employeesAdmin.subtitle')}
            </div>
          </div>
          {!lockedOnly && (
            <div className="em-kpis">
              <div className="em-kpi">
                <div className="em-kpi-val">{profiles.length}</div>
                <div className="em-kpi-lbl">{t('closedArchive.total')}</div>
              </div>
              <div className="em-kpi">
                <div className="em-kpi-val">{activeCount}</div>
                <div className="em-kpi-lbl">{t('employeesAdmin.kpiActive')}</div>
              </div>
              <div className="em-kpi locked">
                <div className="em-kpi-val">{lockedCount}</div>
                <div className="em-kpi-lbl">{t('employeesAdmin.kpiLocked')}</div>
              </div>
            </div>
          )}
          {lockedOnly && (
            <div className="em-kpis">
              <div className="em-kpi locked">
                <div className="em-kpi-val">{lockedCount}</div>
                <div className="em-kpi-lbl">{t('employeesAdmin.kpiToUnlock')}</div>
              </div>
            </div>
          )}
          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={exportCurrent} disabled={loading}>
            <i className="ti ti-download" />
            {t('claimsList.export')}
          </button>
        </div>

        <div className="em-shell">
        {lockedOnly && (
          <div className="em-locked-banner" style={{ margin: '16px 18px 0' }}>
            <i className="ti ti-lock" />
            {t('employeesAdmin.lockedBanner')}
          </div>
        )}

        {!lockedOnly && (
        <div className="em-tab-strip">
          {TABS.map(item => (
            <button key={item.id} type="button" className={`em-tab${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>
              <i className={`ti ${item.icon}`} />
              {item.label}
              <span className="em-count">{formatTabCount(item.count, !!item.countLoading)}</span>
            </button>
          ))}
        </div>
        )}

        <div className="em-panel">
        {/* ── Toolbar (profils, badges, documents) ── */}
        {(tab === 'profiles' || (!lockedOnly && (tab === 'badges' || tab === 'documents'))) && (
        <div className="em-toolbar">
          <div className="em-search">
            <i className="ti ti-search" />
            <input
            placeholder={lockedOnly ? t('employeesAdmin.searchLocked') : t('employeesAdmin.searchIn', { tab: TABS.find((item) => item.id === tab)?.label ?? tab })}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }} onClick={() => setSearch('')}>
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            )}
          </div>
          <span className="em-badge-count">
            {tab === 'profiles'  && (lockedOnly ? t('employeesAdmin.lockedCount', { count: filteredProfiles.length }) : t('employeesAdmin.employeeCount', { count: filteredProfiles.length }))}
            {!lockedOnly && tab === 'badges'    && t('employeesAdmin.badgeCount', { count: filteredBadges.length })}
            {!lockedOnly && tab === 'documents' && t('employeesAdmin.documentCount', { count: filteredDocuments.length })}
          </span>

          {tab === 'profiles' && !lockedOnly && (
            <select
              className="em-filter-select"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as 'all' | ActivityStatus)}
              aria-label={t('employeesAdmin.filterActivity')}
            >
              {ACTIVITY_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {tab === 'profiles' && !lockedOnly && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {isPlatformAdmin(user) && accessToken && (
                <CsvImportButton
                  className="em-btn em-btn-ghost"
                  label={t('claimsList.import')}
                  entity="employees"
                  columns={['FullName', 'Email', 'Department', 'Role', 'Poste', 'Equipe']}
                  templateName="employes"
                  summary={(n) => t('employeesAdmin.imported', { count: n })}
                  importFile={async (file) => {
                    const data = await importUsersCsv(accessToken, file);
                    for (const employee of data.users ?? []) {
                      if (!employee.id) continue;
                      try {
                        await adminEmployeeService.updateProfile(accessToken, employee.id, {
                          name: employee.fullName,
                          email: employee.email,
                          role: employee.role,
                          poste: employee.poste || undefined,
                          equipe: employee.equipe || undefined,
                          department: employee.department || undefined,
                        });
                      } catch {
                        /* le compte existe déjà ; le profil sera complété ensuite */
                      }
                    }
                    return { created: data.created, errors: data.errors };
                  }}
                  onImported={() => loadAll()}
                >
                  <i className="ti ti-upload" />
                </CsvImportButton>
              )}
              <button className="em-btn em-btn-primary" onClick={() => setShowCreate(true)}>
                <i className="ti ti-user-plus" />
                {t('employeesAdmin.newEmployee')}
              </button>
            </div>
          )}
        </div>
        )}

        {/* ── Content ── */}
        <>
            {!lockedOnly && tab === 'badges' && !loading && (
              <div className="em-tab-help">
                <i className="ti ti-info-circle" />
                <span>
                  {t('employeesAdmin.badgesHelp1')}{' '}
                  {t('employeesAdmin.badgesHelp2')}
                </span>
              </div>
            )}
            {!lockedOnly && tab === 'performance' && (
              <div className="em-tab-help">
                <i className="ti ti-info-circle" />
                <span>
                  <strong>{t('employeesAdmin.perfDelay')}</strong> : {t('employeesAdmin.perfDelayHelp')}
                  <strong> {t('employeesAdmin.perfLate')}</strong> : {t('employeesAdmin.perfLateHelp')}
                  <strong> {t('employeesAdmin.perfLoad')}</strong> : {t('employeesAdmin.perfLoadHelp')}
                  {' '}{t('employeesAdmin.perfClick')}
                </span>
              </div>
            )}

            {/* PROFILES */}
            {tab === 'profiles' && (
              <>
                {loading && <TableLoadingBanner label={listLoadingLabel} />}
                {loading ? (
                  <div className="em-table-wrap is-loading">
                    <table className="em-table">
                      <thead>
                        <tr>
                          {lockedOnly ? (
                            <>
                              <th>{t('employeesAdmin.colEmployee')}</th><th>{t('employeesAdmin.email')}</th><th>{t('planDetail.department')}</th>
                              <th>{t('employeesAdmin.colAttempts')}</th><th>{t('employeesAdmin.colLockedUntil')}</th><th>{t('common.actions')}</th>
                            </>
                          ) : (
                            <>
                              <th>{t('employeesAdmin.colEmployee')}</th><th>{t('planDetail.details')}</th><th>{t('employeesAdmin.colStatuses')}</th><th>{t('common.actions')}</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <TableSkeleton cols={lockedOnly ? 6 : 4} rows={8} />
                    </table>
                  </div>
                ) : filteredProfiles.length === 0 ? (
                  <Empty
                    icon={lockedOnly ? 'ti-lock' : 'ti-users'}
                    text={lockedOnly ? t('employeesAdmin.emptyLocked') : t('employeesAdmin.empty')}
                  />
                ) : (
                  <>
                    <div className="em-list">
                      {pagedProfiles.map((p: any) => {
                        const name   = p.fullName ?? p.name ?? '—';
                        const locked = Boolean(p.isLockedOut ?? p.locked);
                        const dept   = p.department ?? p.departmentName;
                        const phone  = p.telephone ?? p.phone;
                        const busy   = unlockingId === p.id;

                        if (lockedOnly) {
                          return (
                            <div key={p.id} className="em-list-row is-locked">
                              <div className="em-name-cell">
                                <UserAvatar user={p} name={name} size={36} radius="lg" />
                                <div className="em-list-main">
                                  <div className="em-list-name">{name}</div>
                                  <div className="em-list-email">{p.email ?? '—'}</div>
                                </div>
                              </div>
                              <div className="em-list-meta">
                                {dept && (
                                  <div className="em-list-meta-line">
                                    <i className="ti ti-building" />
                                    <span className="em-list-meta-text">{dept}</span>
                                  </div>
                                )}
                                <div className="em-list-meta-line">
                                  <i className="ti ti-alert-circle" />
                                  <span className="em-list-meta-text">{t('employeesAdmin.attempts', { count: p.accessFailedCount ?? 0 })}</span>
                                </div>
                                <div className="em-list-meta-line">
                                  <i className="ti ti-clock" />
                                  <span className="em-list-meta-text">{fmtLockUntil(p.lockoutEnd)}</span>
                                </div>
                              </div>
                              <div className="em-list-status">
                                <span className="em-status locked">
                                  <i className="ti ti-lock" /> {t('employeesAdmin.locked')}
                                </span>
                              </div>
                              <div className="em-actions">
                                <button
                                  type="button"
                                  className="em-btn em-btn-sm em-btn-unlock"
                                  disabled={busy}
                                  title={t('employeesAdmin.unlock')}
                                  onClick={() => handleUnlock(p.id)}
                                >
                                  <i className={`ti ${busy ? 'ti-loader-2' : 'ti-lock-open'}`} />
                                  {t('employeesAdmin.unlock')}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        const detailBits = [
                          dept,
                          p.poste ? displayCell(p.poste) : null,
                          p.equipe ? displayCell(p.equipe) : null,
                        ].filter(Boolean);

                        return (
                          <div key={p.id} className={`em-list-row${locked ? ' is-locked' : ''}`}>
                            <div className="em-name-cell">
                              <UserAvatar user={p} name={name} size={36} radius="lg" />
                              <div className="em-list-main">
                                <div className="em-list-name">{name}</div>
                                <div className="em-list-email">
                                  {p.email ?? '—'}
                                  {p.role ? ` · ${p.role}` : ''}
                                </div>
                              </div>
                            </div>
                            <div className="em-list-meta">
                              {detailBits.length > 0 && (
                                <div className="em-list-meta-line">
                                  <i className="ti ti-briefcase" />
                                  <span className="em-list-meta-text">{detailBits.join(' · ')}</span>
                                </div>
                              )}
                              {(p.ligneProduction || phone) && (
                                <div className="em-list-meta-line">
                                  <i className={`ti ${p.ligneProduction ? 'ti-topology-star-3' : 'ti-phone'}`} />
                                  <span className="em-list-meta-text">
                                    {[
                                      p.ligneProduction ? displayCell(p.ligneProduction) : null,
                                      phone ? displayCell(phone) : null,
                                    ].filter(Boolean).join(' · ')}
                                  </span>
                                </div>
                              )}
                              {p.accountCreatedAt && (
                                <div className="em-list-meta-line">
                                  <i className="ti ti-calendar" />
                                  <span className="em-list-meta-text">{t('drafts.metaCreated', { date: fmt(p.accountCreatedAt) })}</span>
                                </div>
                              )}
                            </div>
                            <div className="em-list-status">
                              <span
                                className={`em-act act-${activityStatusClass(p.activityStatus)}`}
                                title={t('employeesAdmin.activityStatus')}
                              >
                                <span className="em-act-dot" aria-hidden />
                                {activityStatusLabel(p.activityStatus)}
                              </span>
                            </div>
                            <div className="em-actions">
                              <button
                                type="button"
                                className="em-btn em-btn-sm em-btn-view"
                                title={t('employeesAdmin.viewProfile')}
                                onClick={() => openEmployee(p)}
                              >
                                <i className="ti ti-eye" />
                                {t('closedArchive.view')}
                              </button>
                              {locked ? (
                                <button
                                  type="button"
                                  className="em-btn em-btn-sm em-btn-icon em-btn-unlock"
                                  disabled={busy}
                                  title={t('employeesAdmin.unlockAccount')}
                                  onClick={() => handleUnlock(p.id)}
                                >
                                  <i className={`ti ${busy ? 'ti-loader-2' : 'ti-lock-open'}`} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="em-btn em-btn-sm em-btn-icon em-btn-lock"
                                  disabled={busy}
                                  title={t('employeesAdmin.lockAccount')}
                                  onClick={() => handleLock(p.id)}
                                >
                                  <i className={`ti ${busy ? 'ti-loader-2' : 'ti-lock'}`} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination page={page} total={filteredProfiles.length} pageSize={PAGE_SIZE} onChange={setPage} loading={loading} />
                  </>
                )}
              </>
            )}

            {!lockedOnly && tab === 'badges' && (
              <>
                {loading && <TableLoadingBanner label={listLoadingLabel} />}
                {loading ? (
                  <div className="em-table-wrap is-loading">
                    <table className="em-table">
                      <thead>
                        <tr><th>{t('employeesAdmin.colBadge')}</th><th>{t('employeesAdmin.colEmployee')}</th><th>{t('planDetail.type')}</th><th>{t('claimDetail.description')}</th><th>{t('employeesAdmin.colEarnedOn')}</th><th>{t('common.actions')}</th></tr>
                      </thead>
                      <TableSkeleton cols={6} rows={8} />
                    </table>
                  </div>
                ) : filteredBadges.length === 0 ? (
                  <Empty icon="ti-award" text={t('employeesAdmin.emptyBadges')} />
                ) : (
                  <>
                    <div className="em-table-wrap">
                      <table className="em-table">
                        <thead>
                          <tr><th>{t('employeesAdmin.colBadge')}</th><th>{t('employeesAdmin.colEmployee')}</th><th>{t('planDetail.type')}</th><th>{t('claimDetail.description')}</th><th>{t('employeesAdmin.colEarnedOn')}</th><th>{t('common.actions')}</th></tr>
                        </thead>
                        <tbody>
                          {pagedBadges.map((b: any) => {
                            const color = b.color ?? badgeColor[b.category] ?? '#64748b';
                            return (
                              <tr key={b.id}>
                                <td>
                                  <span className="em-badge-name">
                                    <span className="em-badge-dot" style={{ background: color }} />
                                    {b.name ?? '—'}
                                  </span>
                                </td>
                                <td className="em-badge-emp">{displayCell(b.userName)}</td>
                                <td className="em-badge-type">{displayCell(b.typeLabel ?? formatCategory(b.category))}</td>
                                <td style={{ color: '#64748b', maxWidth: 280 }}>{b.description ?? '—'}</td>
                                <td style={{ color: '#94a3b8', fontSize: 12 }}>{b.earnedAt ? fmt(b.earnedAt) : '—'}</td>
                                <td>
                                  <button className="em-btn em-btn-danger" onClick={async () => {
                                    if (!window.confirm(t('employeesAdmin.confirmRemoveBadge'))) return;
                                    await adminEmployeeService.removeBadge(accessToken!, b.id);
                                    setBadges(prev => prev.filter(x => x.id !== b.id));
                                  }}>
                                    <i className="ti ti-trash" style={{ fontSize: 13 }} /> {t('myActionPlans.remove')}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={page} total={filteredBadges.length} pageSize={PAGE_SIZE} onChange={setPage} loading={loading} />
                  </>
                )}
              </>
            )}

            {/* PERFORMANCE */}
            {!lockedOnly && tab === 'performance' && (
              <EmployeePerformanceTable
                rows={performance}
                loading={perfLoading}
                onRowClick={openPerfDrawer}
              />
            )}

            {/* ACCOUNT HISTORY */}
            {!lockedOnly && tab === 'accountHistory' && (
              <AccountHistoryTable rows={accountHistory} loading={historyLoading} />
            )}

            {/* DOCUMENTS */}
            {!lockedOnly && tab === 'documents' && (
              <>
                <div className="em-tab-help">
                  <i className="ti ti-info-circle" />
                  <span>{t('employeesAdmin.docsHelpBefore')} <strong>{t('qualityHistory.open')}</strong> {t('employeesAdmin.docsHelpAfter')}</span>
                </div>
                {loading && <TableLoadingBanner label={listLoadingLabel} />}
                {loading ? (
                  <div className="em-table-wrap is-loading">
                    <table className="em-table">
                      <thead>
                        <tr><th>{t('employeesAdmin.colDocument')}</th><th>{t('employeesAdmin.colEmployee')}</th><th>{t('planDetail.type')}</th><th>{t('employeesAdmin.colCategory')}</th><th>{t('planView.createdBy')}</th><th>{t('calendar.date')}</th><th>{t('common.actions')}</th></tr>
                      </thead>
                      <TableSkeleton cols={7} rows={8} />
                    </table>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <Empty icon="ti-files" text={t('employeesAdmin.emptyDocuments')} />
                ) : (
                  <>
                    <div className="em-table-wrap">
                      <table className="em-table">
                        <thead>
                          <tr><th>{t('employeesAdmin.colDocument')}</th><th>{t('employeesAdmin.colEmployee')}</th><th>{t('planDetail.type')}</th><th>{t('employeesAdmin.colCategory')}</th><th>{t('planView.createdBy')}</th><th>{t('calendar.date')}</th><th>{t('common.actions')}</th></tr>
                        </thead>
                        <tbody>
                          {pagedDocuments.map((d: any) => {
                            const docId = String(d.id ?? '');
                            const ext   = (d.type ?? 'FILE').toUpperCase();
                            const icon  = ext === 'PDF' ? 'ti-file-type-pdf' : ext === 'DOC' ? 'ti-file-text' : ext === 'XLS' ? 'ti-file-spreadsheet' : ext === 'IMG' ? 'ti-photo' : 'ti-file';
                            const bg    = ext === 'PDF' ? '#fee2e2' : ext === 'DOC' ? '#dbeafe' : ext === 'XLS' ? '#dcfce7' : '#f3e8ff';
                            return (
                              <tr key={docId}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="em-doc-icon" style={{ background: bg, color: '#374151' }}>
                                      <i className={`ti ${icon}`} />
                                    </div>
                                    <div>
                                      <div className="em-doc-name">{d.name ?? '—'}</div>
                                      {d.description && <div className="em-doc-meta">{d.description}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ color: '#64748b' }}>{displayCell(d.userName)}</td>
                                <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color: '#374151' }}>{ext}</span></td>
                                <td style={{ color: '#64748b' }}>{d.category && d.category !== '—' ? d.category : <span className="em-muted">{t('employeesAdmin.badgeCategory.general')}</span>}</td>
                                <td style={{ color: '#64748b' }}>{d.createdBy && d.createdBy !== '—' ? d.createdBy : <span className="em-muted">—</span>}</td>
                                <td style={{ color: '#94a3b8', fontSize: 12 }}>{d.createdAt ? fmt(d.createdAt) : '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="em-btn em-btn-ghost"
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                    disabled={docOpeningId === docId}
                                    onClick={(e) => handleDocOpen(d, e)}
                                  >
                                    <i className={`ti ${docOpeningId === docId ? 'ti-loader-2' : 'ti-download'}`} style={{ fontSize: 13, animation: docOpeningId === docId ? 'em-spin 1s linear infinite' : undefined }} />
                                    {docOpeningId === docId ? t('employeesAdmin.opening') : t('qualityHistory.open')}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={page} total={filteredDocuments.length} pageSize={PAGE_SIZE} onChange={setPage} loading={loading} />
                  </>
                )}
              </>
            )}
        </>
        </div>
        </div>
      </div>
    </>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onChange,
  loading,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
  loading?: boolean;
}) {
  if (total === 0 && !loading) return null;
  return (
    <TablePagination page={page} pageSize={pageSize} total={total} onChange={onChange} loading={loading} />
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="em-empty">
      <i className={`ti ${icon}`} />
      <p>{text}</p>
    </div>
  );
}