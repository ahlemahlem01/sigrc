import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AvatarArt } from '../../components/AvatarArt';
import { useAuth } from '../../context/AuthContext';
import { employeeService } from '../../services/employeeService';
import { adminEmployeeService } from '../../services/adminEmployeeService';
import { getOrganizations } from '../../services/adminService';
import {
  AVATAR_PRESETS,
  getAvatarPreset,
  normalizePresetId,
  resolveUploadedAvatarUrl,
} from '../../utils/avatarPresets';
import { inferWorkFieldsFromDepartment, phoneFromId } from '../../utils/employeeWorkFields';
import {
  activityStatusClass,
  normalizeActivityStatus,
  type ActivityStatus,
} from '../../utils/activityStatus';

type EmployeeSeed = {
  id?: string;
  email?: string;
  fullName?: string;
  name?: string;
  department?: string;
  organizationName?: string;
  organizationId?: string;
  role?: string;
  roles?: string[];
  phone?: string;
  telephone?: string;
  poste?: string;
  equipe?: string;
  ligneProduction?: string;
  profilePictureUrl?: string | null;
  hireDate?: string | null;
  managerName?: string;
  isLockedOut?: boolean;
  activityStatus?: ActivityStatus | string | number;
};

type Props = {
  employeeId?: string;
  employeeSeed?: EmployeeSeed | null;
  backTo?: string;
  backLabel?: string;
};

function pickText(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== 'null' && s !== 'undefined' && s !== '—') return s;
  }
  return '';
}

