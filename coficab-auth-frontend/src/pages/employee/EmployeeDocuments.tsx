import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Image, Loader2, Presentation, Search, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMyDocuments, downloadDocument, toggleFavorite, DocumentDto } from '../../services/documentService';
import { useAuth } from '../../context/AuthContext';
import './EmployeeDocuments.css';

type Filter = 'all' | 'favorites';
type Sort = 'recent' | 'name';

/** File-type tile: one neutral style, the label and icon tell the formats apart. */
function typeInfo(type: string) {
  const t = (type || '').toUpperCase();
  if (t === 'PDF') return { label: 'PDF', Icon: FileText };
  if (['XLS', 'XLSX', 'CSV', 'ODS'].includes(t)) return { label: t, Icon: FileSpreadsheet };
  if (['PPT', 'PPTX'].includes(t)) return { label: t, Icon: Presentation };
  if (['IMG', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(t)) return { label: t === 'IMG' ? 'IMAGE' : t, Icon: Image };
  return { label: t || 'FICHIER', Icon: FileText };
}

export const EmployeeDocuments: React.FC = () => {
  const { accessToken } = useAuth();
  const { t, i18n } = useTranslation();
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const formatDate = useCallback(
    (iso?: string | null) => {
      if (!iso || iso === 'Never') return '';
      const d = new Date(iso);
      return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString(i18n.language || 'fr', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    [i18n.language],
  );

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError('');
    try {
      const res = await getMyDocuments(accessToken);
      setDocuments(res.data ?? []);
    } catch {
      setError(t('employeeDocuments.loadFailed'));
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (doc: DocumentDto) => {
    if (!accessToken || downloadingId) return;
    setDownloadingId(doc.id);
    setError('');
    try {
      const blob = await downloadDocument(doc.id, accessToken);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      void load(); // refresh "last opened"
    } catch {
      setError(t('employeeDocuments.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    if (!accessToken) return;
    try {
      const { isFavorite } = await toggleFavorite(id, accessToken);
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, isFavorite } : d)));
    } catch {
      setError(t('employeeDocuments.favoriteFailed'));
    }
  };

  const favoriteCount = documents.filter((d) => d.isFavorite).length;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter((d) => filter === 'all' || d.isFavorite)
      .filter((d) => !term || d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term))
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name, i18n.language)
          : new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
  }, [documents, filter, search, sort, i18n.language]);

  return (
    <div className="edc-page">
      <div className="edc-inner">
        <header className="edc-header">
          <p className="edc-kicker">{t('employeeDocuments.kicker')}</p>
          <h1>{t('employeeDocuments.title')}</h1>
          <p className="edc-sub">{t('employeeDocuments.subtitle')}</p>
        </header>

        <div className="edc-toolbar">
          <div className="edc-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={filter === 'all' ? 'on' : ''}
              onClick={() => setFilter('all')}
            >
              {t('employeeDocuments.all')} <span>{documents.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'favorites'}
              className={filter === 'favorites' ? 'on' : ''}
              onClick={() => setFilter('favorites')}
            >
              <Star size={13} /> {t('employeeDocuments.favorites')} <span>{favoriteCount}</span>
            </button>
          </div>
          <div className="edc-tools">
            <label className="edc-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder={t('employeeDocuments.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('employeeDocuments.sortLabel')}>
              <option value="recent">{t('employeeDocuments.sortRecent')}</option>
              <option value="name">{t('employeeDocuments.sortName')}</option>
            </select>
          </div>
        </div>

        {error && <div className="edc-alert" role="alert">{error}</div>}

        <section className="edc-panel" aria-live="polite">
          {loading ? (
            <ul className="edc-list" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="edc-skel" />
              ))}
            </ul>
          ) : documents.length === 0 ? (
            <div className="edc-empty">
              <span className="edc-empty-icon"><FileText size={22} /></span>
              <strong>{t('employeeDocuments.emptyTitle')}</strong>
              <p>{t('employeeDocuments.emptyHint')}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="edc-empty">
              <strong>{t('employeeDocuments.noResults')}</strong>
            </div>
          ) : (
            <ul className="edc-list">
              {visible.map((doc) => {
                const { label, Icon } = typeInfo(doc.type);
                const added = formatDate(doc.createdAt);
                const opened = formatDate(doc.lastViewed);
                return (
                  <li key={doc.id} className="edc-row">
                    <span className="edc-type" aria-hidden>
                      <Icon size={18} strokeWidth={1.9} />
                      <small>{label}</small>
                    </span>
                    <div className="edc-main">
                      <span className="edc-name">{doc.name}</span>
                      {doc.description && <p className="edc-desc">{doc.description}</p>}
                      <p className="edc-meta">
                        {added && <span>{t('employeeDocuments.addedOn', { date: added })}</span>}
                        {doc.createdBy && <span>{t('employeeDocuments.addedBy', { name: doc.createdBy })}</span>}
                        <span className={opened ? '' : 'muted'}>
                          {opened ? t('employeeDocuments.openedOn', { date: opened }) : t('employeeDocuments.neverOpened')}
                        </span>
                      </p>
                    </div>
                    <div className="edc-actions">
                      <button
                        type="button"
                        className={`edc-fav${doc.isFavorite ? ' on' : ''}`}
                        onClick={() => void handleToggleFavorite(doc.id)}
                        title={t(doc.isFavorite ? 'employeeDocuments.removeFavorite' : 'employeeDocuments.addFavorite')}
                        aria-label={t(doc.isFavorite ? 'employeeDocuments.removeFavorite' : 'employeeDocuments.addFavorite')}
                        aria-pressed={doc.isFavorite}
                      >
                        <Star size={16} />
                      </button>
                      <button
                        type="button"
                        className="edc-download"
                        onClick={() => void handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                      >
                        {downloadingId === doc.id ? <Loader2 size={15} className="edc-spin" /> : <Download size={15} />}
                        {t('employeeDocuments.download')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
