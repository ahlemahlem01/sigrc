import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ParetoActionsProps {
  claimId: string;
}

/** Next step of the flow: the 5 Why. The cause to dig into is chosen in the "priority cause" card above. */
export default function ParetoActions({ claimId }: ParetoActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate(`/pages/front/quality-analyses/5why/${claimId}`)} className="pareto-btn-primary">
        {t('pareto.goFiveWhy')}
      </button>
    </div>
  );
}
