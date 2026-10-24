import { workflowMessage } from '../../utils/apiError';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiveWhyAnalysis } from '../../components/FiveWhyAnalysis';
// 🔧 CHANGEMENT : on utilise IshikawaPage (composant complet, qui fetch et
// sauvegarde ses propres données) au lieu de IshikawaDiagram (composant
// purement présentationnel qui n'a jamais reçu de prop `causes` ici et
// s'affichait donc toujours vide).
//
// ⚠️ Vérifie/ajuste ce chemin d'import selon l'emplacement réel de
// IshikawaPage.tsx dans ton arbre de fichiers (probablement quelque chose
// comme '../claims/IshikawaPage' si QualityAnalysisPage et IshikawaPage
// sont dans des dossiers "pages/xxx" au même niveau).
import { IshikawaPage } from '../claims/IshikawaPage';
import { useAuth } from '../../context/AuthContext';
import { useQualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim, UpdateClaimCommand } from '../../types/qualityAnalysis';
import { 
  UserRole, 
  UserContextData, 
  canEditAnalysis, 
  canValidateAnalysis, 
  canViewGlobalAnalytics 
} from '../../utils/permissions';
import { defectLabel, defectValueFromInput } from '../../utils/defectLabel';

// Extended type interface to support Step 3 traceability fields locally
interface ExtendedClaim extends Claim {
  workstation?: string;
  shift?: string;
  productionDate?: string;
  status?: string;
}

