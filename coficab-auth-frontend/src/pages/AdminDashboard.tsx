// src/pages/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { archiveActionPlan, getActionPlans } from '../services/actionPlanService';
import {
    createUser,
    deleteUser,
    getPermissions,
    getUsers,
    getDepartments,
    getOrganizations,
    PermissionDto,
    DepartmentDto,
    OrganizationDto,
    resetUserPassword,
    unlockUser,
     lockUser,
    updateUser,
    UserDto,
} from '../services/adminService';
import EmployeeAdminView from './employee/EmployeeAdminView';
import { useTranslation } from 'react-i18next';

const initials = (name: string) =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

const avatarColor = (role: string) => {
  if (role === 'superadmin') return { bg: '#ede9fe', color: '#5b21b6' };
  if (role === 'admin')      return { bg: '#dbeafe', color: '#1d4ed8' };
  return { bg: '#f0fdf4', color: '#15803d' };
};

const roleClass = (role: string) => {
  if (role === 'superadmin') return 'r-sa';
  if (role === 'admin')      return 'r-ad';
  return 'r-us';
};

const ACTION_PLAN_TYPES: Record<number, string> = { 1: 'PA', 2: 'PAC', 3: 'PAP' };
const getTypeLabel = (type: number) => ACTION_PLAN_TYPES[type] ?? '—';

