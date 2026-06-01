import { useEffect, useRef, useState } from 'react';

// Webcam selfie modal. Opens user-facing camera, shows live preview, captures
// a single JPEG frame on click. Stream is stopped when the modal closes (or
// after capture) so the camera light goes off.
//
// Props:
//   open       — show/hide
//   onCapture  — (blob) => void   called with JPEG blob on confirm
//   onCancel   — () => void
export default function SelfieCapture({ open, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [shot, setShot] = useState(null); // {blob, dataUrl}

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        setError(err.message || 'Camera access denied.');
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setShot(null);
      setError('');
    };
  }, [open]);

  const takeShot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setShot({ blob, dataUrl });
    // Stop camera once we have a shot — user reviews the still image
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const retake = async () => {
    setShot(null);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setError(err.message || 'Camera access denied.');
    }
  };

  if (!open) return null;

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14,
        padding: 18, width: 'min(92vw, 520px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>📸 Verify with a selfie</div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', fontSize: 22, cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative', aspectRatio: '4 / 3' }}>
          {shot ? (
            <img src={shot.dataUrl} alt="Selfie preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, padding: 16, textAlign: 'center' }}>
              ❌ {error}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, textAlign: 'center' }}>
          {shot ? 'Looks good? Confirm to attach this selfie to your entry.' : 'Center your face in the frame and click Capture.'}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          {shot ? (
            <>
              <button onClick={retake}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Retake
              </button>
              <button onClick={() => onCapture(shot.blob)}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--emerald)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ✓ Use this selfie
              </button>
            </>
          ) : (
            <>
              <button onClick={onCancel}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={takeShot} disabled={!!error}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--indigo)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: error ? 'not-allowed' : 'pointer', opacity: error ? 0.5 : 1 }}>
                📸 Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
