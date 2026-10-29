import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  qualityAnalysisService,
  GenerateSynthesisRequestDto,
  ValidateFiveWhyStepResponseDto,
  SuggestedCapaActionDto,
} from '../../services/qualityAnalysisService';
import {
  Claim,
  FiveWhyBranch,
  FiveWhyDetails,
  FiveWhyStep,
  UpdateClaimCommand,
} from '../../types/qualityAnalysis';
import { computePpm, formatPpm } from '../../utils/Ppm';
import { AnalysisToolsNav } from './AnalysisToolsNav';
import { PriorityCauseBanner } from './PriorityCause';
import { D4ChainChecklist } from './D4Chain';
import { LockedStep, useD4Order } from './D4Order';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

interface FiveWhyPageProps {
  claimId?: string;
}

type AnalysisStatus = 'DRAFT' | 'PENDING_VALIDATION' | 'VALIDATED';

const COFICAB_NAVY = '#000168';
const COFICAB_ACCENT = '#2563EB';
const COFICAB_LIGHT_BG = '#F8FAFC';
const COFICAB_CARD_BORDER = '#E2E8F0';

const wheelColors = ['#000168', '#001A80', '#0033A0', '#004CC0', '#1A66D0'];

// Default questions are pre-filled in the current UI language; once saved they are the user's data.
const defaultBranchSteps = (branch: FiveWhyBranch): FiveWhyStep[] =>
  [1, 2, 3, 4, 5].map((n) => ({
    stepNumber: n,
    branchType: branch,
    question: i18n.t(`fiveWhy.defaultQuestion.${branch}.${n}`),
    answer: '',
  }));
const defaultOccurrenceSteps = () => defaultBranchSteps('OCCURRENCE');
const defaultDetectionSteps = () => defaultBranchSteps('DETECTION');
const defaultInitialSteps = (): FiveWhyStep[] => [...defaultOccurrenceSteps(), ...defaultDetectionSteps()];

interface SaveFiveWhyPayload {
  claimId: string;
  userId: string;
  problemStatement: string;
  rootCause: string;
  rootCauseOccurrence: string;
  rootCauseDetection: string;
  steps: FiveWhyStep[];
  statusCode: AnalysisStatus;
}

type CoachFeedbackMap = Record<string, ValidateFiveWhyStepResponseDto | undefined>;
type AcceptedMap = Record<string, boolean>;

const stepKey = (branch: FiveWhyBranch, stepNumber: number) => `${branch}-${stepNumber}`;

