import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import AdminLayout from './components/Layout/AdminLayout';
import ScrollToTop from './components/ScrollToTop';
import UserLayout from './components/Layout/UserLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrganizationScopeProvider } from './context/OrganizationScopeContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { RealtimeProvider } from './context/RealtimeContext';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PlanPage from './pages/action-plan/PlanPage';
import ActionPlanDetail from './pages/action-plan/ActionPlanDetail';
import ActionPlanList from './pages/action-plan/ActionPlanList';
import CreateActionPlan from './pages/action-plan/CreateActionPlan';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import OrganizationList from './pages/admin/OrganizationList';

import FrontLayout from './components/Layout/FrontLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminGlobalPage from './pages/admin/AdminGlobalPage';
import ClaimsBoardPage from './pages/admin/ClaimsBoardPage';
import AdminClaimsList from './pages/admin/AdminClaimsList';
import ReferenceListsPage from './pages/admin/ReferenceListsPage';
import WorkflowConfigPage from './pages/admin/WorkflowConfigPage';
import HistoryImportPage from './pages/admin/HistoryImportPage';
import ClaimsAnalysesHubPage from './pages/claims/ClaimsAnalysesHubPage';
import { isAdminUser } from './utils/roles';
import ActionPlanSummary from './pages/action-plan/ActionPlanSummary';
import AuditLogPage from './pages/admin/AuditLogPage';
import LoginLogsPage from './pages/admin/LoginLogsPage';
import PermissionMatrixPage from './pages/admin/PermissionMatrixPage';
import EmployeeManagement from './pages/admin/EmployeeManagement';
import EmployeeComparatorPage from './pages/admin/employees/EmployeeComparatorPage';
import EmployeeRecognitionPage from './pages/admin/employees/EmployeeRecognitionPage';
import EmployeeActivityTrackingPage from './pages/admin/employees/EmployeeActivityTrackingPage';
import EmployeeOrgChartPage from './pages/admin/employees/EmployeeOrgChartPage';
import EmployeeAdminProfilePage from './pages/admin/employees/EmployeeAdminProfilePage';
import HrReportsPage from './pages/admin/employees/reports/HrReportsPage';
import CapaReportsPage from './pages/admin/CapaReportsPage';
import AdminCapaSettings from './pages/admin/AdminCapaSettings';
import AdminCapaPlanReference from './pages/admin/AdminCapaPlanReference';
import PreferencesPage from './pages/admin/PreferencesPage';
import CapaBoardPage from './pages/admin/CapaBoardPage';
import CapaTrackingPage from './pages/admin/CapaTrackingPage';
import { EmployeeDocuments } from './pages/employee/EmployeeDocuments';
import EmployeeEightDPage from './pages/employee/EmployeeEightDPage';
import EmployeeProfile from './pages/employee/EmployeeProfile';
import EmployeeCompetenciesPage from './pages/employee/EmployeeCompetenciesPage';
import EmployeeBadgesPage from './pages/employee/EmployeeBadgesPage';
import ActionPlanHistoryList from './pages/front/ActionPlanHistoryList';
import AdminValidationHub from './pages/front/AdminValidationHub';
import CapaCalendarPage from './pages/front/CapaCalendarPage';
import AssignmentsMapPage from './pages/front/AssignmentsMapPage';
import DeadlinesAgendaPage from './pages/front/DeadlinesAgendaPage';
import FrontActionPlanDetail from './pages/front/FrontActionPlanDetail';
import FrontActionPlans from './pages/front/FrontActionPlans';
import { FrontAdminRoute } from './pages/front/FrontAdminRoute';
import FrontLandingPage from './pages/front/FrontLandingPage';
import FrontWorkspaceHome from './pages/front/FrontWorkspaceHome';
import FrontPlanActionManagement from './pages/front/FrontPlanActionManagement';
import AlertsPage from './pages/front/AlertsPage';
import MyActionPlanDetail from './pages/front/MyActionPlanDetail';
import MyActionPlans from './pages/front/MyActionPlans';
import MyAssignedClaimsPage from './pages/front/MyAssignedClaimsPage';
import AdminManagedClaimsPage from './pages/front/AdminManagedClaimsPage';

