import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import React from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { Search, ShieldAlert } from 'lucide-react';
import { ClaimListFilters } from '../../components/ClaimListFilters';
import { Claim } from '../../types/qualityAnalysis';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { getSeverityStyle, getStatusBadge, resolveClaimStatus } from '../../utils/Claimutils';

interface ClaimSidebarListProps {
  claims: Claim[];
  selectedId: string | number | null | undefined;
  onSelect: (id: string | number) => void;
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  severityFilter: string;
  onSeverityChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  currentUserId?: string;
  claimScope?: 'created' | 'assigned' | 'all' | 'related';
}

function ownershipLabel(
  claim: Claim,
  currentUserId?: string,
  claimScope?: 'created' | 'assigned' | 'all' | 'related'
) {
  const uid = (currentUserId || '').toLowerCase();
  const assignedTo = String(claim.assignedToId || '').toLowerCase();
  const createdBy = String((claim as any).createdById || '').toLowerCase();

  if (claimScope === 'assigned') {
    return i18n.t('claimSidebar.assignedByAdmin');
  }
  if (claimScope === 'created') {
    return i18n.t('claimSidebar.createdByMe');
  }

  if (uid && createdBy === uid && assignedTo === uid) return i18n.t('claimSidebar.createdByMe');
  if (uid && createdBy === uid) return i18n.t('claimSidebar.createdByMe');
  if (uid && assignedTo === uid) return i18n.t('claimSidebar.assignedToMe');
  return claim.assignedToName || (claim.assignedToId ? i18n.t('claimSidebar.assigned') : i18n.t('claimSidebar.created'));
}

export const ClaimSidebarList: React.FC<ClaimSidebarListProps> = ({
  claims,
  selectedId,
  onSelect,
  loading,
  searchTerm,
  onSearchChange,
  severityFilter,
  onSeverityChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  currentUserId,
  claimScope = 'all',
}) => {
  const { t } = useTranslation();
  const paged = usePagedList(claims, 25);
  return (
  <div className="pfe-sidebar">
    <div className="pfe-filter-pane">
      <div className="pfe-search-input">
        <Search className="pfe-search-icon" size={14} />
        <input
          type="text"
          placeholder={t('claimSidebar.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <ClaimListFilters
        severityFilter={severityFilter}
        onSeverityChange={onSeverityChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
      />
    </div>

    <div className="pfe-list-scroll">
      {loading ? (
        <ListSkeleton rows={6} />
      ) : claims.length === 0 ? (
        <div className="pfe-empty">
          <ShieldAlert size={24} />
          <span>
            {claimScope === 'assigned'
              ? t('claimSidebar.emptyAssigned')
              : claimScope === 'created'
                ? t('claimSidebar.emptyCreated')
                : claimScope === 'related'
                  ? t('claimSidebar.emptyRelated')
                  : t('claimSidebar.emptyAll')}
          </span>
        </div>
      ) : (
        paged.rows.map((claim) => {
          const isSelected = selectedId === claim.id;
          const sev = getSeverityStyle(claim.severity);
          const status = resolveClaimStatus(claim);
          const st = getStatusBadge(status);
          const clientVal = claim.clientId || (claim as any).client_id || t('claimSidebar.clientNA');
          const ownership = ownershipLabel(claim, currentUserId, claimScope);

          return (
            <div
              key={claim.id}
              className={`pfe-card-item ${isSelected ? 'active' : ''} is-status-${status.toLowerCase()}`}
              style={{ borderLeft: `4px solid ${st.color}`, background: isSelected ? '#fff' : st.bg }}
              onClick={() => onSelect(claim.id)}
            >
              <div className="pfe-item-title">{claim.title}</div>
              <div className="pfe-item-meta">
                <span>{clientVal}</span>
                <span
                  className="pfe-badge"
                  style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}
                >
                  {sev.label}
                </span>
              </div>
              <div className="pfe-item-meta" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                <span
                  className="pfe-badge"
                  style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10 }}
                >
                  {st.label}
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{ownership}</span>
              </div>
              {status === 'CLOTUREE' && (claim.completedAt || (claim as any).CompletedAt) && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}>
                  {t('claimSidebar.closedOn')}{' '}
                  {new Date(String(claim.completedAt || (claim as any).CompletedAt)).toLocaleDateString(dateLocale())}
                  {claim.isOnTime === true && (
                    <span style={{ marginLeft: 6, color: '#059669', fontWeight: 600 }}>· {t('claimSidebar.onTime')}</span>
                  )}
                  {claim.isOnTime === false && (
                    <span style={{ marginLeft: 6, color: '#dc2626', fontWeight: 600 }}>· {t('claimSidebar.late')}</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      {!loading && claims.length > paged.pageSize && (
        <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} />
      )}
    </div>
  </div>
  );
};
