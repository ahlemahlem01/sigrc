import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

/** Detection-style box over the preview: a guide to centre the damaged part, the whole image is still captured. */
const BOX = '#facc15';
const FramingGuide: React.FC<{ hint: string; zone: string }> = ({ hint, zone }) => {
  const corner = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 22, height: 22, borderColor: BOX, borderStyle: 'solid', borderWidth: 0, ...pos,
  });
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 8 }}>
      <div style={{ position: 'absolute', inset: '15% 12%', border: `2px solid ${BOX}`, borderRadius: 4, boxShadow: '0 0 0 9999px rgba(8,15,32,.35), 0 0 10px rgba(250,204,21,.45)' }}>
        <span style={corner({ top: -5, left: -5, borderTopWidth: 5, borderLeftWidth: 5 })} />
        <span style={corner({ top: -5, right: -5, borderTopWidth: 5, borderRightWidth: 5 })} />
        <span style={corner({ bottom: -5, left: -5, borderBottomWidth: 5, borderLeftWidth: 5 })} />
        <span style={corner({ bottom: -5, right: -5, borderBottomWidth: 5, borderRightWidth: 5 })} />
        <span style={{ position: 'absolute', left: -2, top: -24, padding: '2px 9px', background: BOX, color: '#1f2937', fontSize: 11, fontWeight: 700, lineHeight: 1.5, borderRadius: '4px 4px 0 0' }}>{zone}</span>
      </div>
      <span style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', maxWidth: '90%', padding: '4px 12px', borderRadius: 999, background: 'rgba(8,15,32,.72)', color: '#fff', fontSize: 12, lineHeight: 1.4, textAlign: 'center' }}>{hint}</span>
    </div>
  );
};

/** Live camera preview (getUserMedia): the captured frame is handed back as a JPEG File. */
export const CameraCaptureModal: React.FC<Props> = ({ onCapture, onClose }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e: DOMException) => {
        if (!cancelled) setError(e?.name === 'NotAllowedError' ? t('camera.denied') : t('camera.unavailable'));
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [t]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.92);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 16, width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: '#0f2b5c' }}>{t('createClaim.takePhoto')}</strong>
          <button type="button" onClick={onClose} aria-label={t('camera.close')} style={{ background: 'none', border: 0, cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        {error ? (
          <p style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{error}</p>
        ) : (
          <div style={{ position: 'relative', lineHeight: 0 }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
              style={{ width: '100%', borderRadius: 8, background: '#0f172a', maxHeight: '60vh' }}
            />
            {ready && <FramingGuide hint={t('camera.hint')} zone={t('camera.zone')} />}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
            {t('camera.close')}
          </button>
          {!error && (
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.6, display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              <Camera size={16} /> {t('camera.capture')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