// 📌 MODULE QUALITY ANALYSIS / CLAIMS
import { ClaimsListPage } from './pages/claims/ClaimsListPage';
import CreateClaimPage from './pages/claims/CreateClaimForm';
import {FiveWhyPage }from './pages/claims/FiveWhyPage';
import IshikawaPage from './pages/claims/IshikawaPage';
import ParetoAnalysis from './pages/claims/Pareto/ParetoAnalysis';
import{ DraftClaimsPage } from './pages/claims/Draftclaimspage';
import QualityClaimsHistoryPage from './pages/claims/QualityClaimsHistoryPage';
import EightDPage from './pages/claims/EightDPage';
import EightDEmployeeGuidePage from './pages/claims/EightDEmployeeGuidePage';
import ContainmentPage from './pages/claims/ContainmentPage';
import ClosedClaimsArchivePage from './pages/claims/ClosedClaimsArchivePage';
import PermissionsCatalogPage from './pages/admin/PermissionsCatalogPage';
import NotFoundPage from './pages/NotFoundPage';
import { RedirectToLogin } from './components/RedirectToLogin';

/** Validations live in the admin front office: old links to /admin/validations keep working (query string kept). */
const ValidationsRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/pages/front/validations${location.search}`} replace />;
};

/** Anciennes URLs history → page unique /admin/audit-logs */
const HistoryRedirect = () => {
  const [params] = useSearchParams();
  const next = new URLSearchParams();
  next.set('module', 'capa');
  const planId = params.get('planId');
  if (planId) next.set('planId', planId);
  return <Navigate to={`/admin/audit-logs?${next.toString()}`} replace />;
};

// ── Guards ────────────────────────────────────────────────────────────────────
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  if (!isAuthenticated) return <RedirectToLogin />;
  return <Outlet />;
};

const EmployeeAdminPage = () => {
  const { id } = useParams();

  if (!id) {
    return <Navigate to="/admin/employees" replace />;
  }

  return <EmployeeAdminProfilePage />;
};

const HrReportsRoute = () => <HrReportsPage />;

const AdminRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }
  if (!isAuthenticated || !user) {
    return <RedirectToLogin />;
  }
  if (!isAdminUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};

// ── App ───────────────────────────────────────────────────────────────────────
const App = () => {
  return (
    <AuthProvider>
      <OrganizationScopeProvider>
      <PreferencesProvider>
      <RealtimeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* ── Public ── */}
          <Route path="/"                   element={<LandingPage />} />
          <Route path="/login"              element={<LoginPage />} />
          <Route path="/forgot-password"    element={<ForgotPasswordPage />} />
          <Route path="/reset-password"     element={<ResetPasswordPage />} />

          {/* ── User routes ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<UserLayout />}>
              <Route path="/dashboard"                    element={<FrontWorkspaceHome />} />
              <Route path="/profile"                      element={<EmployeeProfile />} />
              <Route path="/competences"                  element={<EmployeeCompetenciesPage />} />
              <Route path="/badges"                       element={<EmployeeBadgesPage />} />
              <Route path="/documents"                    element={<EmployeeDocuments />} />
              <Route path="/eight-d"                      element={<EmployeeEightDPage />} />
              <Route path="/action-plans"                 element={<MyActionPlans />} />
              <Route path="/action-plans/:id/summary"    element={<ActionPlanSummary />} />
              <Route path="/action-plans/:id"            element={<ActionPlanDetail />} />
            </Route>
          </Route>

          {/* ── Admin routes ── */}
          <Route element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin"                                element={<Navigate to="/admin/validations" replace />} />
              <Route path="/admin/dashboard"                    element={<AdminGlobalPage />} />
              <Route path="/admin/users"                        element={<AdminDashboard />} />
              <Route path="/admin/profile"                      element={<EmployeeProfile />} />
              <Route path="/admin/organizations"                element={<OrganizationList />} />
              <Route path="/admin/departments"                  element={<DepartmentsPage />} />
              <Route path="/admin/departments/map"              element={<Navigate to="/admin/organizations/map" replace />} />
              <Route path="/admin/employees"                    element={<EmployeeManagement />} />
              <Route path="/admin/employees/compare"            element={<EmployeeComparatorPage />} />
              <Route path="/admin/employees/recognition"        element={<EmployeeRecognitionPage />} />
              <Route path="/admin/employees/activity"           element={<EmployeeActivityTrackingPage />} />
              <Route path="/admin/organizations/map"            element={<EmployeeOrgChartPage />} />
              <Route path="/admin/employees/org-chart"          element={<Navigate to="/admin/organizations/map" replace />} />
              <Route path="/admin/employees/reports"            element={<Navigate to="/admin/reports" replace />} />
              <Route path="/admin/reports"                      element={<HrReportsRoute />} />
              <Route path="/admin/employees/:id"                element={<EmployeeAdminPage />} />
              <Route path="/admin/action-plans"                 element={<ActionPlanList />} />
              <Route path="/admin/action-plans/dashboard"       element={<CapaBoardPage />} />
              <Route path="/admin/action-plans/indicators"      element={<Navigate to="/admin/action-plans/dashboard?tab=indicators" replace />} />
              <Route path="/admin/action-plans/assign"          element={<Navigate to="/admin/employees/activity?scope=workload" replace />} />
              <Route path="/admin/action-plans/tracking"        element={<CapaTrackingPage />} />
              <Route path="/admin/action-plans/assignments"     element={<Navigate to="/admin/action-plans/tracking?tab=assignments" replace />} />
              <Route path="/admin/action-plans/associated"      element={<Navigate to="/admin/action-plans/tracking?tab=associated" replace />} />
              <Route path="/admin/action-plans/follow-up"       element={<Navigate to="/admin/action-plans/tracking?tab=follow-up" replace />} />
              <Route path="/admin/action-plans/report"          element={<CapaReportsPage />} />
              <Route path="/admin/action-plans/actions-report"  element={<Navigate to="/admin/action-plans/report?tab=actions" replace />} />
              <Route path="/admin/action-plans/archive"         element={<Navigate to="/admin/action-plans?status=4" replace />} />
              <Route path="/admin/preferences"              element={<PreferencesPage />} />
              <Route path="/admin/action-plans/settings"        element={<AdminCapaSettings />} />
              <Route path="/admin/action-plans/reference"       element={<AdminCapaPlanReference />} />
              <Route path="/admin/action-plans/history"         element={<HistoryRedirect />} />
              <Route path="/admin/action-plans/create"          element={<CreateActionPlan />} />
              <Route path="/admin/action-plans/:id"             element={<PlanPage />} />
              <Route path="/admin/claims/dashboard"             element={<ClaimsBoardPage />} />
              <Route path="/admin/claims/indicators"            element={<Navigate to="/admin/claims/dashboard?tab=indicators" replace />} />
              <Route path="/admin/claims/list"                  element={<AdminClaimsList />} />
              <Route path="/admin/claims/assignments"           element={<AdminManagedClaimsPage scope="all" />} />
              <Route path="/admin/claims/analyses"              element={<ClaimsAnalysesHubPage />} />
              <Route path="/admin/claims/eight-d/:claimId"      element={<EightDPage />} />
              <Route path="/admin/claims/eight-d"               element={<Navigate to="/admin/claims/analyses?tab=eightd" replace />} />
              <Route path="/admin/claims/report"                element={<Navigate to="/admin/claims/analyses" replace />} />
              <Route path="/admin/claims/create"                element={<CreateClaimPage />} />
              <Route path="/admin/claims/import-history"        element={<HistoryImportPage />} />
              <Route path="/admin/claims/reference-lists"       element={<ReferenceListsPage />} />
              <Route path="/admin/claims/workflow"              element={<WorkflowConfigPage />} />
              <Route path="/admin/validations"                 element={<ValidationsRedirect />} />
              <Route path="/admin/permissions"        element={<PermissionsCatalogPage />} />
              <Route path="/admin/permissions/assign" element={<PermissionMatrixPage />} />
              <Route path="/admin/audit-logs"                   element={<AuditLogPage />} />
              <Route path="/admin/login-logs"                   element={<LoginLogsPage />} />
            </Route>
          </Route>

          {/* ── Front (portal) routes ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<FrontLayout />}>
              <Route path="/pages/front"                                  element={<FrontLandingPage />} />
              <Route path="/pages/front/my-action-plans"                  element={<MyActionPlans />} />
              <Route path="/pages/front/my-action-plans/:id"              element={<MyActionPlanDetail />} />
              <Route path="/pages/front/my-claims"                       element={<MyAssignedClaimsPage />} />
              <Route path="/alerts"                                      element={<AlertsPage />} />
              <Route path="/pages/front/alerts"                          element={<Navigate to="/alerts" replace />} />
              <Route path="/pages/front/action-plans/calendar"            element={<CapaCalendarPage />} />
              <Route path="/pages/front/agenda/deadlines"                 element={<DeadlinesAgendaPage />} />

              {/* Quality Analysis / Claims Module */}
              <Route path="/pages/front/quality-analyses"                 element={<ClaimsListPage />} />
              <Route path="/pages/front/quality-analyses/assigned"        element={<MyAssignedClaimsPage />} />
              <Route path="/pages/front/quality-analyses/drafts"          element={<DraftClaimsPage />} />
              <Route path="/pages/front/quality-analyses/new"             element={<CreateClaimPage />} />
              <Route path="/pages/front/quality-analyses/create"          element={<CreateClaimPage />} />
              <Route path="/pages/front/quality-analyses/5why/:claimId"   element={<FiveWhyPage />} />
              <Route path="/pages/front/quality-analyses/ishikawa/:claimId" element={<IshikawaPage />} />
              <Route path="/pages/front/quality-analyses/pareto/:claimId" element={<ParetoAnalysis />} />
              <Route path="/pages/front/quality-analyses/confinement/:claimId" element={<ContainmentPage />} />
              <Route path="/pages/front/quality-analyses/8d/:claimId" element={<EightDPage />} />
              <Route path="/pages/front/quality-analyses/parcours" element={<EightDEmployeeGuidePage />} />
              <Route path="/pages/front/quality-analyses/parcours/:claimId" element={<EightDEmployeeGuidePage />} />
              <Route path="/pages/front/quality-analyses/history"         element={<QualityClaimsHistoryPage />} />
              <Route path="/pages/front/quality-analyses/closed"          element={<ClosedClaimsArchivePage />} />

              {/* Raccourcis /claims direct (optionnels) */}
              <Route path="/claims"                                       element={<Navigate to="/pages/front/quality-analyses" replace />} />
              <Route path="/claims/create"                                element={<Navigate to="/pages/front/quality-analyses/create" replace />} />
              <Route path="/claims/5why/:claimId"                         element={<FiveWhyPage />} />
              <Route path="/claims/ishikawa/:claimId"                     element={<IshikawaPage />} />
              <Route path="/claims/pareto/:claimId"                       element={<ParetoAnalysis />} />
              <Route path="/claims/confinement/:claimId"                  element={<ContainmentPage />} />
              <Route path="/claims/8d/:claimId"                           element={<EightDPage />} />

              {/* Admin-only front pages */}
              <Route element={<FrontAdminRoute />}>
                <Route path="/pages/front/validations"                   element={<AdminValidationHub />} />
                <Route path="/pages/front/quality-analyses/managed"      element={<AdminManagedClaimsPage />} />
                <Route path="/pages/front/action-plans"                   element={<FrontActionPlans />} />
                <Route path="/pages/front/action-plans/pending-validation" element={<Navigate to="/pages/front/validations?tab=capa" replace />} />
                <Route path="/pages/front/action-plans/history"           element={<ActionPlanHistoryList />} />
                <Route path="/pages/front/action-plans/assignments"       element={<AssignmentsMapPage />} />
                <Route path="/pages/front/action-plans/:id"               element={<FrontActionPlanDetail />} />
                <Route path="/pages/front/action-plans/:actionPlanId/actions" element={<FrontPlanActionManagement />} />
              </Route>
            </Route>
          </Route>

          {/* ── Fallback ── */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      </RealtimeProvider>
      </PreferencesProvider>
      </OrganizationScopeProvider>
    </AuthProvider>
  );
};

export default App;