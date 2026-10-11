import React from 'react';
import {
  CLAIM_DATE_SORT_OPTIONS,
  ClaimDateSort,
  DEFAULT_CLAIM_DATE_SORT,
} from '../utils/claimDateSort';
import { useTranslation } from 'react-i18next';

interface ClaimDateSortSelectProps {
  value?: ClaimDateSort;
  onChange: (value: ClaimDateSort) => void;
  className?: string;
  id?: string;
  /** Compact label-less select for toolbars */
  ariaLabel?: string;
}

export const ClaimDateSortSelect: React.FC<ClaimDateSortSelectProps> = ({
  value = DEFAULT_CLAIM_DATE_SORT,
  onChange,
  className,
  id,
  ariaLabel,
}) => {
  const { t } = useTranslation();
  const label = ariaLabel || t('qualityHistory.sortByDate');
  return (
  <select
    id={id}
    className={className}
    aria-label={label}
    title={label}
    value={value}
    onChange={(e) => onChange(e.target.value as ClaimDateSort)}
  >
    {CLAIM_DATE_SORT_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {t(opt.label)}
      </option>
    ))}
  </select>
  );
};

export default ClaimDateSortSelect;