export const QualityAnalysisPage: React.FC = () => {
  const { claimId: urlClaimId } = useParams<{ claimId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qualityService = useQualityAnalysisService();
  const { getClaims } = qualityService;

  // Selected claim state
  const [selectedClaimId, setSelectedClaimId] = useState<string>(urlClaimId || '');
  const [inputClaimId, setInputClaimId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'5why' | 'ishikawa'>('5why');

  // Backend fetched data
  const [claimsList, setClaimsList] = useState<ExtendedClaim[]>([]);
  const [, setClaimsLoading] = useState<boolean>(true);
  const [activeClaim, setActiveClaim] = useState<ExtendedClaim | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editFormData, setEditFormData] = useState<Partial<ExtendedClaim>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Map real auth context user to UserContextData
  const currentUser: UserContextData = {
    userId: user?.id || 'usr-default',
    role: (user?.role as UserRole) || 'ADMIN_QUALITY',
    assignedClaimIds: claimsList.map((c) => c.id),
  };

  const { accessToken } = useAuth();

  // Sync URL parameter changes
  useEffect(() => {
    if (urlClaimId) {
      setSelectedClaimId(urlClaimId);
    }
  }, [urlClaimId]);

  // Fetch all claims list for selection picker
  const fetchClaimsList = useCallback(async () => {
    // Guard against unauthenticated state
    if (!accessToken) return;

    try {
      setClaimsLoading(true);

      // Call getClaims with NO arguments to fetch all claims
      // Or pass a specific status string, e.g., getClaims('OUVERTE')
      const data = await getClaims();
      const items = Array.isArray(data) ? data : (data as { items?: ExtendedClaim[] })?.items || [];
      setClaimsList(items);
    } catch (err) {
      console.error('Failed to load assigned claims:', err);
    } finally {
      setClaimsLoading(false);
    }
  }, [accessToken, getClaims]);

  // Fetch active claim details when selectedClaimId changes
  const fetchClaimDetails = useCallback(async () => {
    if (!selectedClaimId) {
      setActiveClaim(null);
      return;
    }
    if (!accessToken) return;

    setLoading(true);
    setError(null);
    try {
      const claimData = await qualityService.getClaimById(selectedClaimId);
      setActiveClaim(claimData as ExtendedClaim);
    } catch (err: any) {
      console.error('Error fetching claim details:', err);
      setError(err?.response?.data?.message || `Impossible de charger la réclamation N° ${selectedClaimId}`);
      setActiveClaim(null);
    } finally {
      setLoading(false);
    }
  }, [selectedClaimId, accessToken, qualityService]);

  useEffect(() => {
    fetchClaimsList();
  }, [fetchClaimsList]);

  useEffect(() => {
    fetchClaimDetails();
  }, [fetchClaimDetails]);

  // Open Edit Modal with active claim fields
  const handleOpenEditModal = () => {
    if (!activeClaim) return;
    setEditFormData({
      id: activeClaim.id,
      title: activeClaim.title || '',
      clientId: activeClaim.clientId || '',
      defectType: activeClaim.defectType || '',
      severity: activeClaim.severity || 'Medium',
      lotNumber: activeClaim.lotNumber || '',
      serialNumber: activeClaim.serialNumber || '',
      description: activeClaim.description || '',
      workstation: activeClaim.workstation || 'Poste de sertissage n°3',
      shift: activeClaim.shift || 'Équipe de nuit',
      productionDate: activeClaim.productionDate || '2026-07-24',
    });
    setIsEditModalOpen(true);
  };

  // Handle Edit Input Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Save Edit Changes to Backend
  const handleSaveClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClaim?.id) return;

    setIsSaving(true);
    try {
      const command: UpdateClaimCommand = {
        id: activeClaim.id,
        title: editFormData.title,
        clientId: editFormData.clientId,
        defectType: editFormData.defectType,
        severity: editFormData.severity,
        lotNumber: editFormData.lotNumber,
        serialNumber: editFormData.serialNumber,
        description: editFormData.description,
        updatedById: currentUser.userId,
        ...editFormData,
      } as UpdateClaimCommand;

      await qualityService.updateClaim(activeClaim.id, command);

      // Refresh claim state instantly
      const updated = { ...activeClaim, ...editFormData } as ExtendedClaim;
      setActiveClaim(updated);
      setClaimsList((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

      setIsEditModalOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Échec de la mise à jour de la réclamation.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── ÉTAPE 3 : Action pour passer le statut en 'IN_ANALYSIS' ──────────────
const handleStartAnalysis = async () => {
  if (!activeClaim?.id) return;
  try {
    const serviceAny = qualityService as any;
    if (typeof serviceAny.updateClaimStatus === 'function') {
      await serviceAny.updateClaimStatus(activeClaim.id, 'EN_ANALYSE');
    } else {
      await qualityService.updateClaim(activeClaim.id, { id: activeClaim.id, status: 'EN_ANALYSE' } as any);
    }

    // Update local state for the active claim
    setActiveClaim((prev) => (prev ? { ...prev, status: 'EN_ANALYSE' } : null));

    // Optional: Refresh your claims list from backend if getClaims() exists in scope
    if (typeof getClaims === 'function') {
      getClaims();
    }
  } catch (err) {
    console.error('Erreur lors du changement de statut:', err);
    alert(workflowMessage(err) ?? 'Impossible de passer le dossier en analyse.');
  }
};

  // ─── CLAIM SELECTOR VIEW (WHEN NO CLAIM ID SELECTED) ────────────────────
  if (!selectedClaimId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-md max-w-lg w-full space-y-6 text-center">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
            🔍
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Analyse Qualité & Cause Racine</h2>
            <p className="text-sm text-gray-500 mt-1">
              Veuillez sélectionner ou saisir l'identifiant d'un plan d'action / réclamation pour afficher les analyses 5-Pourquoi et Ishikawa.
            </p>
          </div>

          {/* Assigned claims list fetched from backend */}
          {claimsList.length > 0 && (
            <div className="space-y-2 text-left">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Vos dossiers assignés :
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {claimsList.map((claim) => (
                  <button
                    key={claim.id}
                    onClick={() => {
                      setSelectedClaimId(claim.id);
                      navigate(`/pages/front/quality-analyses/${claim.id}`);
                    }}
                    className="p-2.5 text-xs font-semibold bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg text-gray-700 transition text-left truncate"
                  >
                    Dossier N° {claim.title || claim.id.substring(0, 8)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual input ID form */}
          <div className="pt-2 border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputClaimId.trim()) {
                  setSelectedClaimId(inputClaimId.trim());
                  navigate(`/pages/front/quality-analyses/${inputClaimId.trim()}`);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ex: 094bea0b-e108-430a..."
                value={inputClaimId}
                onChange={(e) => setInputClaimId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!inputClaimId.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition"
              >
                Ouvrir
              </button>
            </form>
          </div>

          <button
            onClick={() => navigate('/pages/front/my-action-plans')}
            className="text-xs text-gray-500 hover:text-gray-800 underline transition"
          >
            ← Retourner à la liste de mes plans d'action
          </button>
        </div>
      </div>
    );
  }

  // Permission checks
  const activeClaimId = selectedClaimId;
  const isEditable = canEditAnalysis(currentUser, activeClaimId);
  const isQualityManager = canValidateAnalysis(currentUser);
  const canViewAnalytics = canViewGlobalAnalytics(currentUser);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER & TOP BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div>
            <button
              onClick={() => {
                setSelectedClaimId('');
                navigate('/pages/front/quality-analyses');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-2 transition"
            >
              ← Changer de dossier / Réclamation
            </button>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Analyse Qualité & Cause Racine (8D)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Réclamation / Plan N° <span className="font-mono font-semibold text-gray-800">{activeClaimId}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
         {/* 🆕 ÉTAPE 3 : BOUTON DÉMARRER L'ANALYSE */}
{activeClaim && 
 activeClaim.status !== 'EN_ANALYSE' && 
 activeClaim.status !== 'IN_ANALYSIS' && 
 activeClaim.status !== 'IN_PROGRESS' && (
  <button
    onClick={handleStartAnalysis}
    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow transition flex items-center gap-1.5"
  >
    ▶️ Démarrer l'analyse
  </button>
)}
            {/* EDIT CLAIM BUTTON */}
            <button
              onClick={handleOpenEditModal}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow transition flex items-center gap-1.5"
            >
              ✏️ Edit Claim
            </button>

            {/* User Role Badge */}
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              currentUser.role === 'SUPERADMIN' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
              currentUser.role === 'ADMIN_QUALITY' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              {currentUser.role}
            </span>

            {/* Dashboard Pareto Button */}
            {canViewAnalytics && (
              <button
                onClick={() => navigate('/pages/front/action-plans')}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow transition flex items-center gap-1.5"
              >
                📊 Dashboard Pareto
              </button>
            )}
          </div>
        </div>

        {/* ACTIVE CLAIM DETAILS CARD */}
        {activeClaim && (
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
            
            {/* Informations de base */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-gray-500 font-semibold block uppercase">Titre</span>
                <span className="font-bold text-gray-800 text-sm">{activeClaim.title}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase">Client ID</span>
                <span className="font-medium text-gray-800">{activeClaim.clientId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase">Type Défaut</span>
                <span className="font-medium text-gray-800">{defectLabel(activeClaim.defectType) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase">Sévérité / Statut</span>
                <span className="font-bold text-amber-700">{activeClaim.severity || 'Medium'}</span>
               <span className="ml-2 px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold uppercase">
  {activeClaim.status === 'EN_ANALYSE' || activeClaim.status === 'IN_ANALYSIS'
    ? 'En analyse'
    : (activeClaim.status || 'Ouvert')}
</span>
              </div>
            </div>

            {/* 🆕 ÉTAPE 3 : TRAÇABILITÉ DE PRODUCTION */}
            <div className="border-t border-gray-100 pt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 p-2.5 rounded-md">
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Poste de travail</span>
                <span className="font-medium text-slate-800">⚙️ {activeClaim.workstation || 'Poste de sertissage n°3'}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Équipe / Shift</span>
                <span className="font-medium text-slate-800">🌙 {activeClaim.shift || 'Équipe de nuit'}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Date Fabrication</span>
                <span className="font-medium text-slate-800">📅 {activeClaim.productionDate || '24/07/2026'}</span>
              </div>
            </div>

          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs font-medium">
            {error}
          </div>
        )}

        {/* READ ONLY WARNING */}
        {!isEditable && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-medium flex items-center gap-2">
            <span>🔒</span>
            <span>
              Mode Lecture seule : Vous pouvez consulter l'analyse, mais vous n'avez pas les droits de modification sur cette réclamation.
            </span>
          </div>
        )}

        {/* TAB SWITCHER (5-WHY / ISHIKAWA) */}
        <div className="bg-white rounded-lg p-1.5 border border-gray-200 shadow-sm flex gap-2">
          <button
            onClick={() => setActiveTab('5why')}
            className={`flex-1 py-3 text-sm font-bold rounded-md transition flex items-center justify-center gap-2 ${
              activeTab === '5why'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span>🔍</span>
            <span>Arbre des 5 Pourquoi (5-Why)</span>
          </button>

          <button
            onClick={() => setActiveTab('ishikawa')}
            className={`flex-1 py-3 text-sm font-bold rounded-md transition flex items-center justify-center gap-2 ${
              activeTab === 'ishikawa'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span>🐟</span>
            <span>Diagramme d'Ishikawa (6M)</span>
          </button>
        </div>

        {/* ACTIVE TAB CONTENT */}
        <div className="mt-4">
          {loading ? (
            <div className="p-8 text-center text-sm font-semibold text-gray-500">Chargement de l'analyse...</div>
          ) : (
            <>
              {activeTab === '5why' && (
                <FiveWhyAnalysis
                  claimId={activeClaimId}
                  userId={currentUser.userId}
                  isQualityManager={isQualityManager}
                  readOnly={!isEditable}
                />
              )}

              {activeTab === 'ishikawa' && (
                <IshikawaPage
                  claimId={activeClaimId}
                  readOnly={!isEditable}
                />
              )}
            </>
          )}
        </div>

      </div>

      {/* EDIT MODAL OVERLAY */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveClaim} className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Modifier la Réclamation N° {activeClaimId}</h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Titre / N° Réclamation</label>
              <input type="text" name="title" value={editFormData.title || ''} onChange={handleInputChange} required className="w-full px-3 py-2 text-sm border rounded-md" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Client ID</label>
                <input type="text" name="clientId" value={editFormData.clientId || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Type de Défaut</label>
                <input type="text" name="defectType" value={defectLabel(editFormData.defectType)} onChange={(e) => { e.target.value = defectValueFromInput(e.target.value); handleInputChange(e); }} className="w-full px-3 py-2 text-sm border rounded-md" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Sévérité</label>
                <select name="severity" value={editFormData.severity || 'Medium'} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Numéro de Lot</label>
                <input type="text" name="lotNumber" value={editFormData.lotNumber || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Poste</label>
                <input type="text" name="workstation" value={editFormData.workstation || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" placeholder="Ex: Poste n°3" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Équipe</label>
                <input type="text" name="shift" value={editFormData.shift || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" placeholder="Ex: Nuit" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Date Fab.</label>
                <input type="date" name="productionDate" value={editFormData.productionDate || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
              <textarea name="description" rows={3} value={editFormData.description || ''} onChange={handleInputChange} className="w-full px-3 py-2 text-sm border rounded-md" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-md">
                Annuler
              </button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md">
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};