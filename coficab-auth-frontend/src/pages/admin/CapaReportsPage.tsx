import AdminCapaReportOfPlans from './AdminCapaReportOfPlans';
import AdminCapaActionsReport from './AdminCapaActionsReport';

/** One CAPA report: the plans summary first, then the detail of their sub-actions (generated on demand). */
export default function CapaReportsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <AdminCapaReportOfPlans />
      <div className="max-w-7xl mx-auto w-full">
        <AdminCapaActionsReport embedded />
      </div>
    </div>
  );
}
