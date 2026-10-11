import React, { useEffect, useState } from 'react';
import { qualityAnalysisService } from './../services/qualityAnalysisService';
import { FiveWhyStep } from '../types/qualityAnalysis';

interface FiveWhyProps {
  claimId: string;
  userId: string;
  isQualityManager?: boolean;
  readOnly?: boolean;
}

export const FiveWhyAnalysis: React.FC<FiveWhyProps> = ({
  claimId,
  userId,
  isQualityManager = false,
  readOnly = false
}) => {
  const [problemStatement, setProblemStatement] = useState<string>('');
  const [rootCause, setRootCause] = useState<string>('');
  const [steps, setSteps] = useState<FiveWhyStep[]>([
    { stepNumber: 1, question: '', answer: '' }
  ]);
  const [status, setStatus] = useState<string>('DRAFT');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (claimId) {
      loadFiveWhy();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [claimId]);

  const loadFiveWhy = async () => {
    try {
      setLoading(true);
      const data = await qualityAnalysisService.getFiveWhy(claimId);
      if (data) {
        // 🔹 Fix 1: Utilisation de `data.id || null` pour éviter d'assigner undefined à `string | null`
        setAnalysisId(data.id || null);
        setProblemStatement(data.problemStatement || '');
        setRootCause(data.rootCause || '');
        setStatus(data.statusCode || 'DRAFT');
        if (data.steps && data.steps.length > 0) {
          setSteps(data.steps);
        }
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setMessage({ type: 'error', text: "Erreur lors du chargement de l'analyse 5 Pourquoi." });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStepChange = (index: number, field: 'question' | 'answer', value: string) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const addStep = () => {
    if (steps.length < 5 && !readOnly) {
      setSteps([...steps, { stepNumber: steps.length + 1, question: '', answer: '' }]);
    }
  };

  const removeStep = (index: number) => {
    if (steps.length > 1 && !readOnly) {
      const filtered = steps.filter((_, i) => i !== index);
      const reindexed = filtered.map((step, i) => ({ ...step, stepNumber: i + 1 }));
      setSteps(reindexed);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    try {
      setLoading(true);
      setMessage(null);
      const res = await qualityAnalysisService.saveFiveWhy({
        claimId,
        userId,
        problemStatement,
        rootCause,
        steps
      });
      // 🔹 Fix 2: Utilisation d'une valeur par défaut au cas où res.message est undefined
      setMessage({ type: 'success', text: res.message || 'Analyse enregistrée avec succès.' });
      loadFiveWhy();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || "Erreur d'enregistrement." });
    } finally {
      setLoading(false);
    }
  };

  const handleValidation = async (isApproved: boolean) => {
    if (!analysisId || readOnly) return;
    try {
      setLoading(true);
      const res = await qualityAnalysisService.validateFiveWhy({
        analysisId,
        isApproved,
        validatedBy: userId
      });
      // 🔹 Fix 3: Idem pour la réponse du statut de validation
      setMessage({ type: 'success', text: res.message || 'Validation traitée avec succès.' });
      loadFiveWhy();
    } catch (err: any) {
      setMessage({ type: 'error', text: "Erreur lors de la validation." });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await qualityAnalysisService.downloadPdfReport(claimId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_5Why_${claimId.substring(0, 8)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ type: 'error', text: "Erreur lors du téléchargement du PDF." });
    }
  };

  if (loading && !problemStatement) {
    return <div className="p-4 text-center">Chargement de l'analyse Qualité...</div>;
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-4xl mx-auto border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Analyse des 5 Pourquoi (5-Why)</h2>
          <p className="text-sm text-gray-500">Réclamation ID : {claimId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            status === 'VALIDATED' ? 'bg-green-100 text-green-800' :
            status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {status}
          </span>
          <button
            onClick={handleDownloadPdf}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-sm rounded shadow transition"
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 mb-4 rounded text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Énoncé du Problème (Problem Statement)
          </label>
          <textarea
            required
            disabled={readOnly}
            rows={2}
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
            placeholder="Décrivez clairement l'anomalie ou le défaut constaté..."
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-md font-semibold text-gray-800">Séquence des Pourquoi :</h3>
          {steps.map((step, index) => (
            <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-blue-600">Pourquoi N°{index + 1}</span>
                {steps.length > 1 && !readOnly && (
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <input
                type="text"
                disabled={readOnly}
                placeholder={`Pourquoi le problème N°${index + 1} s'est-il produit ?`}
                value={step.question}
                onChange={(e) => handleStepChange(index, 'question', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                required
              />
              <input
                type="text"
                disabled={readOnly}
                placeholder="Réponse / Cause identifiée à ce stade..."
                value={step.answer}
                onChange={(e) => handleStepChange(index, 'answer', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-100"
                required
              />
            </div>
          ))}

          {steps.length < 5 && !readOnly && (
            <button
              type="button"
              onClick={addStep}
              className="w-full py-2 border-2 border-dashed border-blue-400 text-blue-600 font-medium rounded-md hover:bg-blue-50 transition"
            >
              + Ajouter le Pourquoi N°{steps.length + 1}
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Cause Racine Finale (Root Cause)
          </label>
          <textarea
            rows={2}
            disabled={readOnly}
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            className="w-full p-2.5 border border-red-300 bg-red-50/30 rounded-md focus:ring-2 focus:ring-red-500 focus:outline-none disabled:bg-gray-100"
            placeholder="Conclusion finale sur l'origine fondamentale de la défaillance..."
          />
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          {!readOnly && (
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow transition disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer l\'Analyse'}
            </button>
          )}

          {isQualityManager && analysisId && !readOnly && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleValidation(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md"
              >
                Rejeter
              </button>
              <button
                type="button"
                onClick={() => handleValidation(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md"
              >
                Valider l'Analyse
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};