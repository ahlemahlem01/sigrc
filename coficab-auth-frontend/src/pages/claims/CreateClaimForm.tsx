import React, { useEffect, useMemo, useRef, useState, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { getUsersForAssignment } from '../../services/actionPlanService';
import { CreateClaimCommand } from '../../types/qualityAnalysis';
import { isAdminUser } from '../../utils/roles';
import { EmployeeRecommendationBanner } from '../../components/EmployeeRecommendationBanner';
import { 
  ArrowLeft, 
  ArrowRight,
  FilePlus, 
  Building2, 
  Tag, 
  AlertTriangle, 
  Calendar, 
  Hash, 
  Barcode, 
  AlignLeft, 
  CheckCircle2, 
  X, 
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  Eye,
  Check,
  Sparkles,
  FileText,
  Trash2,
  UserRound,
  Camera
} from 'lucide-react';
import { ParetoImpactPreview } from './Pareto/ParetoImpactPreview';
import { useTranslation } from 'react-i18next';
import { useReferenceLists } from '../../hooks/useReferenceLists';
import { defectLabel, defectValueFromInput } from '../../utils/defectLabel';
import { appendCvProposal, CvProposal } from '../../utils/cvPayload';

interface CreateClaimFormProps {
  onSuccess?: () => void; // called after a successful create (e.g. when rendered inside a modal); falls back to navigation + reload when absent
}

export const CreateClaimForm: React.FC<CreateClaimFormProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const referenceLists = useReferenceLists();
  const { accessToken, user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const canAssign = isAdminUser(user);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [assignableUsers, setAssignableUsers] = useState<
    { id: string; label: string; email?: string; department?: string; departmentId?: string }[]
  >([]);
  const [assignedToId, setAssignedToId] = useState('');

  // File Attachment State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Proposal of the image model for the attached photo (active learning: the operator confirms or corrects it)
  const [cv, setCv] = useState<CvProposal | null>(null);
  // identifies the photo being analysed: the answer for a photo that was removed or replaced meanwhile is ignored
  const photoRef = useRef<File | null>(null);
  // the image model sees a defect but cannot name it: only a hint, nothing to confirm
  const [cvNote, setCvNote] = useState<{ kind: 'analysing' | 'none' | 'unavailable' | 'anomaly'; confidence?: number } | null>(null);

  const [formData, setFormData] = useState<Omit<CreateClaimCommand, 'createdById'>>({
    title: '',
    clientId: '',
    defectType: '',
    severity: 'MEDIUM',
    lotNumber: '',
    serialNumber: '',
    detectionDate: new Date().toISOString().split('T')[0],
    description: '',
  });

  useEffect(() => {
    if (!accessToken || !canAssign) return;
    let cancelled = false;
    getUsersForAssignment(accessToken)
      .then((res) => {
        if (cancelled) return;
        const raw = Array.isArray(res.data) ? res.data : (res.data?.$values ?? res.data?.items ?? []);
        setAssignableUsers(
          (raw as any[])
            .map((u) => ({
              id: String(u.id ?? u.userId ?? ''),
              label:
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                u.email ||
                String(u.id ?? ''),
              email: u.email ? String(u.email) : undefined,
              department: u.department ?? u.Department ?? undefined,
              departmentId: u.departmentId
                ? String(u.departmentId)
                : u.DepartmentId
                  ? String(u.DepartmentId)
                  : undefined,
            }))
            .filter((u) => u.id)
        );
      })
      .catch(() => {
        if (!cancelled) setAssignableUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canAssign]);

  const recommendEmployees = useMemo(
    () =>
      assignableUsers.map((u) => ({
        employeeId: u.id,
        name: u.label,
        email: u.email,
        department: u.department,
        departmentId: u.departmentId,
      })),
    [assignableUsers]
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const processFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError(t('createClaim.fileTooLarge'));
      return;
    }
    setError(null);
    setSelectedFile(file);
    setCv(null);
    setCvNote(null);
    photoRef.current = file;
    if (file.type.startsWith('image/') && accessToken) {
      setCvNote({ kind: 'analysing' });
      qualityAnalysisService.suggestDefectFromImage(file, accessToken)
        .then((r) => {
          if (photoRef.current !== file) return;
          if (r.available && r.defectType) {
            setCv({ defectType: r.defectType, confidence: r.confidence ?? 0, threshold: r.threshold ?? 0.7, demo: r.demo, lineFamilies: r.lineFamilies });
            setCvNote(null);
          } else if (r.anomalyDetected) setCvNote({ kind: 'anomaly', confidence: r.confidence ?? 0 });
          else if (r.reason === 'unavailable') setCvNote({ kind: 'unavailable' });
          else if (r.reason === 'notConfigured' || r.reason === 'noImage') setCvNote(null);
          else setCvNote({ kind: 'none' });
        })
        .catch(() => { if (photoRef.current === file) setCvNote({ kind: 'unavailable' }); });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setCv(null);
    setCvNote(null);
    photoRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && currentStep < 3 && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      nextStep();
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.title.trim() || !formData.clientId.trim() || !formData.defectType.trim()) {
        setError(t('createClaim.step1Required'));
        return false;
      }
      if (referenceLists.isRefused('client', formData.clientId)) {
        setError(t('referenceLists.notInList', { value: formData.clientId.trim() }));
        return false;
      }
    }
    if (step === 2) {
      if (!formData.lotNumber.trim() || !formData.detectionDate.trim()) {
        setError(t('createClaim.step2Required'));
        return false;
      }
    }
    return true;
  };

  const goToStep = (targetStep: number) => {
    if (targetStep > currentStep) {
      for (let i = currentStep; i < targetStep; i++) {
        if (!validateStep(i)) return;
      }
    }
    setError(null);
    setCurrentStep(targetStep);
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;
    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await submitClaim('OUVERTE');
};

const handleSaveDraft = async () => {
  await submitClaim('DRAFT');
};

const submitClaim = async (statusCode: 'DRAFT' | 'OUVERTE') => {
  if (currentStep < 3) {
    nextStep();
    return;
  }

  if (!formData.description?.trim()) {
    setError(t('createClaim.descriptionRequired'));
    return;
  }

  if (!accessToken) {
    setError(t('createClaim.sessionExpired'));
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const payload = new FormData();

    payload.append('Title', formData.title || '');
    payload.append('ClientId', formData.clientId || '');
    payload.append('DefectType', formData.defectType || '');
    payload.append('Severity', String(formData.severity || 'Medium'));
    payload.append('LotNumber', formData.lotNumber || '');
    payload.append('SerialNumber', formData.serialNumber || '');
    payload.append('Description', formData.description || '');
    payload.append('StatusCode', statusCode);

    if (formData.detectionDate) {
      payload.append('DetectionDate', new Date(formData.detectionDate).toISOString());
    }

    if (selectedFile) {
      payload.append('Attachment', selectedFile);
    }
    appendCvProposal(payload, cv);

    if (canAssign && assignedToId.trim()) {
      const label =
        assignableUsers.find((u) => u.id === assignedToId)?.label || assignedToId;
      payload.append('AssignedToId', assignedToId.trim());
      payload.append('AssignedToName', label);
    }

    await qualityAnalysisService.createClaim(payload, accessToken);

    if (onSuccess) {
      onSuccess();
    } else if (statusCode === 'DRAFT') {
      navigate('/pages/front/quality-analyses/drafts', { replace: true });
    } else {
      navigate('/pages/front/quality-analyses', { replace: true });
    }
  } catch (err: any) {
    const message =
      err?.response?.data?.message ||
      err?.response?.data?.title ||
      t('createClaim.createFailed');
    setError(message);
  } finally {
    setLoading(false);
  }
};

  const handleCancel = () => {
    navigate('/pages/front/quality-analyses');
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' };
      case 'HIGH': return { bg: '#fff7ed', color: '#ea580c', border: '#ffedd5' };
      case 'MEDIUM': return { bg: '#fffbeb', color: '#d97706', border: '#fef3c7' };
      default: return { bg: '#f0f9ff', color: '#0284c7', border: '#e0f2fe' };
    }
  };

  if (isAuthLoading) {
    return (
      <div className="pfe-wiz-loader">
        <RefreshCw className="pfe-spin" size={26} />
        <span>{t('createClaim.authenticating')}</span>
      </div>
    );
  }

  const sevStyle = getSeverityBadgeClass(formData.severity);

  return (
    <div className="pfe-wiz-wrapper">
      <style>{`
        .pfe-wiz-wrapper {
          min-height: calc(100dvh - 56px);
          background: #f8fafc;
          padding: 24px 20px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
        }

        .pfe-wiz-container {
          width: 100%;
          max-width: 1100px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .pfe-wiz-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .pfe-wiz-title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pfe-wiz-topbar h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: #0f2b5c;
          letter-spacing: -0.02em;
        }
        .pfe-wiz-topbar p {
          margin: 2px 0 0 0;
          font-size: 12px;
          color: #64748b;
        }

        .pfe-btn-cancel-top {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #334155;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .pfe-btn-cancel-top:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #0f172a;
        }

        .pfe-wiz-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 20px;
          align-items: start;
        }

        .pfe-wiz-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.04);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .pfe-stepper-bar {
          display: flex;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border-bottom: 1px solid #e2e8f0;
          padding: 14px 20px;
          justify-content: space-between;
        }
        .pfe-step-item {
          display: flex;
          align-items: center;
          gap: 8px;
          opacity: 0.55;
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
          border: none;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .pfe-step-item:hover {
          opacity: 0.85;
          background: #f1f5f9;
        }
        .pfe-step-item.active {
          opacity: 1;
        }
        .pfe-step-circle {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #e2e8f0;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .pfe-step-item.active .pfe-step-circle {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
        }
        .pfe-step-item.completed .pfe-step-circle {
          background: #10b981;
          color: #ffffff;
        }
        .pfe-step-text {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }

        .pfe-wiz-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .pfe-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pfe-field label {
          font-size: 11.5px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pfe-field label .req {
          color: #e11d48;
        }


        .pfe-input-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .pfe-input-icon {
          position: absolute;
          left: 12px;
          color: #94a3b8;
          pointer-events: none;
        }
        .pfe-input-box input,
        .pfe-input-box select,
        .pfe-input-box textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px 10px 38px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13px;
          color: #0f172a;
          background: #ffffff;
          outline: none;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .pfe-input-box textarea {
          padding-top: 10px;
          resize: vertical;
          min-height: 100px;
        }
        .pfe-input-box input:focus,
        .pfe-input-box select:focus,
        .pfe-input-box textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .pfe-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .pfe-upload-zone {
          border: 2px dashed #cbd5e1;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
          background: #f8fafc;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
        }
        .pfe-upload-zone.drag-active,
        .pfe-upload-zone:hover {
          border-color: #2563eb;
          background: rgba(37, 99, 235, 0.04);
        }
        .pfe-upload-zone input[type="file"] {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
        }
        .pfe-upload-zone p {
          margin: 0;
          font-size: 12px;
          color: #64748b;
        }
        .pfe-upload-zone span {
          font-size: 11px;
          color: #94a3b8;
        }

        .pfe-camera-btn {
          position: relative; display: none; align-items: center; justify-content: center; gap: 8px;
          margin-top: 10px; height: 44px; border-radius: 10px; background: #1d4ed8; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
        }
        .pfe-camera-btn input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
        /* shown on touch devices (phone, tablet) only */
        @media (pointer: coarse) { .pfe-camera-btn { display: flex; } }
        .pfe-file-actions { display: flex; align-items: center; gap: 8px; }
        .pfe-replace-btn { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid #cbd5e1;
          border-radius: 8px; background: #fff; color: #1e3a8a; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .pfe-replace-btn input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
        .pfe-cv-card {
          margin-top: 10px;
          padding: 12px 14px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 8px;
        }
        .pfe-cv-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #1e3a8a; }
        .pfe-cv-conf { font-weight: 700; color: #15803d; }
        .pfe-cv-conf.low { color: #b45309; }
        .pfe-cv-code { margin: 6px 0; font-size: 15px; font-weight: 800; color: #0f172a; }
        .pfe-cv-demo { margin: 0 0 4px; display: inline-block; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; }
        .pfe-cv-hint { margin: 6px 0 0; font-size: 11.5px; color: #475569; }
        .pfe-cv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .pfe-cv-btn, .pfe-cv-select {
          height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #93c5fd;
          background: #fff; color: #1e3a8a; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .pfe-cv-btn.on { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
        .pfe-file-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
        }
        .pfe-file-info {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12.5px;
          color: #0f172a;
          font-weight: 600;
        }
        .pfe-file-remove {
          background: none;
          border: none;
          color: #e11d48;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }
        .pfe-file-remove:hover {
          background: #fecdd3;
        }

        .pfe-error-banner {
          padding: 10px 14px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 8px;
          color: #e11d48;
          font-size: 12.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pfe-wiz-footer {
          padding: 16px 24px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pfe-btn-sec {
          padding: 9px 16px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          color: #334155;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .pfe-btn-sec:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .pfe-btn-primary {
          padding: 9px 18px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          border: none;
          border-radius: 7px;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.2);
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .pfe-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(37, 99, 235, 0.3);
        }
        .pfe-btn-primary:disabled, .pfe-btn-sec:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pfe-preview-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.04);
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: sticky;
          top: 24px;
        }
        .pfe-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid #f1f5f9;
        }
        .pfe-preview-header h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 800;
          color: #0f2b5c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pfe-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        .pfe-prev-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.4;
          word-break: break-word;
        }
        .pfe-prev-title.placeholder {
          color: #94a3b8;
          font-style: italic;
          font-weight: 400;
        }

        .pfe-prev-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pfe-prev-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
        }
        .pfe-prev-label {
          color: #64748b;
          font-weight: 500;
        }
        .pfe-prev-val {
          color: #0f172a;
          font-weight: 700;
        }

        .pfe-prev-desc {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 6px;
          padding: 10px;
          font-size: 11.5px;
          color: #475569;
          line-height: 1.4;
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
        }

        .pfe-wiz-loader {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          height: 60vh;
          color: #0f2b5c;
          font-weight: 600;
        }
        .pfe-spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        @media (max-width: 860px) {
          .pfe-wiz-grid { grid-template-columns: 1fr; }
          .pfe-preview-card { position: static; }
        }

        /* Phone / workshop tablet: one field per row, controls big enough for a finger, and 16px text so the browser does not zoom in on focus */
        @media (max-width: 640px) {
          .pfe-grid-2 { grid-template-columns: 1fr; }
          .pfe-input-box input, .pfe-input-box select, .pfe-input-box textarea { font-size: 16px; min-height: 46px; }
          .pfe-btn-primary, .pfe-btn-sec, .pfe-btn-cancel, .pfe-cv-btn, .pfe-cv-select { min-height: 44px; }
          .pfe-wiz-footer { gap: 10px; }
          .pfe-wiz-footer > button { flex: 1 1 0; justify-content: center; }
        }
        @media (pointer: coarse) {
          .pfe-btn-primary, .pfe-btn-sec, .pfe-cv-btn, .pfe-cv-select, .pfe-file-remove { min-height: 44px; min-width: 44px; }
        }
      `}</style>

      <div className="pfe-wiz-container">
        
        {/* HEADER BAR */}
        <div className="pfe-wiz-topbar">
          <div className="pfe-wiz-title-box">
            <div>
              <h1>{t('createClaim.title')}</h1>
              <p>{t('createClaim.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="pfe-btn-cancel-top" onClick={handleCancel}>
            <X size={15} /> {t('createClaim.exit')}
          </button>
        </div>

        {/* WORKSPACE GRID */}
        <div className="pfe-wiz-grid">
          
          {/* LEFT WIZARD CARD */}
          <div className="pfe-wiz-card">
            
            {/* Stepper Progress Header */}
            <div className="pfe-stepper-bar">
              <button
                type="button"
                className={`pfe-step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
                onClick={() => goToStep(1)}
              >
                <div className="pfe-step-circle">
                  {currentStep > 1 ? <Check size={14} /> : '1'}
                </div>
                <span className="pfe-step-text">{t('createClaim.stepGeneral')}</span>
              </button>

              <button
                type="button"
                className={`pfe-step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
                onClick={() => goToStep(2)}
              >
                <div className="pfe-step-circle">
                  {currentStep > 2 ? <Check size={14} /> : '2'}
                </div>
                <span className="pfe-step-text">{t('createClaim.stepTraceability')}</span>
              </button>

              <button
                type="button"
                className={`pfe-step-item ${currentStep === 3 ? 'active' : ''}`}
                onClick={() => goToStep(3)}
              >
                <div className="pfe-step-circle">3</div>
                <span className="pfe-step-text">{t('createClaim.stepDetails')}</span>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
              <div className="pfe-wiz-body">
                
                {error && (
                  <div className="pfe-error-banner">
                    <ShieldAlert size={16} />
                    <span>{error}</span>
                  </div>
                )}

                {/* STEP 1: GENERAL INFO */}
                {currentStep === 1 && (
                  <>
                    <div className="pfe-field">
                      <label>{t('createClaim.claimTitle')} <span className="req">*</span></label>
                      <div className="pfe-input-box">
                        <FilePlus size={15} className="pfe-input-icon" />
                        <input
                          type="text"
                          name="title"
                          value={formData.title}
                          onChange={handleChange}
                          autoFocus
                          placeholder={t('createClaim.titlePlaceholder')}
                        />
                      </div>
                    </div>

                    <div className="pfe-grid-2">
                      <div className="pfe-field">
                        <label>{t('claimDetail.clientId')} <span className="req">*</span></label>
                        <div className="pfe-input-box">
                          <Building2 size={15} className="pfe-input-icon" />
                          <input
                            type="text"
                            name="clientId"
                            list="reference-clients"
                            value={formData.clientId}
                            onChange={handleChange}
                            placeholder={t('createClaim.examplePrefix', { value: 'STELLANTIS-01' })}
                          />
                        </div>
                      </div>

                      <div className="pfe-field">
                        <label>{t('claimDetail.defectType')} <span className="req">*</span></label>
                        <div className="pfe-input-box">
                          <Tag size={15} className="pfe-input-icon" />
                          <input
                            type="text"
                            name="defectType"
                            list="reference-defect-types"
                            value={defectLabel(formData.defectType)}
                            onChange={(e) => { e.target.value = defectValueFromInput(e.target.value); handleChange(e); }}
                            placeholder={t('createClaim.examplePrefix', { value: 'INTERMITTENT_CONTACT' })}
                          />
                        </div>
                      </div>
                    </div>

                    <datalist id="reference-clients">
                      {referenceLists.clients.map((d) => <option key={d} value={d} />)}
                    </datalist>
                    <datalist id="reference-defect-types">
                      {referenceLists.defectTypes.map((d) => <option key={d} value={defectLabel(d)} />)}
                    </datalist>

                    <div className="pfe-field">
                      <label>{t('createClaim.severityLevel')} <span className="req">*</span></label>
                      <div className="pfe-input-box">
                        <AlertTriangle size={15} className="pfe-input-icon" />
                        <select
                          name="severity"
                          value={formData.severity}
                          onChange={handleChange}
                        >
                          {referenceLists.activeSeverities().map((level) => (
                            <option key={level} value={level}>
                              {referenceLists.severityLabel(level) ?? t(`createClaim.severity${level.charAt(0)}${level.slice(1).toLowerCase()}Hint`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>


                    {canAssign && (
                      <div className="pfe-field">
                        <label>{t('claimDetail.assignedTo')}</label>
                        <EmployeeRecommendationBanner
                          defectType={formData.defectType}
                          severity={formData.severity}
                          employees={recommendEmployees}
                          requireDepartment={false}
                          onAssign={setAssignedToId}
                        />
                        <div className="pfe-input-box">
                          <UserRound size={15} className="pfe-input-icon" />
                          <select
                            name="assignedToId"
                            value={assignedToId}
                            onChange={(e) => setAssignedToId(e.target.value)}
                          >
                            <option value="">{t('createClaim.unassignedOptional')}</option>
                            {assignableUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* STEP 2: TRACEABILITY */}
                {currentStep === 2 && (
                  <>
                    <div className="pfe-grid-2">
                      <div className="pfe-field">
                        <label>{t('claimDetail.lotNumber')} <span className="req">*</span></label>
                        <div className="pfe-input-box">
                          <Hash size={15} className="pfe-input-icon" />
                          <input
                            type="text"
                            name="lotNumber"
                            value={formData.lotNumber}
                            onChange={handleChange}
                            autoFocus
                            placeholder={t('createClaim.examplePrefix', { value: 'LOT-2026-0472' })}
                          />
                        </div>
                      </div>

                      <div className="pfe-field">
                        <label>{t('claimDetail.serialNumber')}</label>
                        <div className="pfe-input-box">
                          <Barcode size={15} className="pfe-input-icon" />
                          <input
                            type="text"
                            name="serialNumber"
                            value={formData.serialNumber}
                            onChange={handleChange}
                            placeholder={t('createClaim.serialPlaceholder')}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pfe-field">
                      <label>{t('claimDetail.detectionDate')} <span className="req">*</span></label>
                      <div className="pfe-input-box">
                        <Calendar size={15} className="pfe-input-icon" />
                        <input
                          type="date"
                          name="detectionDate"
                          value={formData.detectionDate}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 3: DETAILS & EMAIL ATTACHMENT */}
                {currentStep === 3 && (
                  <>
                    <div className="pfe-field">
                      <label>{t('createClaim.detailedDescription')} <span className="req">*</span></label>
                      <div className="pfe-input-box">
                        <AlignLeft size={15} className="pfe-input-icon" style={{ top: '12px' }} />
                        <textarea
                          name="description"
                          rows={4}
                          value={formData.description}
                          onChange={handleChange}
                          autoFocus
                          placeholder={t('createClaim.descriptionPlaceholder')}
                        />
                      </div>
                    </div>

                    <div className="pfe-field">
                      <label>{t('createClaim.sourceProof')}</label>
                      
                      {!selectedFile ? (
                        <>
                        <div 
                          className={`pfe-upload-zone ${isDragging ? 'drag-active' : ''}`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <input
                            type="file"
                            accept=".eml,.msg,.pdf,image/*"
                            onChange={handleFileChange}
                          />
                          <UploadCloud size={24} style={{ color: '#2563eb' }} />
                          <p><strong>{t('createClaim.dropStrong')}</strong> {t('createClaim.dropRest')}</p>
                          <span>{t('createClaim.dropFormats')}</span>
                        </div>
                        <label className="pfe-camera-btn">
                          <Camera size={16} /> {t('createClaim.takePhoto')}
                          <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
                        </label>
                        </>
                      ) : (
                        <div className="pfe-file-card">
                          <div className="pfe-file-info">
                            <FileText size={18} style={{ color: '#2563eb' }} />
                            <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <div className="pfe-file-actions">
                            <label className="pfe-replace-btn">
                              <UploadCloud size={14} /> {t('createClaim.cvReplace')}
                              <input type="file" accept=".eml,.msg,.pdf,image/*" onChange={(e) => { handleFileChange(e); e.target.value = ''; }} />
                            </label>
                            <button type="button" className="pfe-file-remove" onClick={removeFile}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}

                      {cvNote && !cv && (
                        <div className="pfe-cv-card" role="status">
                          <div className="pfe-cv-head">
                            <strong>{t('createClaim.cvTitle')}</strong>
                            {cvNote.kind === 'anomaly' && <span className="pfe-cv-conf low">{t('createClaim.cvConfidence', { pct: Math.round((cvNote.confidence ?? 0) * 100) })}</span>}
                          </div>
                          <p className="pfe-cv-hint">
                            {cvNote.kind === 'analysing' && <><RefreshCw size={12} className="pfe-spin" /> {t('createClaim.cvAnalysing')}</>}
                            {cvNote.kind === 'none' && t('createClaim.cvNone')}
                            {cvNote.kind === 'unavailable' && t('createClaim.cvUnavailable')}
                            {cvNote.kind === 'anomaly' && t('createClaim.cvAnomaly')}
                          </p>
                        </div>
                      )}

                      {cv && (() => {
                        const accepted = formData.defectType.trim().toLowerCase() === cv.defectType.trim().toLowerCase();
                        const unsure = cv.confidence < cv.threshold;
                        return (
                          <div className="pfe-cv-card" role="group" aria-label={t('createClaim.cvTitle')}>
                            <div className="pfe-cv-head">
                              <strong>{t('createClaim.cvTitle')}</strong>
                              <span className={`pfe-cv-conf ${unsure ? 'low' : ''}`}>{t('createClaim.cvConfidence', { pct: Math.round(cv.confidence * 100) })}</span>
                            </div>
                            <div className="pfe-cv-code">{defectLabel(cv.defectType)}</div>
                            {cv.demo && <p className="pfe-cv-demo">{t('createClaim.cvDemo')}</p>}
                            {cv.lineFamilies && cv.lineFamilies.length > 0 && <p className="pfe-cv-hint">{t('createClaim.cvLines', { lines: cv.lineFamilies.join(' / ') })}</p>}
                            {unsure && <p className="pfe-cv-hint">{t('createClaim.cvUnsure')}</p>}
                            <div className="pfe-cv-actions">
                              <button
                                type="button"
                                className={`pfe-cv-btn ${accepted ? 'on' : ''}`}
                                onClick={() => setFormData((prev) => ({ ...prev, defectType: cv.defectType }))}
                              >
                                {accepted ? t('createClaim.cvConfirmed') : t('createClaim.cvConfirm')}
                              </button>
                              <select
                                className="pfe-cv-select"
                                aria-label={t('createClaim.cvCorrect')}
                                value=""
                                onChange={(e) => { if (e.target.value) setFormData((prev) => ({ ...prev, defectType: e.target.value })); }}
                              >
                                <option value="">{t('createClaim.cvCorrect')}</option>
                                {referenceLists.defectTypes.map((d) => <option key={d} value={d}>{defectLabel(d)}</option>)}
                              </select>
                            </div>
                            <p className="pfe-cv-hint">
                              {t('createClaim.cvKept', { code: defectLabel(formData.defectType) || '—' })}
                              {!accepted && formData.defectType.trim() ? ` ${t('createClaim.cvLogged')}` : ''}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}

              </div>

              {/* Wizard Control Buttons */}
              <div className="pfe-wiz-footer">
                {currentStep > 1 ? (
                  <button type="button" className="pfe-btn-sec" onClick={prevStep} disabled={loading}>
                    <ArrowLeft size={14} /> {t('common.back')}
                  </button>
                ) : (
                  <button type="button" className="pfe-btn-sec" onClick={handleCancel} disabled={loading}>
                    <X size={14} /> {t('common.cancel')}
                  </button>
                )}

                {currentStep < 3 ? (
                  <button type="button" className="pfe-btn-primary" onClick={nextStep}>
                    {t('createClaim.nextStep')} <ArrowRight size={14} />
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="pfe-btn-sec"
                      disabled={loading}
                      onClick={() => void handleSaveDraft()}
                      title={t('createClaim.saveDraftHint')}
                    >
                      {loading ? '...' : t('createClaim.saveDraft')}
                    </button>
                    <button type="submit" className="pfe-btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <RefreshCw size={14} className="pfe-spin" /> {t('createClaim.submitting')}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} /> {t('createClaim.create')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* RIGHT LIVE PREVIEW CARD */}
          <div className="pfe-preview-card">
            <div className="pfe-preview-header">
              <h3><Eye size={14} /> {t('createClaim.liveSummary')}</h3>
              <span className="pfe-live-dot" title={t('createClaim.livePreview')} />
            </div>

            <div className={`pfe-prev-title ${!formData.title ? 'placeholder' : ''}`}>
              {formData.title || t('createClaim.untitled')}
            </div>

            <div className="pfe-prev-rows">
              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimDetail.clientId')}</span>
                <span className="pfe-prev-val">{formData.clientId || '—'}</span>
              </div>

              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimDetail.defectType')}</span>
                <span className="pfe-prev-val">{defectLabel(formData.defectType) || '—'}</span>
              </div>

              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimEdit.severity')}</span>
                <span 
                  style={{ 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    fontSize: '10.5px', 
                    fontWeight: 700, 
                    background: sevStyle.bg, 
                    color: sevStyle.color, 
                    border: `1px solid ${sevStyle.border}` 
                  }}
                >
                  {t(`claimStatus.severity${formData.severity.charAt(0)}${formData.severity.slice(1).toLowerCase()}`, { defaultValue: formData.severity })}
                </span>
              </div>


              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimDetail.lotNumber')}</span>
                <span className="pfe-prev-val">{formData.lotNumber || '—'}</span>
              </div>

              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimDetail.serialNumber')}</span>
                <span className="pfe-prev-val">{formData.serialNumber || '—'}</span>
              </div>

              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('claimDetail.detectionDate')}</span>
                <span className="pfe-prev-val">{formData.detectionDate || '—'}</span>
              </div>

              <div className="pfe-prev-row">
                <span className="pfe-prev-label">{t('createClaim.attachedFile')}</span>
                <span className="pfe-prev-val">{selectedFile ? selectedFile.name : t('createClaim.none')}</span>
              </div>
            </div>

            {formData.description && (
              <div className="pfe-prev-desc">
                {formData.description}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                <Sparkles size={12} style={{ color: '#2563eb' }} />
                <span>{t('createClaim.autoFiveWhy')}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {t('createClaim.activeStep', { step: currentStep, total: 3 })}
              </div>
            </div>

            <ParetoImpactPreview
              defectType={formData.defectType}
              clientId={formData.clientId}
              compact
            />
          </div>

        </div>

      </div>
    </div>
  );
};

export default CreateClaimForm;