export const FiveWhyPage: React.FC<FiveWhyPageProps> = ({ claimId: propClaimId }) => {
  const { t } = useTranslation();
  const branchLabel = (branch: FiveWhyBranch) =>
    branch === 'OCCURRENCE' ? t('fiveWhy.occurrence') : t('fiveWhy.detection');
  const routeParams = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const { accessToken, user, isLoading: isAuthLoading } = useAuth();

  const claimId =
    propClaimId ||
    routeParams.claimId ||
    window.location.pathname.split('/').filter(Boolean).pop() ||
    '';
  const order = useD4Order(claimId);

  const isAdmin = (user as any)?.role === 'ADMIN' || (user as any)?.role === 'Admin';

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [activeBranch, setActiveBranch] = useState<FiveWhyBranch>('OCCURRENCE');

  const [fiveWhy, setFiveWhy] = useState<FiveWhyDetails | null>(null);
  const [problemStatement, setProblemStatement] = useState<string>('');
  const [rootCauseOccurrence, setRootCauseOccurrence] = useState<string>('');
  const [rootCauseDetection, setRootCauseDetection] = useState<string>('');
  const [steps, setSteps] = useState<FiveWhyStep[]>(defaultInitialSteps);
  const [status, setStatus] = useState<AnalysisStatus>('DRAFT');

  const [isEditingProblem, setIsEditingProblem] = useState<boolean>(false);
  const [activeHoverIdx, setActiveHoverIdx] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [generatingSynthesis, setGeneratingSynthesis] = useState<boolean>(false);
  const [validatingStepKey, setValidatingStepKey] = useState<string | null>(null);
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedbackMap>({});
  const [acceptedSteps, setAcceptedSteps] = useState<AcceptedMap>({});

  const [capaTitle, setCapaTitle] = useState('');
  const [capaDescription, setCapaDescription] = useState('');
  const [capaDeadline, setCapaDeadline] = useState('');
  const [capaActions, setCapaActions] = useState<SuggestedCapaActionDto[]>([]);
  const [existingCapaId, setExistingCapaId] = useState<string | null>(null);
  const [suggestingCapa, setSuggestingCapa] = useState(false);
  const [creatingCapa, setCreatingCapa] = useState(false);

  const [claim, setClaim] = useState<Claim | null>(null);
  const [isEditingQuantities, setIsEditingQuantities] = useState<boolean>(false);
  const [producedQtyInput, setProducedQtyInput] = useState<string>('');
  const [defectiveQtyInput, setDefectiveQtyInput] = useState<string>('');
  const [savingQuantities, setSavingQuantities] = useState<boolean>(false);
  const [ppmError, setPpmError] = useState<string | null>(null);

  const branchSteps = useMemo(
    () =>
      steps
        .filter((s) => (s.branchType || 'OCCURRENCE') === activeBranch)
        .sort((a, b) => a.stepNumber - b.stepNumber),
    [steps, activeBranch]
  );

  const combinedRootCause = useMemo(() => {
    const parts: string[] = [];
    if (rootCauseOccurrence.trim()) parts.push(`OCCURRENCE : ${rootCauseOccurrence.trim()}`);
    if (rootCauseDetection.trim()) parts.push(`DETECTION : ${rootCauseDetection.trim()}`);
    return parts.join('\n\n');
  }, [rootCauseOccurrence, rootCauseDetection]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, activeBranch]);

  const ensureDualBranches = (rawSteps: FiveWhyStep[]): FiveWhyStep[] => {
    const byBranch = (branch: FiveWhyBranch) =>
      rawSteps
        .filter((s) => (s.branchType || 'OCCURRENCE') === branch)
        .sort((a, b) => a.stepNumber - b.stepNumber);

    let occurrence = byBranch('OCCURRENCE');
    let detection = byBranch('DETECTION');

    // Legacy analyses without BranchType → toutes en OCCURRENCE
    if (occurrence.length === 0 && detection.length === 0 && rawSteps.length > 0) {
      occurrence = rawSteps.map((s, idx) => ({
        ...s,
        stepNumber: s.stepNumber || idx + 1,
        branchType: 'OCCURRENCE' as FiveWhyBranch,
      }));
    }

    if (occurrence.length === 0) occurrence = defaultOccurrenceSteps();
    if (detection.length === 0) detection = defaultDetectionSteps();

    // Compléter jusqu'à 5 si besoin
    const pad = (list: FiveWhyStep[], defaults: FiveWhyStep[], branch: FiveWhyBranch) => {
      const result = [...list];
      for (let i = result.length; i < 5; i++) {
        result.push({ ...defaults[i], branchType: branch, answer: '' });
      }
      return result.slice(0, 5).map((s, idx) => ({
        ...s,
        stepNumber: idx + 1,
        branchType: branch,
      }));
    };

    return [
      ...pad(occurrence, defaultOccurrenceSteps(), 'OCCURRENCE'),
      ...pad(detection, defaultDetectionSteps(), 'DETECTION'),
    ];
  };

  const loadFiveWhy = useCallback(async (isSilent = false) => {
    if (isAuthLoading) return;
    if (!claimId) {
      setError(i18n.t('fiveWhy.missingClaimId'));
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    setError(null);

    try {
      const data = await qualityAnalysisService.getFiveWhy(claimId, accessToken || undefined);
      const rawData = data as any;

      setFiveWhy(data);
      setProblemStatement(rawData?.problemStatement || '');
      setRootCauseOccurrence(rawData?.rootCauseOccurrence || '');
      setRootCauseDetection(rawData?.rootCauseDetection || '');

      // Si seules les causes duales manquent mais rootCause combiné existe
      if (!rawData?.rootCauseOccurrence && !rawData?.rootCauseDetection && rawData?.rootCause) {
        const combined = String(rawData.rootCause);
        const occMatch = combined.match(/OCCURRENCE\s*:\s*([\s\S]*?)(?=DETECTION\s*:|$)/i);
        const detMatch = combined.match(/DETECTION\s*:\s*([\s\S]*)$/i);
        if (occMatch || detMatch) {
          setRootCauseOccurrence((occMatch?.[1] || '').trim());
          setRootCauseDetection((detMatch?.[1] || '').trim());
        } else {
          setRootCauseOccurrence(combined);
        }
      }

      const rawStatusCode = (rawData?.statusCode || rawData?.status || '').toString().toUpperCase().trim();
      let currentStatus: AnalysisStatus = 'DRAFT';
      if (rawStatusCode === 'VALIDATED') currentStatus = 'VALIDATED';
      else if (rawStatusCode === 'PENDING_VALIDATION' || rawStatusCode === 'PENDING') currentStatus = 'PENDING_VALIDATION';
      else if (rawData?.isValidated) currentStatus = 'VALIDATED';
      else currentStatus = 'DRAFT';
      setStatus(currentStatus);

      const rawSteps = rawData?.steps || [];
      if (Array.isArray(rawSteps) && rawSteps.length > 0) {
        const normalized: FiveWhyStep[] = rawSteps.map((s: any, idx: number) => ({
          stepNumber: s.stepNumber || s.step_number || idx + 1,
          branchType: ((s.branchType || s.branch_type || 'OCCURRENCE') as string).toUpperCase() === 'DETECTION'
            ? 'DETECTION'
            : 'OCCURRENCE',
          question: s.question || '',
          answer: s.answer || '',
        }));
        const dual = ensureDualBranches(normalized);
        setSteps(dual);

        // Pré-accepter les steps déjà renseignés (analyse existante)
        const accepted: AcceptedMap = {};
        dual.forEach((s) => {
          if (s.answer?.trim()) {
            const branch = (s.branchType === 'DETECTION' ? 'DETECTION' : 'OCCURRENCE') as FiveWhyBranch;
            accepted[stepKey(branch, s.stepNumber)] = true;
          }
        });
        setAcceptedSteps(accepted);

        const hasAnswers = dual.some((s) => s.answer && s.answer.trim() !== '');
        if (hasAnswers || currentStatus !== 'DRAFT') setCurrentStep(2);
      } else {
        setSteps(defaultInitialSteps());
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setFiveWhy(null);
        setProblemStatement('');
        setRootCauseOccurrence('');
        setRootCauseDetection('');
        setStatus('DRAFT');
        setSteps(defaultInitialSteps());
        setAcceptedSteps({});
        setCoachFeedback({});
        setCurrentStep(1);
        setError(null);
      } else {
        setError(err.response?.data?.message || i18n.t('fiveWhy.loadFailed'));
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [claimId, accessToken, isAuthLoading]);

  const loadClaim = useCallback(async (isSilent = false) => {
    if (isAuthLoading || !claimId) return;
    if (!isSilent) setPpmError(null);
    try {
      const data = await qualityAnalysisService.getClaimById(claimId, accessToken || undefined);
      setClaim(data);
      setProducedQtyInput(data.producedQuantity != null ? String(data.producedQuantity) : '');
      setDefectiveQtyInput(data.defectiveQuantity != null ? String(data.defectiveQuantity) : '');
    } catch {
      setClaim(null);
    }
  }, [claimId, accessToken, isAuthLoading]);

  const loadExistingCapa = useCallback(async () => {
    if (isAuthLoading || !claimId || !accessToken) return;
    try {
      const plans = await qualityAnalysisService.getCapaForClaim(claimId, accessToken);
      if (Array.isArray(plans) && plans.length > 0) {
        setExistingCapaId(plans[0].id || plans[0].Id || null);
      } else {
        setExistingCapaId(null);
      }
    } catch {
      setExistingCapaId(null);
    }
  }, [claimId, accessToken, isAuthLoading]);

  useEffect(() => {
    loadFiveWhy();
    loadClaim();
    loadExistingCapa();
  }, [loadFiveWhy, loadClaim, loadExistingCapa]);

  const handleSuggestCapa = async () => {
    setError(null);
    setSuccessMsg(null);
    if (!claimId) return;
    if (!rootCauseOccurrence.trim() || !rootCauseDetection.trim()) {
      setError(t('fiveWhy.capaNeedsCauses'));
      return;
    }

    setSuggestingCapa(true);
    try {
      const result = await qualityAnalysisService.suggestCapaFromFiveWhy(
        claimId,
        {
          problemStatement,
          rootCauseOccurrence,
          rootCauseDetection,
          claimTitle: claim?.title,
        },
        accessToken || undefined
      );
      setCapaTitle(result.planTitle || '');
      setCapaDescription(result.planDescription || '');
      setCapaActions(
        (result.actions || []).map((a) => ({
          ...a,
          suggestedDeadlineDays: a.suggestedDeadlineDays > 0 ? a.suggestedDeadlineDays : 14,
        }))
      );
      // Échéance plan par défaut = max(jours suggérés actions, 21)
      const maxDays = Math.max(
        21,
        ...(result.actions || []).map((a) => a.suggestedDeadlineDays || 14)
      );
      const d = new Date();
      d.setDate(d.getDate() + maxDays);
      setCapaDeadline(d.toISOString().slice(0, 10));
      setSuccessMsg(t('fiveWhy.capaSuggested'));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError(t('fiveWhy.sessionExpired401'));
      } else {
        setError(err?.response?.data?.message || err?.message || t('fiveWhy.capaSuggestFailed'));
      }
    } finally {
      setSuggestingCapa(false);
    }
  };

  const handleCreateCapa = async () => {
    setError(null);
    setSuccessMsg(null);
    if (!claimId) return;
    if (!capaActions.length) {
      setError(t('fiveWhy.capaNoActions'));
      return;
    }

    setCreatingCapa(true);
    try {
      const result = await qualityAnalysisService.createCapaFromFiveWhy(
        claimId,
        {
          planTitle: capaTitle,
          planDescription: capaDescription,
          deadline: capaDeadline ? new Date(capaDeadline).toISOString() : undefined,
          actions: capaActions.map((a) => ({
            ...a,
            suggestedDeadlineDays: Number(a.suggestedDeadlineDays) > 0 ? Number(a.suggestedDeadlineDays) : 14,
          })),
        },
        accessToken || undefined
      );
      setExistingCapaId(result.id);
      setSuccessMsg(result.message || t('fiveWhy.capaCreated'));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError(t('fiveWhy.sessionExpired401'));
      } else if (err?.response?.status === 409) {
        const existingId = err?.response?.data?.existingPlanId;
        if (existingId) setExistingCapaId(existingId);
        setError(err?.response?.data?.message || t('fiveWhy.capaExists'));
      } else {
        setError(err?.response?.data?.message || err?.message || t('fiveWhy.capaCreateFailed'));
      }
    } finally {
      setCreatingCapa(false);
    }
  };

  const updateCapaAction = (index: number, field: keyof SuggestedCapaActionDto, value: string | number) => {
    setCapaActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };

  const updateBranchStep = (branch: FiveWhyBranch, stepNumber: number, patch: Partial<FiveWhyStep>) => {
    setSteps((prev) =>
      prev.map((s) =>
        (s.branchType || 'OCCURRENCE') === branch && s.stepNumber === stepNumber
          ? { ...s, ...patch }
          : s
      )
    );
  };

  const handleQuestionChange = (branch: FiveWhyBranch, stepNumber: number, val: string) => {
    updateBranchStep(branch, stepNumber, { question: val });
  };

  const handleAnswerChange = (branch: FiveWhyBranch, stepNumber: number, val: string) => {
    updateBranchStep(branch, stepNumber, { answer: val });
    const key = stepKey(branch, stepNumber);
    setAcceptedSteps((prev) => ({ ...prev, [key]: false }));
    setCoachFeedback((prev) => ({ ...prev, [key]: undefined }));
  };

  const isStepUnlocked = (branch: FiveWhyBranch, stepNumber: number): boolean => {
    if (stepNumber <= 1) return true;
    return !!acceptedSteps[stepKey(branch, stepNumber - 1)];
  };

  const validateStep1 = (): boolean => {
    if (!problemStatement.trim()) {
      setError(t('fiveWhy.problemRequired'));
      return false;
    }
    const hasEmptyQuestion = steps.some((step) => !step.question || !step.question.trim());
    if (hasEmptyQuestion) {
      setError(t('fiveWhy.questionsRequired'));
      return false;
    }
    return true;
  };

  const requireUserId = (): string | null => {
    if (!user?.id) {
      setError(t('ishikawa.invalidSession'));
      return null;
    }
    return user.id;
  };

  const buildPayload = (userId: string, statusCode: AnalysisStatus): SaveFiveWhyPayload => ({
    claimId,
    userId,
    problemStatement,
    rootCause: combinedRootCause,
    rootCauseOccurrence,
    rootCauseDetection,
    steps,
    statusCode,
  });

  const goToStep2 = async () => {
    setError(null);
    if (!validateStep1()) return;
    const userId = requireUserId();
    if (!userId) return;

    setCurrentStep(2);
    try {
      await qualityAnalysisService.saveFiveWhy(buildPayload(userId, 'DRAFT'), accessToken || undefined);
    } catch {
      setError(t('fiveWhy.autosaveFailed'));
    }
  };

  const handleValidateQuestions = (e: React.FormEvent) => {
    e.preventDefault();
    void goToStep2();
  };

  const handleSaveDraft = async () => {
    if (!claimId) return;
    setError(null);
    setSuccessMsg(null);
    const userId = requireUserId();
    if (!userId) return;

    setSaving(true);
    try {
      await qualityAnalysisService.saveFiveWhy(buildPayload(userId, 'DRAFT'), accessToken || undefined);
      setStatus('DRAFT');
      setSuccessMsg(t('fiveWhy.draftSaved'));
      await loadFiveWhy(true);
    } catch (err: any) {
      setError(err.response?.data?.message || t('fiveWhy.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleCoachValidate = async (branch: FiveWhyBranch, stepNumber: number) => {
    setError(null);
    setSuccessMsg(null);

    if (!claimId) {
      setError(t('fiveWhy.missingClaimId'));
      return;
    }

    const step = steps.find((s) => (s.branchType || 'OCCURRENCE') === branch && s.stepNumber === stepNumber);
    if (!step?.answer?.trim()) {
      setError(t('fiveWhy.answerFirst'));
      return;
    }

    if (!isStepUnlocked(branch, stepNumber)) {
      setError(t('fiveWhy.previousFirst'));
      return;
    }

    const key = stepKey(branch, stepNumber);
    setValidatingStepKey(key);

    try {
      const previousSteps = steps
        .filter((s) => (s.branchType || 'OCCURRENCE') === branch && s.stepNumber < stepNumber)
        .sort((a, b) => a.stepNumber - b.stepNumber);

      const result = await qualityAnalysisService.validateFiveWhyStep(
        claimId,
        {
          stepNumber,
          branch,
          problemStatement,
          proposedAnswer: step.answer,
          previousSteps,
        },
        accessToken || undefined
      );

      setCoachFeedback((prev) => ({ ...prev, [key]: result }));

      if (result.severity === 'OK' || result.isAccepted) {
        setAcceptedSteps((prev) => ({ ...prev, [key]: true }));
        setSuccessMsg(t('fiveWhy.coachAccepted', { n: stepNumber, branch: branchLabel(branch) }));
      } else if (result.severity === 'BLOCK') {
        setAcceptedSteps((prev) => ({ ...prev, [key]: false }));
      }
      // WARN : pas accepté tant que l'utilisateur n'a pas forcé
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setError(t('fiveWhy.sessionExpiredCoach'));
      } else {
        setError(err?.response?.data?.message || err?.message || t('fiveWhy.coachFailed'));
      }
    } finally {
      setValidatingStepKey(null);
    }
  };

  const handleForceContinue = (branch: FiveWhyBranch, stepNumber: number) => {
    const key = stepKey(branch, stepNumber);
    const feedback = coachFeedback[key];
    if (!feedback || feedback.severity === 'BLOCK') return;
    setAcceptedSteps((prev) => ({ ...prev, [key]: true }));
    setSuccessMsg(t('fiveWhy.forced', { n: stepNumber }));
  };

  const handleGenerateSynthesis = async (branch: FiveWhyBranch) => {
    setError(null);
    setSuccessMsg(null);

    if (!claimId) {
      setError(t('fiveWhy.missingClaimId'));
      return;
    }

    const targetSteps = steps
      .filter((s) => (s.branchType || 'OCCURRENCE') === branch)
      .sort((a, b) => a.stepNumber - b.stepNumber);

    if (targetSteps.some((s) => !s.answer?.trim())) {
      setError(t('fiveWhy.answerAllFirst', { branch: branchLabel(branch) }));
      return;
    }

    setGeneratingSynthesis(true);
    try {
      const payload: GenerateSynthesisRequestDto = {
        why1: targetSteps[0]?.answer || '',
        why2: targetSteps[1]?.answer || '',
        why3: targetSteps[2]?.answer || '',
        why4: targetSteps[3]?.answer || '',
        why5: targetSteps[4]?.answer || '',
        claimTitle: branch === 'OCCURRENCE' ? 'Cause racine Occurrence' : 'Cause racine Détection',
        defectDescription: `${problemStatement}\n[Branche ${branch}]`,
      };

      const data = await qualityAnalysisService.generateFiveWhySynthesis(
        claimId,
        payload,
        accessToken || undefined
      );

      if (!data?.rootCauseSynthesis) {
        throw new Error(t('fiveWhy.noSynthesis'));
      }

      if (branch === 'OCCURRENCE') setRootCauseOccurrence(data.rootCauseSynthesis);
      else setRootCauseDetection(data.rootCauseSynthesis);

      setSuccessMsg(t('fiveWhy.synthesisDone', { branch: branchLabel(branch) }));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || t('fiveWhy.synthesisFailed'));
    } finally {
      setGeneratingSynthesis(false);
    }
  };

  const handleToggleStatus = async (targetStatus: AnalysisStatus) => {
    setError(null);
    setSuccessMsg(null);

    if (targetStatus === 'DRAFT' && status === 'VALIDATED' && !isAdmin) {
      setError(t('fiveWhy.adminOnlyRevert'));
      return;
    }

    if (targetStatus === 'DRAFT' && status !== 'DRAFT') {
      const confirmMsg =
        status === 'VALIDATED'
          ? t('fiveWhy.confirmRevertValidated')
          : t('fiveWhy.confirmRevertPending');
      if (!window.confirm(confirmMsg)) return;
    }

    if (targetStatus === 'PENDING_VALIDATION') {
      if (steps.some((s) => !s.question?.trim())) {
        setError(t('fiveWhy.emptyQuestions'));
        return;
      }
      if (steps.some((s) => !s.answer?.trim())) {
        setError(t('fiveWhy.answersRequired'));
        return;
      }
      if (!rootCauseOccurrence.trim() || !rootCauseDetection.trim()) {
        setError(t('fiveWhy.rootCausesRequired'));
        return;
      }
    }

    const userId = requireUserId();
    if (!userId) return;

    setSaving(true);
    try {
      const savedData = await qualityAnalysisService.saveFiveWhy(
        buildPayload(userId, targetStatus),
        accessToken || undefined
      );

      const currentAnalysisId = fiveWhy?.id || (savedData as any)?.id;

      if (targetStatus === 'PENDING_VALIDATION') {
        if (!currentAnalysisId) {
          throw new Error(
            t('fiveWhy.missingAnalysisId')
          );
        }
        await qualityAnalysisService.validateFiveWhy(
          {
            analysisId: currentAnalysisId,
            isApproved: false,
            statusCode: 'PENDING_VALIDATION',
            validatedBy: userId,
          } as any,
          accessToken || undefined
        );
      }

      setStatus(targetStatus);
      setSuccessMsg(
        targetStatus === 'PENDING_VALIDATION'
          ? t('fiveWhy.submitted')
          : t('fiveWhy.revertedToDraft')
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || t('fiveWhy.statusFailed'));
    } finally {
      await loadFiveWhy(true);
      setSaving(false);
    }
  };

  const handleSaveQuantities = async () => {
    setPpmError(null);
    setSuccessMsg(null);
    if (!claimId) return;
    const userId = requireUserId();
    if (!userId) return;

    const producedValue = producedQtyInput.trim() === '' ? null : Number(producedQtyInput);
    const defectiveValue = defectiveQtyInput.trim() === '' ? null : Number(defectiveQtyInput);

    if (producedValue !== null && (Number.isNaN(producedValue) || producedValue < 0)) {
      setPpmError(t('fiveWhy.invalidProduced'));
      return;
    }
    if (defectiveValue !== null && (Number.isNaN(defectiveValue) || defectiveValue < 0)) {
      setPpmError(t('fiveWhy.invalidDefective'));
      return;
    }
    // The PPM needs both quantities, and an empty field cannot clear a stored value: ask for both, coherent.
    if (producedValue === null || defectiveValue === null) {
      setPpmError(t('fiveWhy.quantitiesBothRequired'));
      return;
    }
    const check = computePpm({ producedQuantity: producedValue, defectiveQuantity: defectiveValue });
    if (!check.isComputable) {
      setPpmError(check.reason || t('fiveWhy.ppmNotComputable'));
      return;
    }

    setSavingQuantities(true);
    try {
      await qualityAnalysisService.updateClaim(
        claimId,
        {
          id: claimId,
          updatedById: userId,
          producedQuantity: producedValue,
          defectiveQuantity: defectiveValue,
        } as UpdateClaimCommand,
        accessToken || undefined
      );
      setSuccessMsg(t('fiveWhy.quantitiesSaved'));
      setIsEditingQuantities(false);
      await loadClaim(true);
    } catch (err: any) {
      setPpmError(err?.response?.data?.message || t('fiveWhy.quantitiesFailed'));
    } finally {
      setSavingQuantities(false);
    }
  };

  const ppmResult = computePpm({
    producedQuantity: claim?.producedQuantity,
    defectiveQuantity: claim?.defectiveQuantity,
  });

  const getSlicePath = (index: number, total: number, outerR = 175, innerR = 52) => {
    if (!total || total === 0) return '';
    const angle = (2 * Math.PI) / total;
    const startAngle = index * angle - Math.PI / 2;
    const endAngle = (index + 1) * angle - Math.PI / 2;
    const cx = 210;
    const cy = 210;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  const branchTab = (branch: FiveWhyBranch, label: string, subtitle: string) => {
    const active = activeBranch === branch;
    return (
      <button
        type="button"
        onClick={() => setActiveBranch(branch)}
        style={{
          flex: 1,
          textAlign: 'left',
          padding: '12px 14px',
          borderRadius: '6px',
          border: active ? `1px solid ${COFICAB_NAVY}` : `1px solid ${COFICAB_CARD_BORDER}`,
          background: active ? '#EEF2FF' : '#FFF',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '13px', color: COFICAB_NAVY }}>{label}</div>
        <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>{subtitle}</div>
      </button>
    );
  };

  const renderCoachPanel = (branch: FiveWhyBranch, stepNumber: number) => {
    const key = stepKey(branch, stepNumber);
    const feedback = coachFeedback[key];
    if (!feedback) return null;

    const bg =
      feedback.severity === 'BLOCK' ? '#FEF2F2' :
      feedback.severity === 'WARN' ? '#FFFBEB' : '#ECFDF5';
    const border =
      feedback.severity === 'BLOCK' ? '#FECACA' :
      feedback.severity === 'WARN' ? '#FDE68A' : '#A7F3D0';
    const titleColor =
      feedback.severity === 'BLOCK' ? '#991B1B' :
      feedback.severity === 'WARN' ? '#92400E' : '#065F46';

    return (
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 6, background: bg, border: `1px solid ${border}` }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: titleColor, marginBottom: 4 }}>
          {t('fiveWhy.coachTitle')} · {feedback.severity}
          {feedback.flags?.length ? ` · ${feedback.flags.join(', ')}` : ''}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.45 }}>{feedback.coachMessage}</p>
        {feedback.suggestedFollowUpQuestions?.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#475569', fontSize: 12 }}>
            {feedback.suggestedFollowUpQuestions.map((q, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{q}</li>
            ))}
          </ul>
        )}
        {feedback.severity === 'WARN' && !acceptedSteps[key] && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleForceContinue(branch, stepNumber)}
            style={{ marginTop: 8, fontSize: 12 }}
          >
            {t('fiveWhy.continueAnyway')}
          </button>
        )}
      </div>
    );
  };

  if (isAuthLoading || loading) {
    return (
      <p style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontFamily: 'system-ui, sans-serif' }}>
        {t('fiveWhy.loading')}
      </p>
    );
  }

  const lockedBy = order.lockReason('fiveWhy');
  if (lockedBy) {
    return (
      <div style={{ maxWidth: 1140, margin: '16px auto', padding: '0 16px' }}>
        <AnalysisToolsNav claimId={claimId} active="fiveWhy" />
        <LockedStep claimId={claimId} reason={lockedBy} />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '1140px',
        margin: '24px auto',
        padding: '24px 28px',
        background: COFICAB_LIGHT_BG,
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 1, 104, 0.05)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#1E293B',
      }}
    >
      <style>{`
        @keyframes continuousSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .rotating-wheel-group {
          animation: continuousSpin 35s linear infinite;
          transform-origin: 210px 210px;
        }
        .rotating-wheel-group:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .rotating-wheel-group { animation: none; }
        }
        .coficab-input:focus {
          border-color: ${COFICAB_ACCENT} !important;
          outline: none;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
        }
        .btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 7px 14px; font-size: 13px; font-weight: 500;
          border-radius: 6px; border: 1px solid transparent; cursor: pointer;
          transition: all 0.15s ease; user-select: none; outline: none; line-height: 1.4;
        }
        .btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .btn-primary { background-color: ${COFICAB_NAVY}; color: #FFFFFF; }
        .btn-primary:hover:not(:disabled) { background-color: ${COFICAB_ACCENT}; }
        .btn-secondary { background-color: #FFFFFF; color: #334155; border-color: #CBD5E1; }
        .btn-secondary:hover:not(:disabled) { background-color: #F1F5F9; border-color: #94A3B8; }
        .btn-link { background: transparent; color: ${COFICAB_ACCENT}; padding: 4px 8px; font-size: 12px; font-weight: 600; }
      `}</style>

      {claimId && (
        <AnalysisToolsNav claimId={claimId} active="fiveWhy" claimTitle={claim?.title} />
      )}

      {claimId && (
        <PriorityCauseBanner
          claimId={claimId}
          // Offered only when it cannot overwrite anything: the first answer of the occurrence branch is still empty.
          onUse={
            currentStep === 2 &&
            !steps.find((s) => (s.branchType || 'OCCURRENCE') === 'OCCURRENCE' && s.stepNumber === 1)?.answer?.trim()
              ? (causeText) => {
                  setActiveBranch('OCCURRENCE');
                  handleAnswerChange('OCCURRENCE', 1, causeText);
                }
              : undefined
          }
        />
      )}
      {claimId && <D4ChainChecklist claimId={claimId} rootCauseText={rootCauseOccurrence.trim() || undefined} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '4px', height: '18px', background: COFICAB_NAVY, borderRadius: '2px' }} />
            <h2 style={{ margin: 0, color: COFICAB_NAVY, fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em' }}>
              {t('fiveWhy.title')}
            </h2>
          </div>
          <p style={{ margin: '3px 0 0 12px', color: '#64748B', fontSize: '13px' }}>
            {t('fiveWhy.claimLabel')} <span style={{ fontFamily: 'monospace', color: COFICAB_NAVY, fontWeight: '600' }}>{claimId}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {status === 'VALIDATED' && (
            <span style={{ padding: '5px 12px', borderRadius: '12px', background: '#D1FAE5', color: '#065F46', fontWeight: '600', fontSize: '12px' }}>{t('fiveWhy.badgeValidated')}</span>
          )}
          {status === 'PENDING_VALIDATION' && (
            <span style={{ padding: '5px 12px', borderRadius: '12px', background: '#DBEAFE', color: '#1E40AF', fontWeight: '600', fontSize: '12px' }}>{t('fiveWhy.badgePending')}</span>
          )}
          {status === 'DRAFT' && (
            <span style={{ padding: '5px 12px', borderRadius: '12px', background: '#FEF3C7', color: '#92400E', fontWeight: '600', fontSize: '12px' }}>{t('claimStatus.draft')}</span>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: '16px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '10px 14px', marginBottom: '16px', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '6px', fontSize: '13px' }}>
          {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div
          onClick={() => setCurrentStep(1)}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', textAlign: 'center',
            backgroundColor: currentStep === 1 ? COFICAB_NAVY : '#FFFFFF',
            color: currentStep === 1 ? '#FFFFFF' : '#64748B',
            border: currentStep === 1 ? '1px solid transparent' : '1px solid #E2E8F0',
            cursor: 'pointer',
          }}
        >
          {t('fiveWhy.step1')}
        </div>
        <div
          onClick={() => {
            setError(null);
            if (!validateStep1()) return;
            void goToStep2();
          }}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', textAlign: 'center',
            backgroundColor: currentStep === 2 ? COFICAB_NAVY : '#FFFFFF',
            color: currentStep === 2 ? '#FFFFFF' : '#64748B',
            border: currentStep === 2 ? '1px solid transparent' : '1px solid #E2E8F0',
            cursor: 'pointer',
          }}
        >
          {t('fiveWhy.step2')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {branchTab('OCCURRENCE', t('fiveWhy.branchOccurrence'), t('fiveWhy.branchOccurrenceHint'))}
        {branchTab('DETECTION', t('fiveWhy.branchDetection'), t('fiveWhy.branchDetectionHint'))}
      </div>

      {currentStep === 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 14px', borderRadius: 8, background: '#FFF', border: `1px solid ${COFICAB_CARD_BORDER}`, borderLeft: `4px solid ${COFICAB_NAVY}` }}>
          <span style={{ fontWeight: 700, color: COFICAB_NAVY, fontSize: 12, textTransform: 'uppercase' }}>{t('fiveWhy.ppmTitle')}</span>
          {ppmResult.isComputable
            ? <strong style={{ color: COFICAB_NAVY }}>{formatPpm(ppmResult.value as number)} <span style={{ fontSize: 11, color: '#64748B' }}>PPM</span></strong>
            : <span style={{ fontSize: 12, color: '#92400E', fontStyle: 'italic' }}>{ppmResult.reason || t('fiveWhy.ppmNotComputable')}</span>}
          <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => { setCurrentStep(2); setIsEditingQuantities(true); }}>
            {t('fiveWhy.enterQuantities')}
          </button>
        </div>
      )}

      {currentStep === 1 && (
        <form onSubmit={handleValidateQuestions} style={{ background: '#FFF', padding: '20px', borderRadius: '8px', border: `1px solid ${COFICAB_CARD_BORDER}` }}>
          <div style={{ borderLeft: `3px solid ${COFICAB_NAVY}`, paddingLeft: '12px', marginBottom: '18px' }}>
            <label style={{ display: 'block', fontWeight: '600', color: COFICAB_NAVY, marginBottom: '6px', fontSize: '13px' }}>
              {t('fiveWhy.problem')} *
            </label>
            <textarea
              rows={2}
              required
              className="coficab-input"
              placeholder={t('fiveWhy.problemPlaceholder')}
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <h3 style={{ margin: '0 0 12px', color: COFICAB_NAVY, fontSize: '15px', fontWeight: '600' }}>
            {t('fiveWhy.questionsFor', { branch: branchLabel(activeBranch) })}
          </h3>

          {branchSteps.map((step) => (
            <div key={`${step.branchType}-${step.stepNumber}`} style={{ marginBottom: '12px', background: COFICAB_LIGHT_BG, padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: '600', color: COFICAB_ACCENT, fontSize: '12px', marginBottom: 4 }}>
                {t('fiveWhy.why', { n: String(step.stepNumber).padStart(2, '0') })}
              </div>
              <input
                type="text"
                required
                className="coficab-input"
                value={step.question}
                onChange={(e) => handleQuestionChange(activeBranch, step.stepNumber, e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary">
              {t('fiveWhy.goStep2')}
            </button>
          </div>
        </form>
      )}

      {currentStep === 2 && (
        <div>
          <div style={{ background: '#FFF', padding: '14px 18px', borderRadius: '8px', borderLeft: `4px solid ${COFICAB_NAVY}`, border: `1px solid ${COFICAB_CARD_BORDER}`, borderLeftWidth: '4px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '700', color: COFICAB_NAVY, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {t('fiveWhy.problem')}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/pages/front/quality-analyses/ishikawa/${claimId}`)}
                  style={{ color: COFICAB_ACCENT, borderColor: COFICAB_ACCENT }}
                >
                  Ishikawa →
                </button>
                <button
                  type="button"
                  className={isEditingProblem ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setIsEditingProblem(!isEditingProblem)}
                >
                  {isEditingProblem ? t('fiveWhy.confirm') : t('fiveWhy.editProblem')}
                </button>
              </div>
            </div>
            {isEditingProblem ? (
              <textarea
                rows={2}
                className="coficab-input"
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                style={{ width: '100%', marginTop: '8px', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${COFICAB_NAVY}`, fontSize: '13px', fontFamily: 'inherit' }}
              />
            ) : (
              <p style={{ margin: '4px 0 0', color: '#334155', fontSize: '14px', fontWeight: '500', lineHeight: '1.4' }}>
                {problemStatement || t('fiveWhy.noProblem')}
              </p>
            )}
          </div>

          <div style={{ background: '#FFF', padding: '14px 18px', borderRadius: '8px', borderLeft: `4px solid ${COFICAB_NAVY}`, border: `1px solid ${COFICAB_CARD_BORDER}`, borderLeftWidth: '4px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '700', color: COFICAB_NAVY, fontSize: '13px', textTransform: 'uppercase' }}>{t('fiveWhy.ppmTitle')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {ppmResult.isComputable ? (
                  <span style={{ fontSize: '22px', fontWeight: '700', color: COFICAB_NAVY }}>
                    {formatPpm(ppmResult.value as number)} <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>PPM</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#92400E', fontStyle: 'italic' }}>{ppmResult.reason || t('fiveWhy.ppmNotComputable')}</span>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditingQuantities(!isEditingQuantities)}>
                  {isEditingQuantities ? t('fiveWhy.close') : t('fiveWhy.enterQuantities')}
                </button>
              </div>
            </div>
            {isEditingQuantities && (
              <div style={{ marginTop: '14px', display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>{t('fiveWhy.producedQty')}</label>
                  <input type="number" min={0} className="coficab-input" value={producedQtyInput} onChange={(e) => setProducedQtyInput(e.target.value)} style={{ width: '160px', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>{t('fiveWhy.defectiveQty')}</label>
                  <input type="number" min={0} className="coficab-input" value={defectiveQtyInput} onChange={(e) => setDefectiveQtyInput(e.target.value)} style={{ width: '160px', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }} />
                </div>
                <button type="button" className="btn btn-primary" onClick={handleSaveQuantities} disabled={savingQuantities}>
                  {savingQuantities ? t('common.saving') : t('common.save')}
                </button>
              </div>
            )}
            {ppmError && <p style={{ marginTop: '10px', fontSize: '12px', color: '#991B1B' }}>{ppmError}</p>}
          </div>

          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 6,
            background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E3A8A', fontSize: 13,
          }}>
            {t('fiveWhy.iatfNote')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {branchSteps.map((step, idx) => {
                const unlocked = isStepUnlocked(activeBranch, step.stepNumber);
                const key = stepKey(activeBranch, step.stepNumber);
                const accepted = !!acceptedSteps[key];
                const isHovered = activeHoverIdx === idx;
                const validating = validatingStepKey === key;

                return (
                  <div
                    key={key}
                    onMouseEnter={() => setActiveHoverIdx(idx)}
                    onMouseLeave={() => setActiveHoverIdx(null)}
                    style={{
                      opacity: unlocked ? 1 : 0.55,
                      pointerEvents: unlocked ? 'auto' : 'none',
                      transform: isHovered && unlocked ? 'translateX(3px)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <div style={{
                      background: '#FFF',
                      padding: '12px 14px',
                      borderRadius: '6px',
                      border: `1px solid ${accepted ? '#86EFAC' : isHovered ? COFICAB_NAVY : COFICAB_CARD_BORDER}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontWeight: '700', color: COFICAB_NAVY, fontSize: '12px', textTransform: 'uppercase' }}>
                          Why {String(step.stepNumber).padStart(2, '0')}
                          {accepted && <span style={{ marginLeft: 8, color: '#059669', fontWeight: 600 }}>· {t('fiveWhy.accepted')}</span>}
                          {!unlocked && <span style={{ marginLeft: 8, color: '#94A3B8', fontWeight: 500 }}>· {t('fiveWhy.locked')}</span>}
                        </div>
                      </div>

                      <div style={{ fontWeight: '600', color: '#1E293B', fontSize: '13px', marginBottom: '8px', lineHeight: '1.4' }}>
                        {step.question}
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          className="coficab-input"
                          value={step.answer || ''}
                          onChange={(e) => handleAnswerChange(activeBranch, step.stepNumber, e.target.value)}
                          placeholder={t('fiveWhy.answerPlaceholder')}
                          disabled={!unlocked}
                          style={{
                            flex: 1, minWidth: 180, padding: '6px 8px', background: COFICAB_LIGHT_BG,
                            border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit',
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!unlocked || validating || !step.answer?.trim()}
                          onClick={() => void handleCoachValidate(activeBranch, step.stepNumber)}
                        >
                          {validating ? t('fiveWhy.coaching') : t('fiveWhy.challenge')}
                        </button>
                      </div>

                      {renderCoachPanel(activeBranch, step.stepNumber)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '360px', height: '360px' }}>
                <svg width="360" height="360" viewBox="0 0 420 420">
                  <g
                    className="rotating-wheel-group"
                    style={{ animationPlayState: activeHoverIdx !== null ? 'paused' : 'running' }}
                  >
                    {branchSteps.map((_, idx) => {
                      const color = wheelColors[idx % wheelColors.length];
                      const pathData = getSlicePath(idx, branchSteps.length, 175, 52);
                      const isHovered = activeHoverIdx === idx;
                      const angle = (2 * Math.PI) / branchSteps.length;
                      const midAngle = (idx + 0.5) * angle - Math.PI / 2;
                      const tx = 210 + 120 * Math.cos(midAngle);
                      const ty = 210 + 120 * Math.sin(midAngle);
                      return (
                        <g key={idx} style={{ cursor: 'pointer' }} onMouseEnter={() => setActiveHoverIdx(idx)} onMouseLeave={() => setActiveHoverIdx(null)}>
                          <path
                            d={pathData}
                            fill={isHovered ? COFICAB_ACCENT : color}
                            stroke={COFICAB_LIGHT_BG}
                            strokeWidth="3.5"
                            style={{
                              opacity: activeHoverIdx === null || isHovered ? 1 : 0.85,
                              transform: isHovered ? 'scale(1.025)' : 'scale(1)',
                              transformOrigin: '210px 210px',
                              transition: 'all 0.15s ease',
                            }}
                          />
                          <text x={tx} y={ty - 8} fill="#FFF" fontSize="13" fontWeight="600" textAnchor="middle" dominantBaseline="central">Why</text>
                          <text x={tx} y={ty + 10} fill="#FFF" fontSize="22" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                            {String(idx + 1).padStart(2, '0')}
                          </text>
                        </g>
                      );
                    })}
                    <circle cx="210" cy="210" r="50" fill={COFICAB_LIGHT_BG} />
                  </g>
                </svg>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                {t('fiveWhy.activeBranch', { branch: branchLabel(activeBranch) })}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
            {([
              ['OCCURRENCE', rootCauseOccurrence, setRootCauseOccurrence, t('fiveWhy.rootCauseOccurrence')],
              ['DETECTION', rootCauseDetection, setRootCauseDetection, t('fiveWhy.rootCauseDetection')],
            ] as const).map(([branch, value, setter, title]) => (
              <div
                key={branch}
                style={{
                  background: '#FFF', padding: '14px 16px', borderRadius: 8,
                  borderLeft: `4px solid ${branch === 'OCCURRENCE' ? COFICAB_NAVY : '#0369A1'}`,
                  border: `1px solid ${COFICAB_CARD_BORDER}`, borderLeftWidth: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: COFICAB_NAVY, fontSize: 12, textTransform: 'uppercase' }}>{title}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleGenerateSynthesis(branch)}
                    disabled={generatingSynthesis || saving}
                    style={{ color: COFICAB_ACCENT, borderColor: COFICAB_ACCENT, fontSize: 12 }}
                  >
                    {generatingSynthesis ? '...' : t('fiveWhy.aiSynthesis')}
                  </button>
                </div>
                <textarea
                  rows={5}
                  className="coficab-input"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={branch === 'OCCURRENCE'
                    ? t('fiveWhy.rootCauseOccurrencePlaceholder')
                    : t('fiveWhy.rootCauseDetectionPlaceholder')}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1',
                    background: COFICAB_LIGHT_BG, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>
            ))}
          </div>

          {/* CAPA — Corrective (Occurrence) + Préventive (Détection) */}
          <div style={{
            marginTop: 24, background: '#FFF', padding: '16px 18px', borderRadius: 8,
            border: `1px solid ${COFICAB_CARD_BORDER}`, borderLeft: `4px solid #059669`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: COFICAB_NAVY, fontSize: 13, textTransform: 'uppercase' }}>
                  {t('fiveWhy.capaStep')}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  {t('fiveWhy.capaHint')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {existingCapaId ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigate(`/pages/front/action-plans/${existingCapaId}`)}
                    style={{ color: '#059669', borderColor: '#059669' }}
                  >
                    {t('fiveWhy.viewCapa')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void handleSuggestCapa()}
                      disabled={suggestingCapa || !rootCauseOccurrence.trim() || !rootCauseDetection.trim()}
                      style={{ color: COFICAB_ACCENT, borderColor: COFICAB_ACCENT }}
                    >
                      {suggestingCapa ? t('fiveWhy.suggesting') : t('fiveWhy.suggestCapa')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleCreateCapa()}
                      disabled={creatingCapa || capaActions.length === 0}
                      style={{ background: '#059669' }}
                    >
                      {creatingCapa ? t('fiveWhy.creating') : t('fiveWhy.createCapa')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {!existingCapaId && capaActions.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <input
                  className="coficab-input"
                  value={capaTitle}
                  onChange={(e) => setCapaTitle(e.target.value)}
                  placeholder={t('fiveWhy.capaTitlePlaceholder')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
                />
                <textarea
                  className="coficab-input"
                  rows={3}
                  value={capaDescription}
                  onChange={(e) => setCapaDescription(e.target.value)}
                  placeholder={t('fiveWhy.capaDescriptionPlaceholder')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13, marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase' }}>
                    {t('fiveWhy.capaDeadline')}
                  </label>
                  <input
                    type="date"
                    className="coficab-input"
                    value={capaDeadline}
                    onChange={(e) => setCapaDeadline(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {capaActions.map((action, idx) => (
                    <div key={`${action.branch}-${idx}`} style={{ background: COFICAB_LIGHT_BG, padding: 12, borderRadius: 6, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: action.kind === 'PREVENTIVE' ? '#0369A1' : '#059669', textTransform: 'uppercase', marginBottom: 6 }}>
                        {action.kind} · {action.branch}
                      </div>
                      <input
                        className="coficab-input"
                        value={action.title}
                        onChange={(e) => updateCapaAction(idx, 'title', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #CBD5E1', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }}
                      />
                      <textarea
                        className="coficab-input"
                        rows={4}
                        value={action.description}
                        onChange={(e) => updateCapaAction(idx, 'description', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #CBD5E1', fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 6 }}
                      />
                      <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                        {t('fiveWhy.actionDelay')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="coficab-input"
                        value={action.suggestedDeadlineDays ?? 14}
                        onChange={(e) => updateCapaAction(idx, 'suggestedDeadlineDays', Number(e.target.value) || 14)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {existingCapaId && (
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#065F46' }}>
                {t('fiveWhy.capaAlready')}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>

            {status === 'DRAFT' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleToggleStatus('PENDING_VALIDATION')}
                disabled={saving}
              >
                {saving ? t('fiveWhy.sending') : t('fiveWhy.finishSubmit')}
              </button>
            ) : status === 'VALIDATED' && !isAdmin ? (
              <span style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                {t('fiveWhy.validatedAdminOnly')}
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleToggleStatus('DRAFT')}
                disabled={saving}
                style={{ color: '#D97706', borderColor: '#FCD34D' }}
              >
                {saving ? t('fiveWhy.updating') : t('fiveWhy.revertDraft')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FiveWhyPage;
