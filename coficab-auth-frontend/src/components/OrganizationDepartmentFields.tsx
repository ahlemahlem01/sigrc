import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useOrganizationScope } from '../context/OrganizationScopeContext';
import { getOrganizations, type OrganizationDto } from '../services/adminService';
import { departmentService } from '../services/departmentService';
import type { Department } from '../types/department';

export interface OrgDeptValue {
  organizationId: string;
  departmentId: string;
  departmentName: string;
}

interface Props {
  value: OrgDeptValue;
  onChange: (next: OrgDeptValue) => void;
  /** Classes of the surrounding form, so the fields look like the others. */
  classes: { field: string; label: string; input: string };
  required?: boolean;
}

/**
 * The organization of a person and one of its departments, chosen from real records: the department list follows the
 * organization, and changing the organization empties it. Starts on the organization followed in the top bar.
 */
export default function OrganizationDepartmentFields({ value, onChange, classes, required = true }: Props) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { selectedIds } = useOrganizationScope();
  const [organizations, setOrganizations] = useState<OrganizationDto[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    getOrganizations(accessToken).then((rows) => { if (live) setOrganizations(rows); }).catch(() => { if (live) setOrganizations([]); });
    return () => { live = false; };
  }, [accessToken]);

  // first choice: the organization followed in the top bar (or the only one that exists)
  useEffect(() => {
    if (value.organizationId || organizations.length === 0) return;
    const start = selectedIds.length === 1 ? selectedIds[0] : organizations.length === 1 ? organizations[0].id : '';
    if (start && organizations.some((o) => o.id === start)) onChange({ organizationId: start, departmentId: '', departmentName: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the organizations arrive
  }, [organizations]);

  useEffect(() => {
    if (!accessToken || !value.organizationId) { setDepartments([]); return; }
    let live = true;
    departmentService.getByOrganization(value.organizationId, accessToken)
      .then((rows) => { if (live) setDepartments(rows.filter((d) => !d.isArchived)); })
      .catch(() => { if (live) setDepartments([]); });
    return () => { live = false; };
  }, [accessToken, value.organizationId]);

  const star = required ? ' *' : '';
  return (
    <>
      <div className={classes.field}>
        <label className={classes.label}>{t('usersAdmin.organization')}{star}</label>
        <select
          className={classes.input}
          value={value.organizationId}
          onChange={(e) => onChange({ organizationId: e.target.value, departmentId: '', departmentName: '' })}
        >
          <option value="">{t('usersAdmin.pickOrg')}</option>
          {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div className={classes.field}>
        <label className={classes.label}>{t('planDetail.department')}{star}</label>
        <select
          className={classes.input}
          value={value.departmentId}
          disabled={!value.organizationId}
          onChange={(e) => onChange({
            organizationId: value.organizationId,
            departmentId: e.target.value,
            departmentName: departments.find((d) => d.id === e.target.value)?.name ?? '',
          })}
        >
          <option value="">{value.organizationId ? t('usersAdmin.pickDept') : t('usersAdmin.orgFirst')}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
    </>
  );
}
