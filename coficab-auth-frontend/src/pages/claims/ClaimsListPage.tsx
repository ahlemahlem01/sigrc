import { AlertCircle, ChevronDown, Download, FileSpreadsheet, FileText, Filter, Plus, Upload, XCircle } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isPlatformAdmin } from '../../utils/roles';
import { ClaimDetailCard } from '../../pages/claims/ClaimDetailCard';
import { ClaimEditModal } from '../../pages/claims/ClaimEditModal';
import { ClaimProductionModal } from '../../pages/claims/ClaimProductionModal';
import { ClaimSidebarList } from '../../pages/claims/ClaimSidebarList';
import { exportClaims } from '../../utils/claimExport';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useClaimsDirectory } from './Useclaimsdirectory';
// @ts-ignore: CSS module type declarations are not available in this project setup.
import './ClaimsListPage.styles.css';
import { useTranslation } from 'react-i18next';
import { defectLabel } from '../../utils/defectLabel';

export const ClaimsListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { accessToken, user } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const {
    claims, loading, error, searchTerm, setSearchTerm,
    severityFilter, setSeverityFilter, dateFrom, setDateFrom, dateTo, setDateTo,
    statusFilter, handleClearStatusFilter,
    selectedClaim, setSelectedClaimId, resolveCreatorName,
    isEditModalOpen, editFormData, isSaving, saveError,
    canAssign, assignableUsers,
    openStartAnalysisModal, openEditModal, closeEditModal,
    handleInputChange, handleSaveClaim,
    applySuggestedDeadline, applyingDeadline, deadlineApplyError,
    isProductionModalOpen, productionModalMode, productionFormData,
    isSavingProduction, productionSaveError, closeProductionModal,
    handleProductionInputChange, handleSubmitProductionData,
    startAnalysisError,
    mineOnly,
    assignedOnly,
    claimScope,
    setClaimScope,
    currentUserId,
    phaseView,
    setPhaseView,
    mineOpenCount,
    mineValidatedCount,
    mineClosedCount,
    mineRejectedCount,
    mineAllCount,
    alertScope,
    refetch,
  } = useClaimsDirectory(accessToken);

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  const title =
    alertScope || claimScope === 'related'
      ? t('claimsList.titleAlert')
      : claimScope === 'assigned'
        ? t('claimsList.titleAssigned')
        : claimScope === 'created'
          ? t('claimsList.titleCreated')
          : t('claimsList.titleAll');

  const subtitle =
    alertScope || claimScope === 'related'
      ? t('claimsList.subtitleAlert')
      : claimScope === 'assigned'
        ? t('claimsList.subtitleAssigned')
        : claimScope === 'created'
          ? t('claimsList.subtitleCreated')
          : t('claimsList.subtitleAll');

  const defectTypeFromUrl = searchParams.get('defectType');
  const productionLineFromUrl = searchParams.get('productionLine');
  const alertIdFromUrl = searchParams.get('alertId');
  const showPhaseToggle =
    !defectTypeFromUrl &&
    !productionLineFromUrl &&
    !alertIdFromUrl &&
    (!statusFilter || statusFilter === 'VALIDATED' || statusFilter === 'CLOTUREE' || statusFilter === 'CLOSED' || statusFilter === 'REJECTED');
  const showScopeToggle =
    !alertScope &&
    !alertIdFromUrl &&
    claimScope !== 'related' &&
    (!canAssign || claimScope !== 'all');

  const exportBasename =
    claimScope === 'created'
      ? 'reclamations_creees'
      : claimScope === 'assigned'
        ? 'reclamations_assignees'
        : 'reclamations';

  const handleExport = (format: 'csv' | 'excel') => {
    exportClaims(claims, format, exportBasename);
    setExportOpen(false);
  };

  return (
    <div className="pfe-container">
      <div className="pfe-header">
        <div className="pfe-title-box">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {!mineOnly && !assignedOnly && statusFilter && !showPhaseToggle && (
              <div className="pfe-status-filter-chip">
                <Filter size={11} /> {t('claimsList.statusFilter', { status: statusFilter })}
                <button onClick={handleClearStatusFilter} title={t('claimsList.clearFilter')}>
                  <XCircle size={13} />
                </button>
              </div>
            )}
            {(defectTypeFromUrl || productionLineFromUrl) && (
              <div className="pfe-status-filter-chip">
                <Filter size={11} />
                {defectTypeFromUrl ? t('claimsList.defectFilter', { defect: defectLabel(defectTypeFromUrl) }) : null}
                {defectTypeFromUrl && productionLineFromUrl ? ' · ' : null}
                {productionLineFromUrl ? t('claimsList.lineFilter', { line: productionLineFromUrl }) : null}
                <button onClick={handleClearStatusFilter} title={t('claimsList.clearAlertFilter')}>
                  <XCircle size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="pfe-header-buttons">
          {showScopeToggle && (
            <div className="pfe-phase-toggle" role="tablist" aria-label={t('claimsList.originLabel')}>
              <button
                type="button"
                className={`pfe-phase-btn${claimScope === 'created' ? ' active' : ''}`}
                onClick={() => setClaimScope('created')}
              >
                {t('claimsList.titleCreated')}
              </button>
              <button
                type="button"
                className={`pfe-phase-btn${claimScope === 'assigned' ? ' active' : ''}`}
                onClick={() => setClaimScope('assigned')}
              >
                {t('claimsList.titleAssigned')}
              </button>
            </div>
          )}
          {showPhaseToggle && (
            <div className="pfe-phase-toggle" role="tablist" aria-label={t('claimsList.phaseLabel')}>
              <button
                type="button"
                className={`pfe-phase-btn${phaseView === 'all' ? ' active' : ''}`}
                onClick={() => setPhaseView('all')}
              >
                {t('claimsList.phaseAll')}
                <span className="pfe-phase-count">{mineAllCount}</span>
              </button>
              <button
                type="button"
                className={`pfe-phase-btn${phaseView === 'open' ? ' active' : ''}`}
                onClick={() => setPhaseView('open')}
              >
                {t('claimsList.phaseOpen')}
                <span className="pfe-phase-count">{mineOpenCount}</span>
              </button>
              <button
                type="button"
                className={`pfe-phase-btn${phaseView === 'validated' ? ' active' : ''}`}
                onClick={() => setPhaseView('validated')}
              >
                {t('claimsList.phaseValidated')}
                <span className="pfe-phase-count">{mineValidatedCount}</span>
              </button>
              <button
                type="button"
                className={`pfe-phase-btn${phaseView === 'closed' ? ' active' : ''}`}
                onClick={() => setPhaseView('closed')}
              >
                {t('claimsList.phaseClosed')}
                <span className="pfe-phase-count">{mineClosedCount}</span>
              </button>
              <button
                type="button"
                className={`pfe-phase-btn${phaseView === 'rejected' ? ' active' : ''}`}
                onClick={() => setPhaseView('rejected')}
              >
                {t('claimsList.phaseRejected')}
                <span className="pfe-phase-count">{mineRejectedCount}</span>
              </button>
            </div>
          )}

          <div className="pfe-export-wrap" ref={exportRef}>
            <button
              type="button"
              className="pfe-btn-secondary"
              disabled={loading || claims.length === 0}
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title={claims.length === 0 ? t('claimsList.exportNone') : t('claimsList.exportFiltered')}
            >
              <Download size={15} />
              {t('claimsList.export')}
              <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="pfe-export-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => handleExport('excel')}>
                  <FileSpreadsheet size={15} />
                  Excel (.xls)
                  <span className="pfe-export-count">{claims.length}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => handleExport('csv')}>
                  <FileText size={15} />
                  CSV (.csv)
                  <span className="pfe-export-count">{claims.length}</span>
                </button>
              </div>
            )}
          </div>

          <button className="pfe-btn-primary" onClick={() => navigate(location.pathname.startsWith('/admin/claims') ? '/admin/claims/create' : '/pages/front/quality-analyses/create')}>
            <Plus size={15} /> {t('claimsList.newClaim')}
          </button>
          {isPlatformAdmin(user) && accessToken && (
            <CsvImportButton
              className="pfe-btn-secondary"
              label={t('claimsList.import')}
              entity="claims"
              columns={['Title', 'ClientId', 'DefectType', 'Severity', 'LotNumber', 'Description']}
              templateName="reclamations"
              summary={(n) => t('claimsList.imported', { count: n })}
              importFile={(file) => qualityAnalysisService.importClaimsCsv(file, accessToken)}
              onImported={() => refetch()}
            >
              <Upload size={15} />
            </CsvImportButton>
          )}
        </div>
      </div>

      {error && (
        <div className="pfe-alert-error">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {startAnalysisError && (
        <div className="pfe-alert-error">
          <AlertCircle size={15} /> {startAnalysisError}
        </div>
      )}

      {deadlineApplyError && (
        <div className="pfe-alert-error">
          <AlertCircle size={15} /> {deadlineApplyError}
        </div>
      )}

      <div className="pfe-workspace">
        <ClaimSidebarList
          claims={claims}
          selectedId={selectedClaim?.id}
          onSelect={setSelectedClaimId}
          loading={loading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          currentUserId={currentUserId}
          claimScope={claimScope}
        />
        <ClaimDetailCard
          claim={selectedClaim}
          loading={loading}
          resolveCreatorName={resolveCreatorName}
          onEdit={openEditModal}
          onOpenStartAnalysisModal={openStartAnalysisModal}
          canEdit={canAssign}
          onApplySuggestedDeadline={applySuggestedDeadline}
          applyingDeadline={applyingDeadline}
          onDeadlineExtended={() => refetch()}
        />
      </div>

      <ClaimEditModal
        isOpen={isEditModalOpen}
        formData={editFormData}
        isSaving={isSaving}
        saveError={saveError}
        onClose={closeEditModal}
        onChange={handleInputChange}
        onSubmit={handleSaveClaim}
        canAssign={canAssign}
        assignableUsers={assignableUsers}
      />

      <ClaimProductionModal
        isOpen={isProductionModalOpen}
        mode={productionModalMode}
        formData={productionFormData}
        isSaving={isSavingProduction}
        saveError={productionSaveError}
        onClose={closeProductionModal}
        onChange={handleProductionInputChange}
        onSubmit={handleSubmitProductionData}
      />
    </div>
  );
};

export default ClaimsListPage;
