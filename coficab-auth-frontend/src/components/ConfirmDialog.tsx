import { useEffect } from 'react';

type Props = {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-page confirmation: the browser's native confirm() is silently blocked in embedded browsers. */
export default function ConfirmDialog({ title, text, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-label={title} onClick={() => !busy && onCancel()}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 m-0">{title}</h3>
        <p className="text-sm text-gray-600 mt-2 mb-0">{text}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Annuler</button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a237e] hover:bg-[#0d1642]'}`}
          >
            {busy ? 'En cours…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
