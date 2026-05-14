import { useState, useEffect, useRef } from 'react';

// Profile-photo cropper: circular crop region, zoom slider, drag-to-pan.
// Outputs a 512×512 JPEG Blob to onSave.
export default function ProfilePhotoCropper({ file, onCancel, onSave }) {
  const [src, setSrc] = useState(null);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  const SIZE = 320; // preview circle size

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      // Default zoom that fits image to fill the circle
      const ratio = Math.max(SIZE / i.width, SIZE / i.height);
      setZoom(ratio);
      setOffset({ x: 0, y: 0 });
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Redraw whenever image / zoom / offset change
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#1A1C3A';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw image at zoom + offset (centered)
    const w = img.width * zoom;
    const h = img.height * zoom;
    const x = SIZE / 2 - w / 2 + offset.x;
    const y = SIZE / 2 - h / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);

    // Dim outside the circle to show preview
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [img, zoom, offset]);

  const onPointerDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  const onPointerUp = (e) => {
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const handleSave = async () => {
    if (!img) return;
    // Render to 512×512 output canvas using the same crop math
    const OUT = 512;
    const out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    const octx = out.getContext('2d');
    const scale = OUT / SIZE;
    const w = img.width * zoom * scale;
    const h = img.height * zoom * scale;
    const x = OUT / 2 - w / 2 + offset.x * scale;
    const y = OUT / 2 - h / 2 + offset.y * scale;
    octx.fillStyle = '#1A1C3A';
    octx.fillRect(0, 0, OUT, OUT);
    octx.save();
    octx.beginPath();
    octx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    octx.clip();
    octx.drawImage(img, x, y, w, h);
    octx.restore();

    out.toBlob((blob) => {
      if (!blob) return;
      const finalFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      onSave(finalFile);
    }, 'image/jpeg', 0.9);
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-1)', border: '1px solid var(--line-2)',
        borderRadius: 14, padding: 20, width: 'min(420px, 100%)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
          Crop your photo
        </h3>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 14 }}>
          Drag to position · Use the slider to zoom
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              width: SIZE, height: SIZE,
              borderRadius: '50%',
              cursor: dragging.current ? 'grabbing' : 'grab',
              touchAction: 'none',
              boxShadow: '0 0 0 4px rgba(99,102,241,0.2), 0 8px 24px rgba(0,0,0,0.4)'
            }}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 4 }}>
            <span>ZOOM</span>
            <span>{(zoom).toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={img ? Math.max(SIZE / img.width, SIZE / img.height) : 0.5}
            max={img ? Math.max(SIZE / img.width, SIZE / img.height) * 4 : 4}
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--indigo)' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => { if (img) { const r = Math.max(SIZE/img.width, SIZE/img.height); setZoom(r); setOffset({x:0,y:0}); } }}
            style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, background: 'var(--glass-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink-2)', cursor: 'pointer' }}>
            ↻ Reset
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink-2)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave}
              style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
