import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useOrganizationScope } from '../../../context/OrganizationScopeContext';
import { fetchDashboardSummary } from '../../../services/dashboardSummaryService';
import { qualityAnalysisService, type ClaimKpis } from '../../../services/qualityAnalysisService';
import type { DashboardSummary } from '../../../types/dashboardSummary';
import DashboardSummaryBar from './DashboardSummaryBar';
import ClaimsOverviewColumn from './ClaimsOverviewColumn';
import TopResponsiblesSection from './TopResponsiblesSection';
import WorkflowEvolutionSection from './WorkflowEvolutionSection';
import EmployeeActivityWidget from './EmployeeActivityWidget';
import ClaimKpiSection from './ClaimKpiSection';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB } from './dashPalette';

export default function Dashboard({ focus = 'claims' }: { focus?: 'claims' | 'indicators' }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [claimKpis, setClaimKpis] = useState<ClaimKpis | null>(null);
  const [departments, setDepartments] = useState<DashboardSummary['departments']>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const summary = await fetchDashboardSummary(accessToken, scopeParam, departmentId || undefined);
      setData(summary);
      setDepartments(summary.departments);
      if (focus === 'indicators') {
        // the defects and customers follow the same organizations and department as the rest of the page
        qualityAnalysisService.getClaimKpis(12, accessToken, scopeParam, departmentId || undefined).then(setClaimKpis).catch(() => setClaimKpis(null));
      }
      // a department that left the followed organizations no longer exists in the list
      if (departmentId && !summary.departments.some((d) => d.id === departmentId)) setDepartmentId('');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError(t('adminDashboard.errorSession'));
      } else if (status === 404) {
        setError(t('adminDashboard.error404'));
      } else {
        setError(t('adminDashboard.errorGeneric'));
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scopeParam, accessToken, departmentId, focus, t]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1"
            style={{ color: COFICAB.navy }}
          >
            {t('adminDashboard.eyebrow')}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold m-0" style={{ color: COFICAB.ink }}>
              {focus === 'indicators' ? t('adminNav.claimsIndicators') : t('adminNav.claimsDashboard')}
            </h1>
            <DashInfoTip
              text={t(focus === 'indicators' ? 'adminDashboard.help.pageIndicators' : 'adminDashboard.help.pageSteering')}
              title={t('adminDashboard.title')}
              side="bottom"
            />
          </div>
          <p className="text-sm mt-1 mb-0" style={{ color: COFICAB.muted }}>
            {t(focus === 'indicators' ? 'adminDashboard.subtitleIndicators' : 'adminDashboard.subtitleSteering')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          aria-label={t('planDetail.department')}
          className="px-3 py-2 text-xs font-semibold rounded-xl border bg-white max-w-[260px]"
          style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
        >
          <option value="">{t('audit.allDepartments')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{new Set(departments.map((x) => x.organization)).size > 1 ? `${d.name} · ${d.organization}` : d.name} ({d.claims})</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border bg-white transition-all hover:shadow-sm"
          style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
        >
          <i className="ti ti-refresh" /> {t('adminDashboard.refresh')}
        </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 rounded-xl text-sm px-4 py-3"
          style={{ border: `1px solid #fecaca`, background: COFICAB.dangerSoft, color: COFICAB.danger }}
        >
          {error}
        </div>
      )}

      {focus !== 'indicators' && (
        <DashboardSummaryBar
          data={data?.global}
          loading={loading}
          claimsMonthly={data?.claims.monthlyOpenClosed}
          fixedScope="claims"
        />
      )}

      {focus !== 'claims' && (
      <WorkflowEvolutionSection
        claimsMonthly={data?.claims.monthlyOpenClosed}
        plansMonthly={focus === 'indicators' ? undefined : data?.actionPlans.monthlyOpenClosed}
        loading={loading}
      />
      )}

      {focus === 'indicators' && <ClaimKpiSection kpis={claimKpis} loading={loading} />}

      <div className="grid grid-cols-1 gap-4 items-stretch">
        <ClaimsOverviewColumn data={data?.claims} loading={loading} part={focus === 'indicators' ? 'indicators' : 'steering'} />
      </div>

      {focus !== 'indicators' && (
      <TopResponsiblesSection
        claims={data?.claims.topResponsibles}
        loading={loading}
      />
      )}

      {focus !== 'indicators' && (
      <div className="mt-4">
        <EmployeeActivityWidget scope="claims" />
      </div>
      )}

      {focus !== 'indicators' && (
      <footer
        className="mt-5 rounded-xl bg-white shadow-sm px-4 py-3.5 flex flex-wrap items-center gap-3 hover:shadow-md transition-shadow"
        style={{ border: `1px solid ${COFICAB.line}` }}
      >
        <button
          type="button"
          onClick={() => navigate('/pages/front/quality-analyses/create')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl text-white shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          style={{ background: CLAIMS_ACCENT }}
        >
          {t('adminDashboard.footer.newClaim')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/audit-logs?module=quality')}
          className="text-xs font-semibold hover:underline"
          style={{ color: CLAIMS_ACCENT }}
        >
          {t('adminDashboard.footer.auditClaims')}
        </button>
      </footer>
      )}
    </div>
  );
}
