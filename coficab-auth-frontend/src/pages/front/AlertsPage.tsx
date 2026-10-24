import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Archive, ArrowRight, ArrowUp, Clock, Flag, MapPin, Paperclip, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../../components/UserAvatar';
import { isAdminUser } from '../../utils/roles';
import {
  addAlertComment,
  archiveAlert,
  claimsLinkForAlert,
  decideAlert,
  downloadAlertAttachment,
  emptyAlertHistory,
  getAlertHistory,
  getAlerts,
  submitAlertReport,
  unarchiveAlert,
  updateAlertAnalysis,
  updateAlertReport,
  uploadAlertAttachment,
  AlertHistory,
  AlertReportItem,
  QualityAlert,
} from '../../services/alertService';
import './AlertsPage.css';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { defectLabel } from '../../utils/defectLabel';

type SeverityLevel = 'attention' | 'eleve' | 'critique';

function formatWhen(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(dateLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatMean(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sanitizeUserText(text: string): string {
  return text
    .replace(/^\s*TEST(?:\s+[A-Za-zÀ-ÿ0-9_-]+)?\s*[—–:-]\s*/i, '')
    .replace(/\bTEST\b\s*[—–:-]?\s*/gi, '')
    .replace(/\bDEBUG\b\s*[—–:-]?\s*/gi, '')
    .trim();
}

function severityFromZ(z: number): { level: SeverityLevel; label: string } {
  if (z >= 4) return { level: 'critique', label: i18n.t('alerts.severityCritical') };
  if (z >= 3) return { level: 'eleve', label: i18n.t('alerts.severityHigh') };
  return { level: 'attention', label: i18n.t('alerts.severityAttention') };
}

function buildPlainSummary(a: QualityAlert): string {
  const defect = defectLabel(sanitizeUserText(a.defectType)) || i18n.t('alerts.thisDefect');
  const line = sanitizeUserText(a.productionLine) || i18n.t('alerts.thisLine');
  const current = Number.isFinite(a.currentCount) ? a.currentCount : 0;
  const mean = formatMean(a.baselineMean);
  return i18n.t('alerts.summary', { count: current, defect, line, mean });
}

function alertCode(id: string): string {
  return `ALT-${id.replace(/-/g, '').slice(-4).toUpperCase()}`;
}

function archiveReasonLabel(reason?: string | null): string | null {
  if (!reason) return null;
  if (reason === 'auto-resolved') return i18n.t('alerts.reasonAuto');
  if (reason === 'abandoned') return i18n.t('alerts.reasonAbandoned');
  return i18n.t('alerts.reasonManual');
}

type AlertWorkflowStatus = 'pending_validation' | 'validated' | 'rejected' | 'archived';

function workflowStatus(status: string): AlertWorkflowStatus {
  const value = status.toLowerCase();
  if (value === 'archived' || value === 'resolved') return 'archived';
  if (value === 'validated') return 'validated';
  if (value === 'rejected') return 'rejected';
  return 'pending_validation';
}

function workflowLabel(status: AlertWorkflowStatus): string {
  if (status === 'validated') return i18n.t('alerts.statusValidated');
  if (status === 'rejected') return i18n.t('alerts.statusRejected');
  if (status === 'archived') return i18n.t('alerts.statusArchived');
  return i18n.t('alerts.statusPending');
}

function validationCopy(status: string): string {
  const value = status.toLowerCase();
  if (value === 'rejected') return i18n.t('alerts.reportRejected');
  if (value === 'validated') return i18n.t('alerts.reportValidated');
  return i18n.t('alerts.reportPending');
}

function isOwnReport(report: AlertReportItem, user: { id?: string; sub?: string; email?: string; name?: string } | null | undefined): boolean {
  const keys = [user?.id, user?.sub, user?.email, user?.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (keys.length === 0) return false;
  return keys.includes(String(report.authorId || '').toLowerCase())
    || keys.includes(String(report.authorName || '').toLowerCase());
}

function buildVolumeLine(a: QualityAlert): string {
  const current = Number.isFinite(a.currentCount) ? a.currentCount : 0;
  const mean = formatMean(a.baselineMean);
  return i18n.t('alerts.volume', { current, mean });
}

export default function AlertsPage() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [statusFilter, setStatusFilter] = useState<AlertWorkflowStatus>('pending_validation');
  const employeeFilterReady = useRef(false);
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [lineFilter, setLineFilter] = useState('all');
  const [histories, setHistories] = useState<Record<string, AlertHistory>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [decisionReportId, setDecisionReportId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, { problem: string; probableCause: string; consequences: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [formAlertId, setFormAlertId] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user || employeeFilterReady.current) return;
    employeeFilterReady.current = true;
    if (!isAdminUser(user)) setStatusFilter('validated');
  }, [user]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAlerts(accessToken, statusFilter);
      setAlerts(data);
      const entries = await Promise.all(
        data.map(async (alert) => {
          try {
            return [alert.id, await getAlertHistory(accessToken, alert.id)] as const;
          } catch {
            return [alert.id, emptyAlertHistory] as const;
          }
        }),
      );
      setHistories(Object.fromEntries(entries));
    } catch {
      setError(i18n.t('alerts.loadFailed'));
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineOptions = useMemo(() => {
    const values = new Set(alerts.map((alert) => sanitizeUserText(alert.productionLine)).filter(Boolean));
    return Array.from(values).sort((a, b) => a.localeCompare(b, i18n.language));
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      const defect = `${sanitizeUserText(alert.defectType)} ${defectLabel(sanitizeUserText(alert.defectType))}`;
      const line = sanitizeUserText(alert.productionLine);
      const severity = severityFromZ(Number.isFinite(alert.zScore) ? alert.zScore : 0);
      if (severityFilter !== 'all' && severity.level !== severityFilter) return false;
      if (lineFilter !== 'all' && line !== lineFilter) return false;
      if (!needle) return true;
      return `${defect} ${line} ${alert.description}`.toLowerCase().includes(needle);
    });
  }, [alerts, query, severityFilter, lineFilter]);

  const handleArchive = async (id: string) => {
    if (!accessToken) return;
    setResolvingId(id);
    try {
      await archiveAlert(accessToken, id, 'manual');
      await load();
    } catch {
      setError(t('alerts.archiveFailed'));
    } finally {
      setResolvingId(null);
    }
  };

  const handleUnarchive = async (id: string) => {
    if (!accessToken) return;
    setResolvingId(id);
    try {
      await unarchiveAlert(accessToken, id);
      await load();
    } catch {
      setError(t('alerts.restoreFailed'));
    } finally {
      setResolvingId(null);
    }
  };

  const runHistoryAction = async (key: string, action: () => Promise<void>, failure: string) => {
    if (!accessToken || busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await load();
    } catch {
      setError(failure);
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!savedKey) return;
    const timer = window.setTimeout(() => setSavedKey(null), 2400);
    return () => window.clearTimeout(timer);
  }, [savedKey]);

  useEffect(() => {
    if (!formAlertId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFormAlertId(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [formAlertId]);

  return (
    <div className={`pfe-container alerts-page${isAdmin ? ' is-admin-view' : ' is-employee-view'}`}>
      <div className="pfe-header">
        <div className="pfe-title-box">
          <div>
            <h1>{isAdmin ? t('alerts.titleAdmin') : t('alerts.titleEmployee')}</h1>
            <p>{isAdmin ? t('alerts.subtitleAdmin') : t('alerts.subtitleEmployee')}</p>
          </div>
        </div>
        <div className="pfe-header-buttons">
          <div className="alerts-filter" role="tablist" aria-label={t('common.status')}>
            {(['pending_validation', 'validated', 'rejected', 'archived'] as AlertWorkflowStatus[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`alerts-filter-btn is-${value}${statusFilter === value ? ' active' : ''}`}
                onClick={() => setStatusFilter(value)}
              >
                {workflowLabel(value)}
              </button>
            ))}
          </div>
          <button type="button" className="pfe-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={14} /> {t('qualityHistory.refresh')}
          </button>
        </div>
      </div>

      <div className="alerts-toolbar">
        <label className="alerts-search">
          <Search size={14} />
          <input
            value={query}
            placeholder={t('alerts.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select value={severityFilter} aria-label={t('alerts.priority')} onChange={(event) => setSeverityFilter(event.target.value as 'all' | SeverityLevel)}>
          <option value="all">{t('alerts.allPriorities')}</option>
          <option value="critique">{t('alerts.severityCritical')}</option>
          <option value="eleve">{t('alerts.severityHigh')}</option>
          <option value="attention">{t('alerts.severityAttention')}</option>
        </select>
        <select value={lineFilter} aria-label={t('pareto.line')} onChange={(event) => setLineFilter(event.target.value)}>
          <option value="all">{t('alerts.allLines')}</option>
          {lineOptions.map((line) => (
            <option key={line} value={line}>{line}</option>
          ))}
        </select>
      </div>

      {error && <div className="alerts-error">{error}</div>}

      {loading ? (
        <ListSkeleton rows={8} />
      ) : alerts.length === 0 ? (
        <div className="alerts-empty">{t('alerts.emptyStatus', { status: workflowLabel(statusFilter).toLowerCase() })}</div>
      ) : visibleAlerts.length === 0 ? (
        <div className="alerts-empty">{t('alerts.noResults')}</div>
      ) : (
        <div className={`alerts-list${isAdmin ? ' is-queue' : ''}`}>
          {visibleAlerts.map((a) => {
            const workflow = workflowStatus(a.status);
            const active = workflow !== 'archived';
            const claimsHref = claimsLinkForAlert(a);
            const z = Number.isFinite(a.zScore) ? a.zScore : 0;
            const severity = severityFromZ(z);
            const defect = defectLabel(sanitizeUserText(a.defectType)) || '—';
            const line = sanitizeUserText(a.productionLine) || '—';
            const formOpen = formAlertId === a.id;
            const history: AlertHistory = histories[a.id] ?? emptyAlertHistory;
            const reasonLabel = archiveReasonLabel(a.archiveReason);
            const pendingReports = history.reports.filter((report) => report.status.toLowerCase() === 'submitted');
            const ownReport = history.reports.find((report) => isOwnReport(report, user)) ?? (!isAdmin ? history.reports[0] : undefined);
            const ownStatus = ownReport?.status.toLowerCase() || '';
            const canEdit = workflow === 'pending_validation';
            const selectedReport = pendingReports.find((report) => report.id === decisionReportId) ?? pendingReports[0] ?? history.reports[0];

            const submitReport = () => {
              if (!canEdit) return;
              const text = (reportDrafts[a.id] ?? ownReport?.content ?? '').trim();
              if (!text) return;
              void runHistoryAction(
                `submit-report-${a.id}`,
                async () => {
                  if (ownReport && ownStatus === 'submitted') await updateAlertReport(accessToken!, a.id, ownReport.id, text);
                  else await submitAlertReport(accessToken!, a.id, text);
                  setReportDrafts((prev) => ({ ...prev, [a.id]: text }));
                  setSavedKey(`submit-report-${a.id}`);
                },
                t('alerts.reportSaveFailed'),
              );
            };

            const decisionNote = decisionNotes[a.id] || '';
            const decide = (accept: boolean) => {
              if (!accept && !decisionNote.trim()) return;
              void runHistoryAction(
                `decide-${a.id}`,
                async () => {
                  await decideAlert(accessToken!, a.id, accept, decisionNote);
                  setFormAlertId(null);
                },
                accept ? t('alerts.validateFailed') : t('alerts.rejectFailed'),
              );
            };

            const saveComment = () => {
              const text = (commentDrafts[a.id] || '').trim();
              if (!text) return;
              void runHistoryAction(
                `comment-${a.id}`,
                async () => {
                  await addAlertComment(accessToken!, a.id, text);
                  setCommentDrafts((prev) => ({ ...prev, [a.id]: '' }));
                },
                t('alerts.commentFailed'),
              );
            };

            const onAttachment = (file: File | undefined) => {
              if (!file || !canEdit) return;
              void runHistoryAction(
                `file-${a.id}`,
                async () => {
                  await uploadAlertAttachment(accessToken!, a.id, file);
                },
                t('alerts.attachmentFailed'),
              );
            };

            const analysisValue = analysisDrafts[a.id] ?? {
              problem: a.aiProblem || '',
              probableCause: a.aiProbableCause || '',
              consequences: a.aiConsequences || '',
            };
            const setAnalysisField = (field: 'problem' | 'probableCause' | 'consequences', value: string) => {
              setAnalysisDrafts((prev) => ({
                ...prev,
                [a.id]: { ...(prev[a.id] ?? analysisValue), [field]: value },
              }));
            };
            const saveAnalysis = () => {
              void runHistoryAction(
                `analysis-${a.id}`,
                async () => {
                  await updateAlertAnalysis(accessToken!, a.id, analysisValue);
                  setSavedKey(`analysis-${a.id}`);
                },
                t('alerts.analysisFailed'),
              );
            };
            const analysisSaved = savedKey === `analysis-${a.id}`;

            return (
              <article key={a.id} className={isAdmin ? `alerts-queue-row${active ? ' is-active' : ''}` : `alerts-card${active ? ' is-active' : ''} is-employee`}>
                {isAdmin ? (
                  <>
                    <span className={`alerts-queue-rail alerts-severity-${severity.level}`} aria-hidden="true" />
                    <div className="alerts-queue-main">
                      <div className="alerts-queue-title-row">
                        <h2>{defect}</h2>
                        <span className={`alerts-status is-${workflow}`}>{workflowLabel(workflow)}</span>
                        <span className={`alerts-severity alerts-severity-${severity.level}`}>{severity.label}</span>
                        {pendingReports.length > 0 && <span className="alerts-pill pending">{t('alerts.toValidate', { count: pendingReports.length })}</span>}
                      </div>
                      <p>{line} · {buildVolumeLine(a)} · {formatWhen(a.detectedAt)}</p>
                      {reasonLabel && <p className="alerts-queue-reason">{reasonLabel}</p>}
                    </div>
                    <div className="alerts-queue-actions">
                      <button type="button" className="alerts-btn-primary" onClick={() => { setDecisionReportId(pendingReports[0]?.id ?? null); setFormAlertId(a.id); }}>
                        {workflow === 'pending_validation' ? t('alerts.decide') : t('alerts.view')}
                      </button>
                      {active ? (
                        <button type="button" className="pfe-btn-secondary" disabled={resolvingId === a.id} onClick={() => void handleArchive(a.id)}>
                          {resolvingId === a.id ? t('alerts.archiving') : t('alerts.archive')}
                        </button>
                      ) : (
                        <button type="button" className="pfe-btn-secondary" disabled={resolvingId === a.id} onClick={() => void handleUnarchive(a.id)}>
                          {resolvingId === a.id ? t('alerts.restoring') : t('alerts.restore')}
                        </button>
                      )}
                      <Link to={claimsHref} className="alerts-claims-link">{t('closedArchive.backToClaims')}</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="alerts-card-top">
                      <div className="alerts-card-meta">
                        <span className={`alerts-status is-${workflow}`}>{workflowLabel(workflow)}</span>
                        <span className={`alerts-severity alerts-severity-${severity.level}`}>{severity.label}</span>
                        <span className="alerts-date">{formatWhen(a.detectedAt)}</span>
                      </div>
                    </div>
                    <h2 className="alerts-card-title">{t('alerts.cardTitle')}</h2>
                    <p className="alerts-card-summary">{buildPlainSummary(a)}</p>
                    {ownReport && (
                      <div className={`alerts-validation-banner is-${ownStatus === 'rejected' ? 'rejected' : ownStatus === 'validated' ? 'validated' : 'pending'}`}>
                        <span>{t('notificationBell.kindValidation')}</span>
                        <p>{validationCopy(ownReport.status)}</p>
                        {ownReport.reviewNote ? <p className="alerts-history-note">{t('alerts.note', { note: ownReport.reviewNote })}</p> : null}
                      </div>
                    )}
                    <div className="alerts-card-facts">
                      <div className="alerts-field">
                        <span className="alerts-label">{t('closedArchive.colDefect')}</span>
                        <span className="alerts-value">{defect}</span>
                      </div>
                      <div className="alerts-field">
                        <span className="alerts-label">{t('pareto.line')}</span>
                        <span className="alerts-value">{line}</span>
                      </div>
                      <div className="alerts-field">
                        <span className="alerts-label">{t('alerts.volumeLabel')}</span>
                        <span className="alerts-value">{buildVolumeLine(a)}</span>
                      </div>
                    </div>
                    <div className="alerts-card-footer">
                      <button type="button" className="pfe-btn-secondary" onClick={() => setFormAlertId(a.id)}>{t('alerts.report')}</button>
                      <Link to={claimsHref} className="alerts-claims-link">
                        {t('alerts.viewClaims')}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </>
                )}

                {formOpen && createPortal(
                  <div className="alerts-modal-root" role="presentation">
                    <button type="button" className="alerts-modal-backdrop" aria-label={t('fiveWhy.close')} onClick={() => setFormAlertId(null)} />
                    <form
                      className="alerts-modal alerts-sheet"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby={`alert-form-${a.id}`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (isAdmin && workflow === 'pending_validation') decide(true);
                        else if (!isAdmin) submitReport();
                      }}
                    >
                      <div className="alerts-sheet-top">
                        <span>{t('alerts.sheetKicker', { code: alertCode(a.id) })}</span>
                        <button type="button" className="alerts-sheet-close" onClick={() => setFormAlertId(null)} aria-label={t('fiveWhy.close')}>
                          <X size={16} />
                        </button>
                      </div>
                      <div className="alerts-sheet-grid">
                        <div className="alerts-sheet-main">
                          <div className="alerts-sheet-title-row">
                            <h2 id={`alert-form-${a.id}`}>{defect}</h2>
                            <div className="alerts-sheet-meta">
                              <span><i className={`alerts-sheet-dot is-${workflow}`} />{workflowLabel(workflow)}</span>
                              <span className={`is-${severity.level}`}><Flag size={14} />{severity.label}</span>
                              <span><MapPin size={14} />{line}</span>
                              <span><Clock size={14} />{formatWhen(a.detectedAt)}</span>
                              {(() => {
                                const owner = selectedReport ?? ownReport;
                                const employeeName = owner?.authorName || (!isAdmin ? (user?.fullName || user?.name || user?.userName) : null);
                                const employeeAvatar = owner?.authorAvatarUrl || (!isAdmin ? (user as { profilePictureUrl?: string } | null)?.profilePictureUrl : null);
                                if (!employeeName) return null;
                                return (
                                  <span className="alerts-sheet-person">
                                    <UserAvatar size={22} name={employeeName} src={employeeAvatar} />
                                    {employeeName}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="alerts-sheet-fields">
                            {([
                              ['problem', t('alerts.problem'), analysisValue.problem],
                              ['probableCause', t('alerts.probableCause'), analysisValue.probableCause],
                              ['consequences', t('alerts.consequences'), analysisValue.consequences],
                            ] as const).map(([field, label, value]) => (
                              <div key={field} className="alerts-sheet-field">
                                <span>{label}</span>
                                {canEdit ? (
                                  <textarea
                                    rows={1}
                                    value={value}
                                    onChange={(event) => setAnalysisField(field, event.target.value)}
                                  />
                                ) : (
                                  <p>{sanitizeUserText(value) || '—'}</p>
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <button type="button" className={`alerts-sheet-btn${analysisSaved ? ' is-saved' : ''}`} disabled={busyKey === `analysis-${a.id}`} onClick={saveAnalysis}>
                                {analysisSaved ? t('alerts.analysisSaved') : t('alerts.saveAnalysis')}
                              </button>
                            )}
                            <div className="alerts-sheet-field">
                              <span>{t('alerts.report')}</span>
                              {isAdmin ? (
                                selectedReport ? (
                                  <p>{selectedReport.content}</p>
                                ) : (
                                  <p className="is-muted">{t('alerts.noPendingReport')}</p>
                                )
                              ) : (
                                <textarea
                                  rows={1}
                                  readOnly={!canEdit}
                                  value={reportDrafts[a.id] ?? ownReport?.content ?? ''}
                                  placeholder={t('alerts.reportPlaceholder')}
                                  onChange={(event) => setReportDrafts((prev) => ({ ...prev, [a.id]: event.target.value }))}
                                />
                              )}
                            </div>
                          </div>
                          {isAdmin && workflow === 'pending_validation' && (
                            <label className="alerts-sheet-prop alerts-sheet-decision">
                              <span>{t('alerts.decisionNote')}</span>
                              <textarea
                                rows={3}
                                value={decisionNote}
                                placeholder={t('alerts.decisionPlaceholder')}
                                onChange={(event) => setDecisionNotes((prev) => ({ ...prev, [a.id]: event.target.value }))}
                              />
                            </label>
                          )}
                        </div>
                        <aside className="alerts-sheet-rail">
                          <div className="alerts-sheet-activity">
                            <h3>{t('alerts.activity')}</h3>
                            {history.comments.length === 0 && history.attachments.length === 0 ? (
                              <p className="is-muted">{t('alerts.noComment')}</p>
                            ) : (
                              <ul>
                                {history.comments.map((comment) => (
                                  <li key={comment.id} className={comment.isArchived ? 'is-archived' : ''}>
                                    <UserAvatar size={24} name={comment.authorName || t('alerts.author')} src={comment.authorAvatarUrl} />
                                    <div>
                                      <strong>{comment.authorName || t('alerts.author')}</strong>
                                      <time>{formatWhen(comment.createdAt)}</time>
                                      <p>{comment.body}</p>
                                    </div>
                                  </li>
                                ))}
                                {history.attachments.map((file) => (
                                  <li key={file.id} className={file.isArchived ? 'is-archived' : ''}>
                                    <button type="button" className="alerts-sheet-file" onClick={() => void downloadAlertAttachment(accessToken!, a.id, file.id, file.fileName)}>
                                      <Paperclip size={14} />
                                      {file.fileName}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="alerts-sheet-composer">
                            <input
                              value={commentDrafts[a.id] || ''}
                              placeholder={t('alerts.commentPlaceholder')}
                              onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [a.id]: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  saveComment();
                                }
                              }}
                            />
                            <label className={`alerts-sheet-icon${canEdit ? '' : ' is-disabled'}`} title={t('alerts.attach')}>
                              <Paperclip size={16} />
                              <input
                                type="file"
                                disabled={!canEdit || busyKey === `file-${a.id}`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  onAttachment(file);
                                }}
                              />
                            </label>
                            <button type="button" className="alerts-sheet-send" disabled={busyKey === `comment-${a.id}` || !(commentDrafts[a.id] || '').trim()} onClick={saveComment} aria-label={t('alerts.sendComment')}>
                              <ArrowUp size={16} />
                            </button>
                          </div>
                          <div className="alerts-sheet-rail-actions">
                            {isAdmin && workflow === 'pending_validation' && (
                              <>
                                <button type="button" className="alerts-sheet-btn is-reject" disabled={busyKey === `decide-${a.id}` || !decisionNote.trim()} onClick={() => decide(false)}>
                                  {t('alerts.reject')}
                                </button>
                                <button type="button" className="alerts-sheet-btn" disabled={busyKey === `decide-${a.id}`} onClick={() => decide(true)}>
                                  {t('alerts.validate')}
                                </button>
                              </>
                            )}
                            {isAdmin && (
                              active ? (
                                <button type="button" className="alerts-sheet-btn" disabled={resolvingId === a.id} onClick={() => void handleArchive(a.id)}>
                                  <Archive size={15} />
                                  {resolvingId === a.id ? t('alerts.archiving') : t('alerts.archive')}
                                </button>
                              ) : (
                                <button type="button" className="alerts-sheet-btn" disabled={resolvingId === a.id} onClick={() => void handleUnarchive(a.id)}>
                                  <Archive size={15} />
                                  {resolvingId === a.id ? t('alerts.restoring') : t('alerts.restore')}
                                </button>
                              )
                            )}
                            {!isAdmin && canEdit && (
                              <button
                                type="button"
                                className={`alerts-sheet-btn${savedKey === `submit-report-${a.id}` ? ' is-saved' : ''}`}
                                disabled={busyKey === `submit-report-${a.id}` || !(reportDrafts[a.id] ?? ownReport?.content ?? '').trim()}
                                onClick={submitReport}
                              >
                                {busyKey === `submit-report-${a.id}`
                                  ? t('common.saving')
                                  : savedKey === `submit-report-${a.id}`
                                    ? t('eightD.saved')
                                    : t('common.save')}
                              </button>
                            )}
                            <Link to={claimsHref} className="alerts-claims-link">{t('closedArchive.backToClaims')}</Link>
                            {history.capas.filter((capa) => !capa.isArchived).map((capa) => (
                              <Link
                                key={capa.id}
                                to={isAdmin ? `/pages/front/action-plans/${capa.id}` : `/pages/front/my-action-plans/${capa.id}`}
                                className="alerts-claims-link"
                                title={capa.title}
                              >
                                {t('alerts.capaPrefix')} {capa.title.length > 40 ? `${capa.title.slice(0, 40)}…` : capa.title}
                                <ArrowRight size={14} />
                              </Link>
                            ))}
                          </div>
                        </aside>
                      </div>
                    </form>
                  </div>,
                  document.body,
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
