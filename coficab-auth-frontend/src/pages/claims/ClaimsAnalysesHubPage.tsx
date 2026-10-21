import QualityClaimsHistoryPage from './QualityClaimsHistoryPage';
import AdminClaimsReport from './AdminClaimsReport';
import AdminClaimsReportGenerator from './AdminClaimsReportGenerator';

/**
 * The claims report in one page, like the CAPA one: the summary, the analyses to handle and the on-demand report
 * generator (CSV / PDF). The 8D list has its own page (/admin/claims/eight-d).
 */
export default function ClaimsAnalysesHubPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AdminClaimsReport />
      <div className="max-w-7xl mx-auto w-full"><QualityClaimsHistoryPage adminView /></div>
      <div className="max-w-7xl mx-auto w-full"><AdminClaimsReportGenerator /></div>
    </div>
  );
}
