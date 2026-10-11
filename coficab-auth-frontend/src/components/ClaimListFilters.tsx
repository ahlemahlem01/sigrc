import React from 'react';
import './ClaimListFilters.css';
import { useTranslation } from 'react-i18next';
import { useReferenceLists } from '../hooks/useReferenceLists';

const SEVERITIES = [
  { value: 'ALL', label: 'claimFilters.allSeverities' },
  { value: 'CRITICAL', label: 'claimStatus.severityCritical' },
  { value: 'HIGH', label: 'claimStatus.severityHigh' },
  { value: 'MEDIUM', label: 'claimStatus.severityMedium' },
  { value: 'LOW', label: 'claimStatus.severityLow' },
] as const;

interface ClaimListFiltersProps {
  severityFilter: string;
  onSeverityChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export const ClaimListFilters: React.FC<ClaimListFiltersProps> = ({
  severityFilter,
  onSeverityChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}) => {
  const { t } = useTranslation();
  const { severityLabel } = useReferenceLists();
  return (
    <div className="claim-filters">
      <div>
        <p className="claim-filters-label">{t('claimEdit.severity')}</p>
        <div className="claim-filter-row" role="group" aria-label={t('claimEdit.severity')}>
          {SEVERITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`claim-filter-chip is-${item.value.toLowerCase()}${severityFilter === item.value ? ' active' : ''}`}
              onClick={() => onSeverityChange(item.value)}
            >
              {item.value === 'ALL' ? t(item.label) : severityLabel(item.value) ?? t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="claim-filters-label">{t('claimDetail.detectionDate')}</p>
        <div className="claim-date-filter">
          <label>
            {t('qualityHistory.from')}
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => onDateFromChange(event.target.value)} />
          </label>
          <label>
            {t('qualityHistory.to')}
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => onDateToChange(event.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
};

export default ClaimListFilters;