// Reusable banner shown in both create modals in place of the old password field
const AutoPasswordBanner = () => {
  const { t } = useTranslation();
  return (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', background: '#eff6ff',
    border: '1px solid #bfdbfe', borderRadius: 8,
    fontSize: 12, color: '#1d4ed8', marginBottom: 14,
  }}>
    <i className="ti ti-mail-forward" style={{ fontSize: 15, flexShrink: 0 }} />
    {t('usersAdmin.autoPassword')}
  </div>
  );
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');
  const [activeKey, setActiveKey] = useState('users-list');

  const [actionPlans, setActionPlans] = useState<any[]>([]);
  const [archivedActionPlans, setArchivedActionPlans] = useState<any[]>([]);
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationDto[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [selected, setSelected] = useState<UserDto | null>(null);

  // password removed — backend generates it
  const emptyForm = { email: '', fullName: '', department: '', organizationId: '', role: 'user', permissions: [] as string[] };
  const [form, setForm] = useState(emptyForm);
  const [newPassword, setNewPassword] = useState('');

  const [employeeView, setEmployeeView] = useState<'list' | 'detail'>('list');
  const [selectedEmployee, setSelectedEmployee] = useState<UserDto | null>(null);
  const isSuperAdmin =
    user?.role === 'superadmin' ||
    (Array.isArray(user?.role) && (user?.role as string[]).includes('superadmin'));

  const [searchParams] = useSearchParams();

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([getUsers(accessToken!), getPermissions(accessToken!)]);
      setUsers(u);
      setPermissions(p);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const depts = await getDepartments(accessToken!);
      setDepartments(depts);
    } catch (error) {
      console.error('Failed to load departments:', error);
      setDepartments([]);
    } finally {
      setLoadingDepartments(false);
    }
  };

  const loadOrganizations = async () => {
    setLoadingOrganizations(true);
    try {
      const orgs = await getOrganizations(accessToken!);
      setOrganizations(orgs);
    } catch (error) {
      console.error('Failed to load organizations:', error);
      setOrganizations([]);
    } finally {
      setLoadingOrganizations(false);
    }
  };

  const loadActionPlans = async () => {
    setLoadingPlans(true);
    try {
      const response = await getActionPlans(accessToken!);
      const all = response.data;
      setActionPlans(all.filter((p: any) => p.status !== 4));
      setArchivedActionPlans(all.filter((p: any) => p.status === 4));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'action-plans') {
      setActiveKey('action-plans');
      loadActionPlans();
    } else if (section === 'employees') {
      setActiveKey('employees');
      loadData();
    } else {
      setActiveKey('users-list');
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [searchParams]);

  useEffect(() => {
    if ((showCreate || showCreateEmployee || showEdit) && accessToken) {
      loadDepartments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [showCreate, showCreateEmployee, showEdit, accessToken]);

  useEffect(() => {
    if ((showCreate || showEdit) && accessToken) {
      loadOrganizations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [showCreate, showEdit, accessToken]);

  const handleCreateEmployee = async () => {
    try {
      await createUser(accessToken!, { ...form, role: 'user', permissions: [] });
      setShowCreateEmployee(false);
      setForm(emptyForm);
      setFeedback(t('usersAdmin.employeeCreated'));
      loadData();
    } catch (e: any) {
      alert(e.response?.data || t('employeesAdmin.createFailed'));
    }
  };

  const handleCreate = async () => {
    if (missingOrgDept) { alert(t('usersAdmin.orgDeptRequired')); return; }
    try {
      await createUser(accessToken!, form);
      setShowCreate(false);
      setForm(emptyForm);
      setFeedback(t('usersAdmin.adminCreated'));
      loadData();
    } catch (e: any) {
      alert(e.response?.data || t('employeesAdmin.createFailed'));
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    if (missingOrgDept) { alert(t('usersAdmin.orgDeptRequired')); return; }
    try {
      await updateUser(accessToken!, selected.id, {
        fullName: form.fullName,
        department: form.department,
        organizationId: form.organizationId,
        role: form.role,
        permissions: form.permissions,
      });
      setShowEdit(false);
      setFeedback(t('usersAdmin.adminUpdated'));
      loadData();
    } catch (e: any) {
      alert(e.response?.data || e.message || t('planDetail.updateError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('usersAdmin.confirmDelete'))) return;
    try {
      await deleteUser(accessToken!, id);
      setFeedback(t('usersAdmin.adminDeleted'));
      loadData();
    } catch {
      setFeedback(t('usersAdmin.deleteFailed'));
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    try {
      await resetUserPassword(accessToken!, selected.id, newPassword);
      setShowReset(false);
      setFeedback(t('usersAdmin.passwordReset'));
    } catch {
      setFeedback(t('usersAdmin.resetFailed'));
    }
  };

  const handleUnlock = async (id: string) => {
    try {
      await unlockUser(accessToken!, id);
      setFeedback(t('usersAdmin.unlocked'));
      loadData();
    } catch {
      setFeedback(t('usersAdmin.unlockFailed'));
    }
  };
const handleLock = async (id: string) => {
  if (!window.confirm(t('usersAdmin.confirmLock'))) return;
  try {
    await lockUser(accessToken!, id);
    setFeedback(t('usersAdmin.locked'));
    loadData();
  } catch {
    setFeedback(t('usersAdmin.lockFailed'));
  }
};
  const handleArchivePlan = async (id: string) => {
    if (!window.confirm(t('usersAdmin.confirmArchive'))) return;
    try {
      await archiveActionPlan(accessToken!, id);
      setFeedback(t('usersAdmin.planArchived'));
      loadActionPlans();
    } catch (error) {
      console.error(error);
      setFeedback(t('usersAdmin.archiveFailed'));
    }
  };

  const goToPlanDetail = (id: string) => navigate(`/admin/action-plans/${id}`);

  const openEdit = (u: UserDto) => {
    setSelected(u);
    setForm({ email: u.email, fullName: u.fullName, department: u.department, organizationId: u.organizationId ?? '', role: u.roles[0] ?? 'user', permissions: u.permissions });
    setShowEdit(true);
  };

  const togglePerm = (name: string) =>
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(name)
        ? f.permissions.filter(p => p !== name)
        : [...f.permissions, name],
    }));

  const lockedOnly = searchParams.get('locked') === '1';
  const adminUsers = users.filter(
    (u) =>
      u.roles.some((r) => ['admin', 'superadmin'].includes(r)) &&
      (!lockedOnly || u.isLockedOut),
  );
  const employeeUsers = users.filter(u => !u.roles.some(r => ['admin','superadmin'].includes(r)));

  const groupedPerms = permissions.reduce((acc, p) => {
    if (!acc[p.appId]) acc[p.appId] = [];
    acc[p.appId].push(p);
    return acc;
  }, {} as Record<string, PermissionDto[]>);

  const displayedActionPlans = showArchivedPlans ? archivedActionPlans : actionPlans;

  // an administrator (admin or superadmin) works for one organization and in one of its departments
  const needsOrg = form.role === 'admin' || form.role === 'superadmin';
  const missingOrgDept = needsOrg && (!form.organizationId || !form.department);
  const departmentOptions = needsOrg && form.organizationId
    ? departments.filter(d => d.organizationId === form.organizationId)
    : departments;

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

        @keyframes ad-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in-scale { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes slide-in-right { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ring-draw { from { stroke-dashoffset: 163.36; } to { stroke-dashoffset: var(--target-offset, 0); } }
        .sk { background: #e8ecf4; border-radius: 6px; animation: ad-pulse 1.5s ease-in-out infinite; }
        .sk-r { height: 11px; margin-bottom: 8px; }
        .sk-c { border-radius: 50%; }
        .sk-kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 18px; }
        .sk-kpi { background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .sk-tcard { background: var(--white); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .sk-thead { padding: 14px 20px; border-bottom: 1px solid var(--border2); display: flex; align-items: center; justify-content: space-between; }
        .sk-row { padding: 14px 20px; border-bottom: 1px solid var(--border2); display: flex; align-items: center; gap: 12px; }
        .sk-row:last-child { border-bottom: none; }
        .sk-ava { width: 30px; height: 30px; flex-shrink: 0; }

        .ad-kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 24px; }
        .ad-kpi { 
          background: var(--white); border: 1px solid var(--border); border-radius: 16px; 
          padding: 20px; display: flex; align-items: center; gap: 16px; 
          position: relative; overflow: hidden; 
          transition: all .25s ease;
          animation: fade-in-up .5s ease-out both;
        }
        .ad-kpi:nth-child(1) { animation-delay: .1s; }
        .ad-kpi:nth-child(2) { animation-delay: .2s; }
        .ad-kpi:nth-child(3) { animation-delay: .3s; }
        .ad-kpi:nth-child(4) { animation-delay: .4s; }
        .ad-kpi:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 8px 24px rgba(0,0,0,.08); 
          border-color: #d1d5db;
        }
        .ad-kpi-ring-wrap { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
        .ad-kpi-ring-bg { fill: none; stroke: var(--bg); stroke-width: 5; }
        .ad-kpi-ring-fill { fill: none; stroke-width: 5; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; stroke-dasharray: 163.36; stroke-dashoffset: 163.36; animation: ring-draw 1.2s cubic-bezier(.4,0,.2,1) .6s forwards; }
        .ad-kpi-ring-inner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .ad-kpi-ring-inner i { font-size: 18px; }
        .ad-kpi-info { display: flex; flex-direction: column; gap: 3px; flex: 1; }
        .ad-kpi-val { font-size: 28px; font-weight: 800; letter-spacing: -1px; line-height: 1; font-family: var(--font-head); }
        .ad-kpi-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); font-weight: 600; }
        .ad-kpi-sub { font-size: 10px; color: var(--subtle); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
        .ad-kpi-sub i { font-size: 10px; }
        .ad-kpi-trend { position: absolute; top: 14px; right: 14px; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 12px; }

        .ad-tcard { background: var(--white); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; animation: fade-in-up .5s ease-out .5s both; }
        .ad-th-bar { padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border2); }
        .ad-th-left { display: flex; align-items: center; gap: 8px; }
        .ad-th-title { font-family: var(--font-head); font-size: 13px; font-weight: 700; color: var(--navy); }
        .ad-th-pill { background: var(--bg); border: 1px solid var(--border); border-radius: 20px; padding: 2px 9px; font-size: 10px; color: var(--muted); font-weight: 500; }
        .ad-th-right { display: flex; align-items: center; gap: 8px; }
        .ad-srch { display: flex; align-items: center; gap: 6px; background: #f8f9fc; border: 1px solid var(--border); border-radius: 8px; padding: 7px 11px; transition: border .15s; }
        .ad-srch:focus-within { border-color: var(--navy); }
        .ad-srch i { font-size: 13px; color: var(--subtle); }
        .ad-srch input { background: none; border: none; outline: none; font-size: 12px; color: var(--text); width: 160px; font-family: var(--font-body); }
        .ad-fbt { display: flex; align-items: center; gap: 5px; padding: 7px 12px; background: #f8f9fc; border: 1px solid var(--border); border-radius: 8px; font-size: 11px; color: var(--muted); cursor: pointer; font-weight: 500; transition: color .15s; font-family: var(--font-body); }
        .ad-fbt i { font-size: 13px; }
        .ad-fbt:hover { color: var(--navy); }

        .ad-tcard table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .ad-tcard thead th { padding: 10px 16px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--subtle); background: #f8f9fc; border-bottom: 1px solid var(--border2); }
        .ad-tcard tbody td { padding: 12px 16px; border-bottom: 1px solid var(--border2); font-size: 12px; color: var(--text2); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .15s; }
        .ad-tcard tbody tr:last-child td { border-bottom: none; }
        .ad-tcard tbody tr:hover td { color: var(--navy); }

        .ad-ucell { display: flex; align-items: center; gap: 9px; }
        .ad-uava { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .ad-uname { font-size: 12px; font-weight: 600; color: var(--text); }
        .ad-uemail { font-size: 10px; color: var(--subtle); }

        .ad-rpill { display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
        .r-sa { background: #ede9fe; color: #5b21b6; }
        .r-ad { background: #dbeafe; color: #1d4ed8; }
        .r-us { background: #f0fdf4; color: #15803d; }

        .ad-stat { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; }
        .ad-dot  { width: 6px; height: 6px; border-radius: 50%; }
        .s-on .ad-dot { background: #16a34a; } .s-on { color: #15803d; }
        .s-off .ad-dot { background: #dc2626; } .s-off { color: #b91c1c; }

        .ad-ptag { display: inline-block; border-radius: 12px; padding: 2px 9px; font-size: 10px; font-weight: 500; }
        .pt-0 { background: #f8fafc; border: 1px solid var(--border); color: var(--subtle); }
        .pt-n { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }

        .ad-acts { display: flex; gap: 0px; align-items: center; justify-content: center; opacity: 0.55; transition: opacity .2s ease; }
        .ad-tcard tbody tr:hover .ad-acts { opacity: 1; }
        .ad-ab { 
          display: inline-flex; align-items: center; justify-content: center; 
          width: 26px; height: 26px; border-radius: 6px; 
          font-size: 12px; cursor: pointer; border: none; 
          background: transparent; color: var(--subtle); 
          transition: all .15s cubic-bezier(.4,0,.2,1); 
        }
        .ad-ab:hover { background: var(--bg); transform: scale(1.08); }
        .ab-e:hover { color: #2563eb; background: #eff6ff; }
        .ab-r:hover { color: #d97706; background: #fffbeb; }
        .ab-d:hover { color: #dc2626; background: #fef2f2; }
        .ab-u:hover { color: #16a34a; background: #f0fdf4; }
        .ab-l:hover { color: #d97706; background: #fffbeb; }
        .ad-ab i { font-size: 15px; }

        .ad-alert { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; margin-bottom: 18px; font-size: 12px; color: #15803d; }
        .ad-alert i { font-size: 15px; }
        .ad-alert-x { margin-left: auto; background: none; border: none; cursor: pointer; color: #16a34a; display: flex; }

        .ad-overlay { position: fixed; inset: 0; background: rgba(0,0,30,.35); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .ad-modal { background: var(--white); border-radius: 14px; width: 560px; max-height: 88vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,.18); }
        .ad-modal-sm { width: 420px; }
        .ad-mhead { padding: 22px 26px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: var(--white); z-index: 10; }
        .ad-mtitle { font-family: var(--font-head); font-size: 15px; font-weight: 700; color: var(--navy); }
        .ad-mclose { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 4px; transition: color .15s; }
        .ad-mclose:hover { color: var(--navy); }
        .ad-mbody { padding: 22px 26px; }
        .ad-mfoot { padding: 14px 26px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; position: sticky; bottom: 0; background: var(--white); }

        .ad-frow { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .ad-fg { margin-bottom: 14px; }
        .ad-fg:last-child { margin-bottom: 0; }
        .ad-lbl { display: block; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 5px; }
        .ad-inp { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: 7px; font-size: 13px; font-family: var(--font-body); color: var(--text); outline: none; background: var(--bg); transition: border-color .15s, background .15s; }
        .ad-inp:focus { border-color: var(--navy); background: var(--white); }
        .ad-sel { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: 7px; font-size: 13px; font-family: var(--font-body); color: var(--text); outline: none; background: var(--bg); cursor: pointer; }
        .ad-sel:focus { border-color: var(--navy); }

        .ad-pg { margin-bottom: 14px; }
        .ad-pg-title { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--navy); margin-bottom: 7px; padding-bottom: 5px; border-bottom: 1px solid var(--border); }
        .ad-pg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .ad-pi { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1.5px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 11px; color: var(--text2); transition: border-color .15s, color .15s; }
        .ad-pi:hover { border-color: var(--navy); color: var(--navy); }
        .ad-pi.sel { border-color: var(--navy); color: var(--navy); font-weight: 600; background: var(--navy-light); }
        .ad-pi-ck { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; transition: background .15s, border .15s; }

        .ad-btn { padding: 9px 18px; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; font-family: var(--font-head); transition: all .15s; }
        .btn-primary { background: var(--navy); color: #fff; }
        .btn-primary:hover { background: var(--navy-mid); }
        .btn-ghost { background: var(--bg); color: var(--text2); border: 1px solid var(--border); }
        .btn-ghost:hover { background: var(--border); }

        .ad-pp-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        .ad-pp-card { background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
        .ad-pp-ctitle { font-family: var(--font-head); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); margin-bottom: 10px; padding-bottom: 7px; border-bottom: 1px solid var(--border); }
        .ad-pp-tag { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; color: var(--text2); margin: 3px; }
        .ad-pp-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }

        .ad-page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; animation: fade-in-up .5s ease-out; }
        .ad-page-tabs { animation: fade-in-up .5s ease-out .1s both; }
        .ad-alert { animation: fade-in-scale .4s ease-out .15s both; }
        .ad-page-title { font-family: var(--font-head); font-size: 20px; font-weight: 700; color: var(--navy); }
        .ad-page-tabs { display: flex; gap: 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
        .ad-tab { padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; background: none; color: var(--muted); font-family: var(--font-body); transition: all .15s; }
        .ad-tab.active { background: var(--white); color: var(--navy); box-shadow: 0 1px 3px rgba(0,0,0,.1); }

        .ad-tb-add { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--navy); color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; font-family: var(--font-body); }
        .ad-tb-add i { font-size: 15px; }
        .ad-tb-add:hover { background: var(--navy-mid); }

        .ad-ap-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; font-family: var(--font-body); }
        .ad-ap-btn i { font-size: 15px; }
        .ad-ap-btn:hover { background: #b91c1c; }

        .ad-archive-toggle {
          display: flex; align-items: center; gap: 6px; padding: 8px 16px;
          border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
          border: 1px solid var(--border); background: #f8f9fc; color: var(--text2);
          transition: all .15s; font-family: var(--font-body);
        }
        .ad-archive-toggle.active { background: #1f2937; color: #fff; border-color: #1f2937; }
        .ad-archive-toggle i { font-size: 14px; }

        .ad-tcard th:nth-child(1){width:32%}
        .ad-tcard th:nth-child(2){width:15%}
        .ad-tcard th:nth-child(3){width:12%}
        .ad-tcard th:nth-child(4){width:12%}
        .ad-tcard th:nth-child(5){width:8%}
        .ad-tcard th:nth-child(6){width:90px}

        @media (max-width:1100px) {
          .ad-kpis { grid-template-columns: repeat(2,1fr); }
          .ad-pp-grid { grid-template-columns: repeat(2,1fr); }
        }
      `}</style>

      <div style={{ padding: '0px 24px 20px', overflowY: 'auto', height: '100%', fontFamily: 'var(--font-body)', background: 'var(--bg)' }}>
        <div className="ad-page-header">
          <div className="ad-page-title">
            {lockedOnly ? t('usersAdmin.titleLocked') : activeKey === 'employees' ? t('frontNav.footerEmployees') : activeKey.startsWith('perms') ? t('employeesAdmin.permissions') : activeKey === 'action-plans' ? t('usersAdmin.titlePlans') : t('usersAdmin.titleAdmins')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isSuperAdmin && activeKey === 'users-list' && (
              <button className="ad-tb-add" onClick={() => { setForm(emptyForm); setShowCreate(true); }}>
                <i className="ti ti-user-plus" /> {t('usersAdmin.createAdmin')}
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="ad-alert">
            <i className="ti ti-circle-check" />
            {feedback}
            <button className="ad-alert-x" onClick={() => setFeedback('')}><i className="ti ti-x" /></button>
          </div>
        )}

        {loading && (
          <>
            <div className="sk-kpis">
              {[0,1,2,3].map(i => (
                <div key={i} className="sk-kpi">
                  <div className="sk sk-c" style={{ width: 36, height: 36, marginBottom: 12 }} />
                  <div className="sk sk-r" style={{ width: '40%' }} />
                  <div className="sk sk-r" style={{ width: '60%', height: 22, marginBottom: 6 }} />
                  <div className="sk sk-r" style={{ width: '80%' }} />
                </div>
              ))}
            </div>
            <div className="sk-tcard">
              <div className="sk-thead">
                <div className="sk sk-r" style={{ width: 160, margin: 0 }} />
                <div className="sk sk-r" style={{ width: 200, margin: 0 }} />
              </div>
              {[0,1,2,3,4].map(i => (
                <div key={i} className="sk-row">
                  <div className="sk sk-ava sk-c" />
                  <div style={{ flex: 1 }}>
                    <div className="sk sk-r" style={{ width: '55%', marginBottom: 5 }} />
                    <div className="sk sk-r" style={{ width: '40%' }} />
                  </div>
                  <div className="sk sk-r" style={{ width: 60, margin: 0 }} />
                  <div className="sk sk-r" style={{ width: 50, margin: 0 }} />
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && activeKey === 'users-list' && (
          <>
            <div className="ad-kpis">
              <div className="ad-kpi">
                <div className="ad-kpi-ring-wrap">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                    <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#000168"
                      style={{ '--target-offset': `${2 * Math.PI * 26 * (1 - Math.min(adminUsers.length / 10, 1))}` } as React.CSSProperties} />
                  </svg>
                  <div className="ad-kpi-ring-inner"><i className="ti ti-users" style={{ color: '#000168' }} /></div>
                </div>
                <div className="ad-kpi-info">
                  <div className="ad-kpi-val" style={{ color: '#000168' }}>{adminUsers.length}</div>
                  <div className="ad-kpi-lbl">{t('usersAdmin.kpiTotalAdmins')}</div>
                  <div className="ad-kpi-sub"><i className="ti ti-shield" /> {t('usersAdmin.subAdmins')}</div>
                </div>
                <span className="ad-kpi-trend" style={{ background: '#E6F1FB', color: '#0C447C' }}>+{adminUsers.length}</span>
              </div>
              <div className="ad-kpi">
                <div className="ad-kpi-ring-wrap">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                    <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#16a34a"
                      style={{ '--target-offset': `${2 * Math.PI * 26 * (1 - (adminUsers.length > 0 ? (adminUsers.filter(u => !u.isLockedOut).length / adminUsers.length) : 0))}` } as React.CSSProperties} />
                  </svg>
                  <div className="ad-kpi-ring-inner"><i className="ti ti-circle-check" style={{ color: '#16a34a' }} /></div>
                </div>
                <div className="ad-kpi-info">
                  <div className="ad-kpi-val" style={{ color: '#15803d' }}>{adminUsers.filter(u => !u.isLockedOut).length}</div>
                  <div className="ad-kpi-lbl">{t('usersAdmin.kpiActive')}</div>
                  <div className="ad-kpi-sub"><i className="ti ti-check" /> {t('usersAdmin.subOperational')}</div>
                </div>
                <span className="ad-kpi-trend" style={{ background: '#f0fdf4', color: '#15803d' }}>100%</span>
              </div>
              <div className="ad-kpi">
                <div className="ad-kpi-ring-wrap">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                    <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#dc2626"
                      style={{ '--target-offset': `${2 * Math.PI * 26 * (1 - (adminUsers.length > 0 ? (adminUsers.filter(u => u.isLockedOut).length / adminUsers.length) : 0))}` } as React.CSSProperties} />
                  </svg>
                  <div className="ad-kpi-ring-inner"><i className="ti ti-lock" style={{ color: '#dc2626' }} /></div>
                </div>
                <div className="ad-kpi-info">
                  <div className="ad-kpi-val" style={{ color: '#b91c1c' }}>{adminUsers.filter(u => u.isLockedOut).length}</div>
                  <div className="ad-kpi-lbl">{t('usersAdmin.kpiLocked')}</div>
                  <div className="ad-kpi-sub"><i className="ti ti-shield-check" /> {t('usersAdmin.subNoLock')}</div>
                </div>
                <span className="ad-kpi-trend" style={{ background: '#fef2f2', color: '#b91c1c' }}>{adminUsers.filter(u => u.isLockedOut).length}</span>
              </div>
              <div className="ad-kpi">
                <div className="ad-kpi-ring-wrap">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                    <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#7c3aed"
                      style={{ '--target-offset': `${2 * Math.PI * 26 * (1 - Math.min(adminUsers.filter(u => u.roles.includes('superadmin')).length / 3, 1))}` } as React.CSSProperties} />
                  </svg>
                  <div className="ad-kpi-ring-inner"><i className="ti ti-crown" style={{ color: '#7c3aed' }} /></div>
                </div>
                <div className="ad-kpi-info">
                  <div className="ad-kpi-val" style={{ color: '#5b21b6' }}>{adminUsers.filter(u => u.roles.includes('superadmin')).length}</div>
                  <div className="ad-kpi-lbl">{t('usersAdmin.kpiSuperadmins')}</div>
                  <div className="ad-kpi-sub"><i className="ti ti-crown" /> {t('usersAdmin.subFullAccess')}</div>
                </div>
                <span className="ad-kpi-trend" style={{ background: '#ede9fe', color: '#5b21b6' }}>×{adminUsers.filter(u => u.roles.includes('superadmin')).length}</span>
              </div>
            </div>

            <div className="ad-tcard">
              <div className="ad-th-bar">
                <div className="ad-th-left">
                  <span className="ad-th-title">{t('usersAdmin.adminList')}</span>
                  <span className="ad-th-pill">{t('usersAdmin.entries', { count: adminUsers.length })}</span>
                </div>
                <div className="ad-th-right">
                  <div className="ad-srch">
                    <i className="ti ti-search" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('usersAdmin.search')} />
                  </div>
                  <button className="ad-fbt"><i className="ti ti-adjustments-horizontal" /> {t('usersAdmin.filter')}</button>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>{t('usersAdmin.colAdmin')}</th><th>{t('usersAdmin.colDept')}</th><th>{t('employeesAdmin.role')}</th>
                    <th>{t('common.status')}</th><th>{t('usersAdmin.colPerms')}</th><th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.filter(u =>
                    [u.fullName, u.email, u.department].some(v =>
                      v.toLowerCase().includes(search.toLowerCase())
                    )
                  ).map(u => {
                    const ac = avatarColor(u.roles[0] ?? 'user');
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="ad-ucell">
                            <div className="ad-uava" style={{ background: ac.bg, color: ac.color }}>
                              {initials(u.fullName)}
                            </div>
                            <div>
                              <div className="ad-uname">{u.fullName}</div>
                              <div className="ad-uemail">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.department}</td>
                        <td>
                          <span className={`ad-rpill ${roleClass(u.roles[0] ?? 'user')}`}>
                            {u.roles[0] ?? 'user'}
                          </span>
                        </td>
                        <td>
                          <span className={`ad-stat ${u.isLockedOut ? 's-off' : 's-on'}`}>
                            <span className="ad-dot" />
                            {u.isLockedOut ? t('employeesAdmin.locked') : t('activity.active')}
                          </span>
                        </td>
                        <td>
                          <span className={`ad-ptag ${u.permissions.length ? 'pt-n' : 'pt-0'}`}>
                            {u.permissions.length}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="ad-acts" style={{ justifyContent: 'center' }}>
                            <button className="ad-ab ab-e" onClick={() => openEdit(u)} title={t('common.edit')}><i className="ti ti-pencil" /></button>
                            <button className="ad-ab ab-r" onClick={() => { setSelected(u); setNewPassword(''); setShowReset(true); }} title={t('usersAdmin.resetPassword')}><i className="ti ti-key" /></button>
                           {u.isLockedOut ? (
  <button className="ad-ab ab-u" onClick={() => handleUnlock(u.id)} title={t('employeesAdmin.unlock')}>
    <i className="ti ti-lock-open" />
  </button>
) : (
  <button className="ad-ab ab-l" onClick={() => handleLock(u.id)} title={t('employeesAdmin.lockAccount')}>
    <i className="ti ti-lock" />
  </button>
)}
                            {isSuperAdmin && (
                              <button className="ad-ab ab-d" onClick={() => handleDelete(u.id)} title={t('common.delete')}><i className="ti ti-trash" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && activeKey.startsWith('perms') && (
          <>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 18, fontSize: 13, color: 'var(--muted)' }}>
              {t('usersAdmin.permsIntro')}
            </div>
            <div className="ad-pp-grid">
              {Object.entries(groupedPerms).map(([appId, perms]) => (
                <div key={appId} className="ad-pp-card">
                  <div className="ad-pp-ctitle">{appId}</div>
                  {perms.map(p => (
                    <span key={p.id} className="ad-pp-tag">
                      <span className="ad-pp-dot" />{p.displayName}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && activeKey === 'action-plans' && (
          <div className="ad-tcard" style={{ marginTop: 0 }}>
            <div className="ad-th-bar">
              <div className="ad-th-left">
                <span className="ad-th-title">{t('usersAdmin.titlePlans')}</span>
                <span className="ad-th-pill">
                  {showArchivedPlans ? t('usersAdmin.archivedPlans', { count: displayedActionPlans.length }) : t('usersAdmin.plans', { count: displayedActionPlans.length })}
                </span>
              </div>
              <div className="ad-th-right">
                <button
                  className={`ad-archive-toggle ${showArchivedPlans ? 'active' : ''}`}
                  onClick={() => setShowArchivedPlans(v => !v)}
                >
                  <i className={`ti ${showArchivedPlans ? 'ti-list' : 'ti-archive'}`} />
                  {showArchivedPlans ? t('usersAdmin.viewActive') : t('usersAdmin.archivedCount', { count: archivedActionPlans.length })}
                </button>
                {!showArchivedPlans && (
                  <button className="ad-tb-add" onClick={() => navigate('/admin/action-plans/create')}>
                    <i className="ti ti-file-plus" /> {t('usersAdmin.newPlan')}
                  </button>
                )}
              </div>
            </div>

            {loadingPlans ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {t('usersAdmin.loading')}
              </div>
            ) : displayedActionPlans.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>{t('drafts.fieldTitle')}</th><th>{t('planDetail.type')}</th><th>{t('common.status')}</th>
                    <th>{t('planDetail.department')}</th><th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedActionPlans.map((plan: any) => (
                    <tr key={plan.id}>
                      <td style={{ fontWeight: 600 }}>{plan.title}</td>
                      <td>{getTypeLabel(plan.type)}</td>
                      <td>
                        <span className={`ad-rpill ${
                          plan.status === 1 ? 'r-us' :
                          plan.status === 2 ? 'r-ad' :
                          plan.status === 3 ? 'r-sa' : ''
                        }`}>
                          {plan.status === 1 ? t('planView.statusDraft') :
                           plan.status === 2 ? t('planView.statusOngoing') :
                           plan.status === 3 ? t('planView.statusDone') :
                           plan.status === 4 ? t('planView.statusArchived') : '—'}
                        </span>
                      </td>
                      <td>{plan.departmentName || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="ad-acts" style={{ justifyContent: 'center' }}>
                          <button className="ad-ab ab-e" onClick={() => goToPlanDetail(plan.id)} title={t('closedArchive.view')}><i className="ti ti-eye" /></button>
                          {!showArchivedPlans && (
                            <button className="ad-ab ab-d" onClick={() => handleArchivePlan(plan.id)} title={t('alerts.archive')}><i className="ti ti-archive" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <i className="ti ti-file-off" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: .4 }} />
                {showArchivedPlans ? t('usersAdmin.noArchived') : t('usersAdmin.noPlans')}
                {!showArchivedPlans && (
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--subtle)' }}>
                    {t('usersAdmin.noPlansHint')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && activeKey === 'employees' && (
          <>
            {employeeView === 'list' ? (
              <>
                <div className="ad-kpis">
                  <div className="ad-kpi">
                    <div className="ad-kpi-ring-wrap">
                      <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                        <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#16a34a"
                          style={{ '--target-offset': `${2 * Math.PI * 26 * (1 - Math.min(employeeUsers.length / 50, 1))}` } as React.CSSProperties} />
                      </svg>
                      <div className="ad-kpi-ring-inner"><i className="ti ti-users" style={{ color: '#16a34a' }} /></div>
                    </div>
                    <div className="ad-kpi-info">
                      <div className="ad-kpi-val" style={{ color: '#15803d' }}>{employeeUsers.length}</div>
                      <div className="ad-kpi-lbl">{t('usersAdmin.kpiEmployees')}</div>
                    </div>
                  </div>
                  <div className="ad-kpi">
                    <div className="ad-kpi-ring-wrap">
                      <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                        <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#7c3aed"
                          style={{ '--target-offset': `${2 * Math.PI * 26}` } as React.CSSProperties} />
                      </svg>
                      <div className="ad-kpi-ring-inner"><i className="ti ti-award" style={{ color: '#7c3aed' }} /></div>
                    </div>
                    <div className="ad-kpi-info">
                      <div className="ad-kpi-val" style={{ color: '#5b21b6' }}>—</div>
                      <div className="ad-kpi-lbl">{t('usersAdmin.kpiBadges')}</div>
                    </div>
                  </div>
                  <div className="ad-kpi">
                    <div className="ad-kpi-ring-wrap">
                      <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                        <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#0066cc"
                          style={{ '--target-offset': `${2 * Math.PI * 26}` } as React.CSSProperties} />
                      </svg>
                      <div className="ad-kpi-ring-inner"><i className="ti ti-files" style={{ color: '#0066cc' }} /></div>
                    </div>
                    <div className="ad-kpi-info">
                      <div className="ad-kpi-val" style={{ color: '#0066cc' }}>—</div>
                      <div className="ad-kpi-lbl">{t('usersAdmin.kpiDocuments')}</div>
                    </div>
                  </div>
                  <div className="ad-kpi">
                    <div className="ad-kpi-ring-wrap">
                      <svg width="64" height="64" viewBox="0 0 64 64">
                        <circle className="ad-kpi-ring-bg" cx="32" cy="32" r="26" />
                        <circle className="ad-kpi-ring-fill" cx="32" cy="32" r="26" stroke="#f59e0b"
                          style={{ '--target-offset': `${2 * Math.PI * 26}` } as React.CSSProperties} />
                      </svg>
                      <div className="ad-kpi-ring-inner"><i className="ti ti-clock" style={{ color: '#f59e0b' }} /></div>
                    </div>
                    <div className="ad-kpi-info">
                      <div className="ad-kpi-val" style={{ color: '#f59e0b' }}>—</div>
                      <div className="ad-kpi-lbl">{t('usersAdmin.kpiTimeline')}</div>
                    </div>
                  </div>
                </div>

                <div className="ad-tcard">
                  <div className="ad-th-bar">
                    <div className="ad-th-left">
                      <span className="ad-th-title">{t('usersAdmin.employeeList')}</span>
                      <span className="ad-th-pill">{t('employeesAdmin.employeeCount', { count: employeeUsers.length })}</span>
                    </div>
                    <div className="ad-th-right">
                      <div className="ad-srch">
                        <i className="ti ti-search" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('calendar.searchEmployee')} />
                      </div>
                      <button className="ad-fbt"><i className="ti ti-adjustments-horizontal" /> {t('usersAdmin.filter')}</button>
                      <button className="ad-tb-add" style={{ background: '#15803d' }} onClick={() => { setForm({...emptyForm, role: 'user'}); setShowCreateEmployee(true); }}>
                        <i className="ti ti-user-plus" /> {t('employeesAdmin.newEmployee')}
                      </button>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('employeesAdmin.colEmployee')}</th><th>{t('usersAdmin.colDept')}</th><th>{t('employeesAdmin.role')}</th><th>{t('common.status')}</th><th style={{ textAlign: 'center' }}>{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeUsers.filter(u =>
                        [u.fullName, u.email, u.department].some(v =>
                          v.toLowerCase().includes(search.toLowerCase())
                        )
                      ).map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="ad-ucell">
                              <div className="ad-uava" style={{ background: '#f0fdf4', color: '#15803d' }}>
                                {initials(u.fullName)}
                              </div>
                              <div>
                                <div className="ad-uname">{u.fullName}</div>
                                <div className="ad-uemail">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>{u.department}</td>
                          <td><span className="ad-rpill r-us">{t('usersAdmin.roleEmployee')}</span></td>
                          <td>
                            <span className={`ad-stat ${u.isLockedOut ? 's-off' : 's-on'}`}>
                              <span className="ad-dot" />{u.isLockedOut ? t('employeesAdmin.locked') : t('activity.active')}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="ad-acts" style={{ justifyContent: 'center' }}>
                              <button className="ad-ab ab-e" onClick={() => { setSelectedEmployee(u); setEmployeeView('detail'); }} title={t('common.profile')}><i className="ti ti-eye" /></button>
                              <button className="ad-ab ab-e" onClick={() => openEdit(u)} title={t('common.edit')}><i className="ti ti-pencil" /></button>
                              <button className="ad-ab ab-r" onClick={() => { setSelected(u); setNewPassword(''); setShowReset(true); }} title={t('usersAdmin.resetPassword')}><i className="ti ti-key" /></button>
                              {u.isLockedOut && <button className="ad-ab ab-u" onClick={() => handleUnlock(u.id)} title={t('employeesAdmin.unlock')}><i className="ti ti-lock-open" /></button>}
                              {isSuperAdmin && <button className="ad-ab ab-d" onClick={() => handleDelete(u.id)} title={t('common.delete')}><i className="ti ti-trash" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : selectedEmployee && (
              <EmployeeAdminView
                employee={selectedEmployee}
                onBack={() => { setEmployeeView('list'); setSelectedEmployee(null); }}
              />
            )}
          </>
        )}
      </div>

      {/* ─── CREATE ADMIN MODAL ──────────────────────────────────── */}
      {showCreate && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="ad-modal">
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('usersAdmin.createAdmin')}</span>
              <button className="ad-mclose" onClick={() => setShowCreate(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <div className="ad-frow">
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeesAdmin.fullName')}</label>
                  <input className="ad-inp" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder={t('employeesAdmin.fullNamePh')} />
                </div>
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeesAdmin.email')}</label>
                  <input className="ad-inp" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@coficab.com" />
                </div>
              </div>
              <div className="ad-fg">
                <label className="ad-lbl">{t('employeesAdmin.role')}</label>
                <select
                  className="ad-sel"
                  value={form.role}
                  onChange={e => {
                    const newRole = e.target.value;
                    setForm(f => ({
                      ...f,
                      role: newRole,
                      organizationId: newRole === 'admin' || newRole === 'superadmin' ? f.organizationId : '',
                      department: f.department,
                      permissions: newRole === 'user' ? f.permissions : [],
                    }));
                  }}
                >
                  <option value="user">{t('usersAdmin.roleEmployeeCap')}</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              {(form.role === 'admin' || form.role === 'superadmin' || form.role === 'user') && (
                <div className="ad-frow">
                  {needsOrg && (
                    <div className="ad-fg">
                      <label className="ad-lbl">{t('usersAdmin.organization')} *</label>
                      <select
                        className="ad-sel"
                        value={form.organizationId}
                        onChange={e => setForm(f => ({ ...f, organizationId: e.target.value, department: '' }))}
                        disabled={loadingOrganizations}
                      >
                        <option value="">{t('usersAdmin.pickOrg')}</option>
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="ad-fg">
                    <label className="ad-lbl">{t('planDetail.department')}{needsOrg ? ' *' : ''}</label>
                    <select
                      className="ad-sel"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                      disabled={loadingDepartments || (needsOrg && !form.organizationId)}
                    >
                      <option value="">
                        {needsOrg && !form.organizationId
                          ? t('usersAdmin.orgFirst')
                          : t('usersAdmin.pickDept')}
                      </option>
                      {departmentOptions.map(dept => (
                        <option key={dept.id} value={dept.name}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Password field removed — backend generates and emails it */}
              <AutoPasswordBanner />

              {form.role === 'user' ? (
                <div className="ad-fg">
                  <label className="ad-lbl" style={{ marginBottom: 10 }}>{t('employeesAdmin.permissions')}</label>
                  {Object.entries(groupedPerms).map(([appId, perms]) => (
                    <div key={appId} className="ad-pg">
                      <div className="ad-pg-title">{appId}</div>
                      <div className="ad-pg-grid">
                        {perms.map(p => (
                          <div key={p.id} className={`ad-pi${form.permissions.includes(p.name) ? ' sel' : ''}`} onClick={() => togglePerm(p.name)}>
                            <div className="ad-pi-ck" style={{ background: form.permissions.includes(p.name) ? 'var(--navy)' : 'transparent', border: `2px solid ${form.permissions.includes(p.name) ? 'var(--navy)' : 'var(--border)'}` }} />
                            {p.displayName}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                  {form.role === 'superadmin'
                    ? t('usersAdmin.superadminAccess')
                    : t('usersAdmin.adminAccess')}
                </div>
              )}
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
              <button className="ad-btn btn-primary" onClick={handleCreate}>{t('calendar.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE EMPLOYEE MODAL ───────────────────────────────── */}
      {showCreateEmployee && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowCreateEmployee(false)}>
          <div className="ad-modal ad-modal-sm">
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('usersAdmin.createEmployee')}</span>
              <button className="ad-mclose" onClick={() => setShowCreateEmployee(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <div className="ad-frow">
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeesAdmin.fullName')}</label>
                  <input className="ad-inp" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder={t('employeesAdmin.fullNamePh')} />
                </div>
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeesAdmin.email')}</label>
                  <input className="ad-inp" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@coficab.com" />
                </div>
              </div>
              <div className="ad-frow">
                <div className="ad-fg">
                  <label className="ad-lbl">{t('planDetail.department')}</label>
                  <select
                    className="ad-sel"
                    value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    disabled={loadingDepartments}
                  >
                    <option value="">{t('usersAdmin.pickDept')}</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeesAdmin.role')}</label>
                  <input className="ad-inp" value={t('usersAdmin.roleEmployeeCap')} disabled style={{ opacity: 0.6 }} />
                </div>
              </div>

              {/* Password field removed — backend generates and emails it */}
              <AutoPasswordBanner />
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowCreateEmployee(false)}>{t('common.cancel')}</button>
              <button className="ad-btn btn-primary" onClick={handleCreateEmployee}>{t('calendar.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT MODAL ──────────────────────────────────────────── */}
      {showEdit && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowEdit(false)}>
          <div className="ad-modal">
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('usersAdmin.editTitle', { name: selected?.fullName })}</span>
              <button className="ad-mclose" onClick={() => setShowEdit(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <div className="ad-fg">
                <label className="ad-lbl">{t('employeesAdmin.fullName')}</label>
                <input className="ad-inp" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="ad-fg">
                <label className="ad-lbl">{t('employeesAdmin.role')}</label>
                <select
                  className="ad-sel"
                  value={form.role}
                  onChange={e => {
                    const newRole = e.target.value;
                    setForm(f => ({
                      ...f,
                      role: newRole,
                      organizationId: newRole === 'admin' || newRole === 'superadmin' ? f.organizationId : '',
                      department: f.department,
                      permissions: newRole === 'user' ? f.permissions : [],
                    }));
                  }}
                >
                  <option value="user">{t('usersAdmin.roleUserEmployee')}</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              {(form.role === 'admin' || form.role === 'superadmin' || form.role === 'user') && (
                <div className="ad-frow">
                  {needsOrg && (
                    <div className="ad-fg">
                      <label className="ad-lbl">{t('usersAdmin.organization')} *</label>
                      <select
                        className="ad-sel"
                        value={form.organizationId}
                        onChange={e => setForm(f => ({ ...f, organizationId: e.target.value, department: '' }))}
                        disabled={loadingOrganizations}
                      >
                        <option value="">{t('usersAdmin.pickOrg')}</option>
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="ad-fg">
                    <label className="ad-lbl">{t('planDetail.department')}{needsOrg ? ' *' : ''}</label>
                    <select
                      className="ad-sel"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                      disabled={loadingDepartments || (needsOrg && !form.organizationId)}
                    >
                      <option value="">
                        {needsOrg && !form.organizationId
                          ? t('usersAdmin.orgFirst')
                          : t('usersAdmin.pickDept')}
                      </option>
                      {departmentOptions.map(dept => (
                        <option key={dept.id} value={dept.name}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {form.role === 'user' ? (
                <div className="ad-fg">
                  <label className="ad-lbl" style={{ marginBottom: 10 }}>{t('employeesAdmin.permissions')}</label>
                  {Object.entries(groupedPerms).map(([appId, perms]) => (
                    <div key={appId} className="ad-pg">
                      <div className="ad-pg-title">{appId}</div>
                      <div className="ad-pg-grid">
                        {perms.map(p => (
                          <div key={p.id} className={`ad-pi${form.permissions.includes(p.name) ? ' sel' : ''}`} onClick={() => togglePerm(p.name)}>
                            <div className="ad-pi-ck" style={{ background: form.permissions.includes(p.name) ? 'var(--navy)' : 'transparent', border: `2px solid ${form.permissions.includes(p.name) ? 'var(--navy)' : 'var(--border)'}` }} />
                            {p.displayName}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                  {form.role === 'superadmin'
                    ? t('usersAdmin.superadminAccess')
                    : t('usersAdmin.adminAccess')}
                </div>
              )}
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowEdit(false)}>{t('common.cancel')}</button>
              <button className="ad-btn btn-primary" onClick={handleUpdate}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── RESET PASSWORD MODAL ────────────────────────────────── */}
      {showReset && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowReset(false)}>
          <div className="ad-modal ad-modal-sm">
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('usersAdmin.resetPassword')}</span>
              <button className="ad-mclose" onClick={() => setShowReset(false)}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                {t('usersAdmin.newPasswordFor')} <strong>{selected?.fullName}</strong>
              </p>
              <div className="ad-fg">
                <label className="ad-lbl">{t('usersAdmin.newPassword')}</label>
                <input className="ad-inp" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('usersAdmin.minChars')} />
              </div>
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowReset(false)}>{t('common.cancel')}</button>
              <button className="ad-btn btn-primary" onClick={handleReset}>{t('common.reset')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}