function initialsOf(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function roleLabel(role: string | undefined, t: (key: string) => string) {
  const r = String(role ?? '').toLowerCase();
  if (r === 'superadmin') return t('employeeProfile.roles.superadmin');
  if (r === 'admin') return t('employeeProfile.roles.admin');
  if (r === 'manager') return t('employeeProfile.roles.manager');
  if (!r || r === 'user') return t('employeeProfile.roles.user');
  return role!;
}

export default function EmployeeProfile({
  employeeId,
  employeeSeed,
  backTo,
  backLabel,
}: Props) {
  const { t } = useTranslation();
  const { user, accessToken, updateUser, refreshUserProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdminContext = location.pathname.startsWith('/admin');
  const editingOther = Boolean(employeeId);
  const resolvedBackTo =
    backTo ?? (editingOther ? '/admin/employees' : isAdminContext ? '/admin/dashboard' : '/dashboard');
  const resolvedBackLabel =
    backLabel ??
    (editingOther
      ? t('employeeProfile.backEmployees')
      : t('employeeProfile.backDashboard'));

  const authUser = user as any;
  const seedId = employeeId || employeeSeed?.id || authUser?.id || authUser?.sub || '';

  const [meta, setMeta] = useState({
    name: employeeSeed?.fullName || employeeSeed?.name || authUser?.fullName || authUser?.name || t('employeeProfile.roles.user'),
    email: employeeSeed?.email || authUser?.email || '',
    department: employeeSeed?.department || authUser?.department || '',
    organizationName: employeeSeed?.organizationName || authUser?.organizationName || '',
    role: (() => {
      const iam = Array.isArray(authUser?.role)
        ? authUser.role[0]
        : authUser?.role || (Array.isArray(authUser?.roles) ? authUser.roles[0] : '');
      return (
        employeeSeed?.role ||
        employeeSeed?.roles?.[0] ||
        iam ||
        'user'
      );
    })(),
    hireDate: employeeSeed?.hireDate || authUser?.hireDate || null,
    managerName: employeeSeed?.managerName || authUser?.managerName || '',
    isLockedOut: Boolean(employeeSeed?.isLockedOut ?? authUser?.isLockedOut),
    activityStatus: normalizeActivityStatus(
      employeeSeed?.activityStatus ?? authUser?.activityStatus,
    ),
  });

  const inferred = useMemo(
    () => inferWorkFieldsFromDepartment(meta.department, meta.role),
    [meta.department, meta.role],
  );

  const [phone, setPhone] = useState<string>(
    String(employeeSeed?.telephone || employeeSeed?.phone || authUser?.telephone || authUser?.phone || ''),
  );
  const [poste, setPoste] = useState<string>(String(employeeSeed?.poste || authUser?.poste || ''));
  const [equipe, setEquipe] = useState<string>(String(employeeSeed?.equipe || authUser?.equipe || ''));
  const [ligneProduction, setLigneProduction] = useState<string>(
    String(employeeSeed?.ligneProduction || authUser?.ligneProduction || ''),
  );
  const [avatarPreview, setAvatarPreview] = useState<string>(
    String(employeeSeed?.profilePictureUrl || authUser?.profilePictureUrl || ''),
  );
  const [, setAvatarDirty] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [autofilledHint, setAutofilledHint] = useState(false);

  const displayName = meta.name;
  const initials = initialsOf(displayName);
  const selectedPreset = getAvatarPreset(avatarPreview);
  const uploadedUrl = resolveUploadedAvatarUrl(avatarPreview);
  const selectedPresetId = normalizePresetId(avatarPreview);
  const canChangePhoto = !editingOther;

  const selectPreset = (presetId: string) => {
    setAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAvatarPreview(presetId);
    setAvatarDirty(true);
  };

  const applyAutofill = (department: string, role?: string, opts?: { force?: boolean }) => {
    const fill = inferWorkFieldsFromDepartment(department, role);
    const force = opts?.force === true;
    let applied = false;
    setPoste((prev) => {
      if (force || !prev.trim()) {
        applied = true;
        return fill.poste;
      }
      return prev;
    });
    setEquipe((prev) => {
      if (force || !prev.trim()) {
        applied = true;
        return fill.equipe;
      }
      return prev;
    });
    setLigneProduction((prev) => {
      if (force || !prev.trim()) {
        applied = true;
        return fill.ligneProduction;
      }
      return prev;
    });
    setPhone((prev) => {
      if (force || !prev.trim()) {
        applied = true;
        return phoneFromId(seedId || meta.email || displayName);
      }
      return prev;
    });
    if (applied) setAutofilledHint(true);
  };

  useEffect(() => {
    if (!editingOther && accessToken) {
      void refreshUserProfile();
    }
  }, [accessToken, editingOther, refreshUserProfile]);

  useEffect(() => {
    if (!accessToken) {
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);

    const load = editingOther
      ? adminEmployeeService.getProfile(accessToken, employeeId!)
      : employeeService.getProfile(accessToken);

    Promise.resolve(load)
      .then(async (p: any) => {
        if (cancelled) return;

        const department = pickText(
          p?.department,
          employeeSeed?.department,
          authUser?.department,
          meta.department,
        );
        // Pour soi-même, privilégier le rôle du compte (admin/superadmin) au rôle RH du profil
        const iamRole = Array.isArray(authUser?.role)
          ? String(authUser.role[0] ?? '')
          : String(
              authUser?.role ||
                (Array.isArray(authUser?.roles) ? authUser.roles[0] : '') ||
                '',
            );
        const profileRole = Array.isArray(employeeSeed?.roles)
          ? String(employeeSeed?.role || employeeSeed?.roles?.[0] || p?.role || '')
          : String(employeeSeed?.role || p?.role || '');
        const effectiveRole = String(
          (!editingOther && iamRole ? iamRole : profileRole || iamRole) || 'user',
        );

        let organizationName = pickText(
          p?.organizationName,
          employeeSeed?.organizationName,
          authUser?.organizationName,
          authUser?.organization,
        );
        const organizationId = pickText(
          p?.organizationId,
          employeeSeed?.organizationId as any,
          authUser?.organizationId,
        );
        if (!organizationName && organizationId && accessToken) {
          try {
            const orgs = await getOrganizations(accessToken);
            const list = Array.isArray(orgs) ? orgs : (orgs as any)?.$values || [];
            const match = list.find(
              (o: any) => String(o.id || o.Id) === String(organizationId),
            );
            organizationName = pickText(match?.name, match?.Name);
          } catch {
            /* ignore */
          }
        }

        const nextMeta = {
          name: pickText(
            p?.name,
            p?.fullName,
            employeeSeed?.fullName,
            employeeSeed?.name,
            authUser?.fullName,
            authUser?.name,
          ) || 'Utilisateur',
          email: pickText(p?.email, employeeSeed?.email, authUser?.email),
          department,
          organizationName,
          role: effectiveRole,
          hireDate: p?.hireDate || employeeSeed?.hireDate || authUser?.hireDate || null,
          managerName: pickText(
            p?.managerName,
            employeeSeed?.managerName,
            authUser?.managerName,
          ),
          isLockedOut: Boolean(
            p?.isLockedOut || employeeSeed?.isLockedOut || authUser?.isLockedOut,
          ),
          activityStatus: normalizeActivityStatus(
            p?.activityStatus ?? p?.ActivityStatus ?? employeeSeed?.activityStatus,
          ),
        };
        setMeta(nextMeta);

        if (!editingOther && updateUser) {
          updateUser({
            department: nextMeta.department || authUser?.department,
            organizationName: nextMeta.organizationName || authUser?.organizationName,
            managerName: nextMeta.managerName || authUser?.managerName,
            hireDate: nextMeta.hireDate || authUser?.hireDate,
          });
        }

        const inferredFill = inferWorkFieldsFromDepartment(nextMeta.department, nextMeta.role);
        const apiPhone = String(p?.telephone ?? p?.phone ?? '').trim();
        const apiPoste = String(p?.poste ?? '').trim();
        const apiEquipe = String(p?.equipe ?? '').trim();
        const apiLigne = String(p?.ligneProduction ?? '').trim();

        setPhone(
          apiPhone ||
            employeeSeed?.telephone ||
            employeeSeed?.phone ||
            authUser?.telephone ||
            authUser?.phone ||
            phoneFromId(employeeId || seedId || nextMeta.email),
        );
        // Toujours privilégier les valeurs déjà en base ; suggestions seulement si vide
        setPoste(apiPoste || employeeSeed?.poste || authUser?.poste || inferredFill.poste);
        setEquipe(apiEquipe || employeeSeed?.equipe || authUser?.equipe || inferredFill.equipe);
        setLigneProduction(
          apiLigne ||
            employeeSeed?.ligneProduction ||
            authUser?.ligneProduction ||
            inferredFill.ligneProduction,
        );

        if (!apiPoste || !apiEquipe || !apiLigne || !apiPhone) {
          setAutofilledHint(true);
        }

        if (p?.profilePictureUrl) {
          setAvatarPreview(String(p.profilePictureUrl));
          setAvatarDirty(false);
        } else if (!editingOther) {
          try {
            const cached = localStorage.getItem(`ep-avatar-preset:${seedId}`);
            if (cached) {
              setAvatarPreview(cached);
              setAvatarDirty(true);
            }
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        const role =
          authUser?.role ||
          (Array.isArray(authUser?.roles) ? authUser.roles[0] : '') ||
          meta.role;
        applyAutofill(meta.department || authUser?.department || '', role, {
          force: false,
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, employeeId, editingOther]);

  useEffect(() => {
    try {
      if (selectedPresetId) localStorage.setItem(`ep-avatar-preset:${seedId}`, selectedPresetId);
    } catch {
      /* ignore */
    }
  }, [selectedPresetId, seedId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarDirty(true);
  };

  const clearPhoto = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarDirty(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      alert('Votre session a expiré. Veuillez vous reconnecter.');
      return;
    }
    if (!poste.trim() || !equipe.trim()) {
      alert("Le poste et l'équipe sont obligatoires.");
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const updatePayload: {
        name: string;
        telephone?: string;
        poste: string;
        equipe: string;
        ligneProduction: string | null;
        profilePictureUrl?: string | null;
      } = {
        name: String(displayName),
        telephone: phone.trim() || undefined,
        poste: poste.trim().slice(0, 200),
        equipe: equipe.trim().slice(0, 120),
        ligneProduction: ligneProduction.trim() ? ligneProduction.trim().slice(0, 120) : null,
      };

      // Toujours envoyer l'avatar courant (preset / vide) pour qu'il soit persisté
      if (!avatarFile) {
        updatePayload.profilePictureUrl = avatarPreview?.startsWith('blob:')
          ? undefined
          : avatarPreview || '';
      }

      let updatedProfile: any;
      if (editingOther && employeeId) {
        updatedProfile = await adminEmployeeService.updateProfile(accessToken, employeeId, updatePayload);
      } else {
        updatedProfile = await employeeService.updateProfile(accessToken, updatePayload);
      }

      let newAvatarUrl =
        updatedProfile?.profilePictureUrl ??
        updatedProfile?.ProfilePictureUrl ??
        (avatarPreview?.startsWith('blob:') ? '' : avatarPreview);

      if (avatarFile && !editingOther) {
        const avatarResult = await employeeService.uploadAvatar(accessToken, avatarFile);
        if (avatarResult?.profilePictureUrl) {
          newAvatarUrl = avatarResult.profilePictureUrl;
        }
        setAvatarFile(null);
      }

      // Resync depuis le serveur pour confirmer la persistance
      try {
        const fresh: any = editingOther && employeeId
          ? await adminEmployeeService.getProfile(accessToken, employeeId)
          : await employeeService.getProfile(accessToken);
        if (fresh) {
          if (fresh.poste != null) setPoste(String(fresh.poste));
          if (fresh.equipe != null) setEquipe(String(fresh.equipe));
          if (fresh.ligneProduction != null) setLigneProduction(String(fresh.ligneProduction));
          const freshPhone = fresh.telephone ?? fresh.phone;
          if (freshPhone != null) setPhone(String(freshPhone));
          if (fresh.profilePictureUrl != null) {
            newAvatarUrl = fresh.profilePictureUrl;
          }
        }
      } catch {
        /* ignore refresh errors — la mise à jour a déjà réussi */
      }

      setAvatarPreview(newAvatarUrl || '');
      setAvatarDirty(false);

      if (!editingOther && updateUser) {
        updateUser({
          ...authUser,
          phone: phone.trim(),
          telephone: phone.trim(),
          poste: poste.trim(),
          equipe: equipe.trim(),
          ligneProduction: ligneProduction.trim() || null,
          profilePictureUrl: newAvatarUrl || null,
        });
      }

      setAutofilledHint(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Update profile error:', err);
      let message = 'Erreur lors de la sauvegarde du profil.';
      const raw = err?.response?.data?.error || err?.message;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          message = parsed.error || parsed.title || raw;
        } catch {
          message = raw;
        }
      }
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <style>{`
        .ep {
          font-family: 'Inter', system-ui, sans-serif;
          color: #0d1340;
          max-width: 880px;
          margin: 0 auto;
          padding: 8px 4px 36px;
        }
        .ep-back {
          display: inline-flex; align-items: center; gap: 6px;
          border: none; background: none; color: #64748b;
          font: inherit; font-size: 13px; font-weight: 600;
          cursor: pointer; padding: 0; margin-bottom: 16px;
        }
        .ep-back:hover { color: #000168; }

        .ep-box {
          background: #fff;
          border: 1px solid #e4e8f2;
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 12px;
        }
        .ep-title {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 700;
        }
        .ep-sub {
          margin: 0 0 12px;
          font-size: 13px;
          color: #64748b;
        }

        .ep-top {
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-areas:
            "avatar id"
            "tones tones";
          gap: 10px 14px;
          align-items: start;
        }
        .ep-avatar-col {
          grid-area: avatar;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .ep-avatar-wrap {
          position: relative;
          width: 72px;
          height: 72px;
        }
        .ep-avatar {
          width: 72px;
          height: 72px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 700;
          overflow: hidden;
          border: 1px solid #e4e8f2;
          background: #000168;
          color: #fff;
          padding: 0;
          margin: 0;
          font: inherit;
          position: relative;
        }
        .ep-avatar.is-editable {
          cursor: pointer;
        }
        .ep-avatar.is-editable:hover .ep-avatar-overlay,
        .ep-avatar.is-editable:focus-visible .ep-avatar-overlay {
          opacity: 1;
        }
        .ep-avatar img,
        .ep-avatar svg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ep-avatar-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(13, 19, 64, 0.55);
          color: #fff;
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.01em;
          opacity: 0;
          transition: opacity 0.15s ease;
          pointer-events: none;
        }
        .ep-avatar-clear {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid #e4e8f2;
          background: #fff;
          color: #64748b;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 4px rgba(15,23,42,.12);
          z-index: 2;
          padding: 0;
        }
        .ep-avatar-clear:hover {
          background: #fef2f2;
          color: #b91c1c;
          border-color: #fecaca;
        }

        .ep-tones-block {
          grid-area: tones;
          padding: 8px 10px;
          background: #f8f9fc;
          border: 1px solid #eef1f7;
          border-radius: 8px;
        }
        .ep-tones-title {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 6px;
        }
        .ep-tones {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ep-tone {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 8px;
          border: 2px solid #e4e8f2;
          background: #fff;
          cursor: pointer;
          overflow: hidden;
          display: block;
          flex-shrink: 0;
        }
        .ep-tone:hover { border-color: #94a3b8; }
        .ep-tone.is-on {
          border-color: #000168;
          box-shadow: 0 0 0 2px rgba(0,1,104,.15);
        }
        .ep-tone svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .ep-id { grid-area: id; min-width: 0; align-self: start; padding-top: 2px; }
        .ep-name {
          margin: 0 0 2px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.25;
        }
        .ep-email {
          margin: 0 0 8px;
          font-size: 13px;
          color: #64748b;
          line-height: 1.3;
        }
        .ep-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #475569;
        }
        .ep-meta span {
          display: inline-flex;
          align-items: center;
          background: #f4f6fb;
          border: 1px solid #eef1f7;
          border-radius: 6px;
          padding: 3px 8px;
          line-height: 1.2;
          height: 24px;
          box-sizing: border-box;
        }
        .ep-status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .ep-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 650;
          padding: 5px 10px;
          border-radius: 8px;
          border: 1px solid #e4e8f2;
          background: #f8f9fc;
          color: #0d1340;
        }
        .ep-status-k {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #64748b;
        }
        .ep-status-pill.act-active { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
        .ep-status-pill.act-low { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
        .ep-status-pill.act-inactive { background: #f8fafc; border-color: #e2e8f0; color: #475569; }
        .ep-status-pill.acct-ok { background: #eef2ff; border-color: #c7d2fe; color: #000168; }
        .ep-status-pill.acct-locked { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }

        .ep-hint {
          margin: 0 0 14px;
          padding: 10px 12px;
          background: #f8faff;
          border: 1px solid #e0e7ff;
          border-radius: 8px;
          font-size: 12.5px;
          color: #4338ca;
        }

        .ep-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .ep-grid { grid-template-columns: 1fr; }
        }
        .ep-field label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 5px;
        }
        .ep-field input {
          width: 100%;
          box-sizing: border-box;
          height: 38px;
          padding: 0 10px;
          border: 1px solid #e4e8f2;
          border-radius: 8px;
          background: #fff;
          font: inherit;
          font-size: 13px;
          color: #0d1340;
        }
        .ep-field input:focus {
          outline: none;
          border-color: #000168;
          box-shadow: 0 0 0 3px rgba(0,1,104,.06);
        }

        .ep-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-top: 16px;
        }
        .ep-save {
          height: 38px;
          padding: 0 14px;
          border: none;
          border-radius: 8px;
          background: #000168;
          color: #fff;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .ep-save:hover:not(:disabled) { background: #00009e; }
        .ep-save:disabled { opacity: .55; cursor: not-allowed; }
        .ep-secondary {
          height: 38px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid #e4e8f2;
          background: #f8f9fc;
          color: #374151;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .ep-secondary:hover { background: #eef2ff; color: #000168; }
        .ep-ok { font-size: 13px; font-weight: 600; color: #15803d; }

        .ep-side-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 12px;
        }
        .ep-side-list li {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          border-bottom: 1px solid #f0f2f8;
          padding-bottom: 10px;
        }
        .ep-side-list li:last-child { border-bottom: none; padding-bottom: 0; }
        .ep-side-list span { color: #64748b; }
        .ep-side-list strong { font-weight: 650; text-align: right; }
        .ep-loading { font-size: 13px; color: #64748b; margin-bottom: 10px; }

        .ep-layout {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 16px;
        }
        @media (max-width: 800px) {
          .ep-layout { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ep">
        <button type="button" className="ep-back" onClick={() => navigate(resolvedBackTo)}>
          ← {resolvedBackLabel}
        </button>

        {loadingProfile && <div className="ep-loading">{t('employeeProfile.loading')}</div>}

        <div className="ep-box">
          <div className="ep-top">
            <div className="ep-avatar-col">
              {canChangePhoto && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={handleFileChange}
                />
              )}
              <div className="ep-avatar-wrap">
                {canChangePhoto ? (
                  <button
                    type="button"
                    className="ep-avatar is-editable"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('employeeProfile.changePhoto')}
                    aria-label={t('employeeProfile.changePhoto')}
                  >
                    {selectedPreset ? (
                      <AvatarArt art={selectedPreset.art} />
                    ) : uploadedUrl ? (
                      <img src={uploadedUrl} alt="" />
                    ) : (
                      <span>{initials}</span>
                    )}
                    <span className="ep-avatar-overlay">
                      {uploadedUrl || selectedPreset
                        ? t('employeeProfile.change')
                        : t('employeeProfile.add')}
                    </span>
                  </button>
                ) : (
                  <div className="ep-avatar">
                    {selectedPreset ? (
                      <AvatarArt art={selectedPreset.art} />
                    ) : uploadedUrl ? (
                      <img src={uploadedUrl} alt="" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                )}
                {canChangePhoto && (avatarPreview || avatarFile) ? (
                  <button
                    type="button"
                    className="ep-avatar-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearPhoto();
                    }}
                    title={t('employeeProfile.remove')}
                    aria-label={t('employeeProfile.removePhoto')}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            <div className="ep-id">
              <h1 className="ep-name">{displayName}</h1>
              <p className="ep-email">{meta.email || t('employeeProfile.emailUnavailable')}</p>
              <div className="ep-meta">
                <span>{roleLabel(meta.role, t)}</span>
                {meta.department ? <span>{meta.department}</span> : null}
                {meta.organizationName ? <span>{meta.organizationName}</span> : null}
              </div>
              <div className="ep-status-row" aria-label={t('employeeProfile.statuses')}>
                <span className={`ep-status-pill act-${activityStatusClass(meta.activityStatus)}`}>
                  <span className="ep-status-k">{t('employeeProfile.activityStatus')}</span>
                  {t(`employeeProfile.activity.${normalizeActivityStatus(meta.activityStatus)}`)}
                </span>
                <span className={`ep-status-pill acct-${meta.isLockedOut ? 'locked' : 'ok'}`}>
                  <span className="ep-status-k">{t('employeeProfile.account')}</span>
                  {meta.isLockedOut ? t('employeeProfile.locked') : t('employeeProfile.active')}
                </span>
              </div>
            </div>

            <div className="ep-tones-block">
              <div className="ep-tones-title">{t('employeeProfile.avatarSuggestions')}</div>
              <div className="ep-tones" role="group" aria-label={t('employeeProfile.avatarsSuggested')}>
                {AVATAR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ep-tone${selectedPresetId === p.id ? ' is-on' : ''}`}
                    title={p.label}
                    aria-label={p.label}
                    onClick={() => selectPreset(p.id)}
                  >
                    <AvatarArt art={p.art} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="ep-layout">
          <form className="ep-box" onSubmit={handleSave}>
            <h2 className="ep-title">{t('employeeProfile.workInfo')}</h2>
            <p className="ep-sub">{t('employeeProfile.workSub')}</p>

            {autofilledHint && (
              <div className="ep-hint">
                {t('employeeProfile.autofillHint', { example: inferred.poste })}
              </div>
            )}

            <div className="ep-grid">
              <div className="ep-field">
                <label htmlFor="ep-poste">{t('employeeProfile.poste')}</label>
                <input
                  id="ep-poste"
                  value={poste}
                  onChange={(e) => setPoste(e.target.value)}
                  placeholder={inferred.poste}
                  maxLength={200}
                  required
                />
              </div>
              <div className="ep-field">
                <label htmlFor="ep-equipe">{t('employeeProfile.equipe')}</label>
                <input
                  id="ep-equipe"
                  value={equipe}
                  onChange={(e) => setEquipe(e.target.value)}
                  placeholder={inferred.equipe}
                  maxLength={120}
                  required
                />
              </div>
              <div className="ep-field">
                <label htmlFor="ep-ligne">{t('employeeProfile.ligne')}</label>
                <input
                  id="ep-ligne"
                  value={ligneProduction}
                  onChange={(e) => setLigneProduction(e.target.value)}
                  placeholder={inferred.ligneProduction}
                  maxLength={120}
                />
              </div>
              <div className="ep-field">
                <label htmlFor="ep-phone">{t('employeeProfile.phone')}</label>
                <input
                  id="ep-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+216 …"
                  maxLength={50}
                />
              </div>
            </div>

            <div className="ep-actions">
              <button type="submit" className="ep-save" disabled={isSaving || loadingProfile}>
                {isSaving ? t('employeeProfile.saving') : t('employeeProfile.save')}
              </button>
              <button
                type="button"
                className="ep-secondary"
                onClick={() => applyAutofill(meta.department, meta.role, { force: true })}
              >
                {t('employeeProfile.reapply')}
              </button>
              {saveSuccess && <span className="ep-ok">{t('employeeProfile.updated')}</span>}
            </div>
          </form>

          <div className="ep-box">
            <h2 className="ep-title">{t('employeeProfile.accountTitle')}</h2>
            <p className="ep-sub">{t('employeeProfile.accountSub')}</p>
            <ul className="ep-side-list">
              <li>
                <span>{t('employeeProfile.department')}</span>
                <strong>{meta.department || t('employeeProfile.unspecified')}</strong>
              </li>
              <li>
                <span>{t('employeeProfile.organization')}</span>
                <strong>{meta.organizationName || '—'}</strong>
              </li>
              <li>
                <span>{t('employeeProfile.role')}</span>
                <strong>{roleLabel(meta.role, t)}</strong>
              </li>
              <li>
                <span>{t('employeeProfile.manager')}</span>
                <strong>{meta.managerName || t('employeeProfile.unassigned')}</strong>
              </li>
              <li>
                <span>{t('employeeProfile.activityStatus')}</span>
                <strong>{t(`employeeProfile.activity.${normalizeActivityStatus(meta.activityStatus)}`)}</strong>
              </li>
              <li>
                <span>{t('employeeProfile.account')}</span>
                <strong>{meta.isLockedOut ? t('employeeProfile.locked') : t('employeeProfile.active')}</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
