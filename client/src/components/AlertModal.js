import { useState, useCallback, createContext, useContext } from 'react';

const AlertContext = createContext(null);

export function useAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({ children }) {
  const [modal, setModal] = useState(null);

  const showAlert = useCallback((message, title = 'Notice') => {
    return new Promise((resolve) => {
      setModal({ type: 'alert', title, message, resolve });
    });
  }, []);

  const showConfirm = useCallback((message, title = 'Confirm') => {
    return new Promise((resolve) => {
      setModal({ type: 'confirm', title, message, resolve });
    });
  }, []);

  const showPrompt = useCallback((message, title = 'Input', defaultValue = '') => {
    return new Promise((resolve) => {
      setModal({ type: 'prompt', title, message, resolve, defaultValue });
    });
  }, []);

  const close = (result) => {
    if (modal?.resolve) modal.resolve(result);
    setModal(null);
  };

  return (
    <AlertContext.Provider value={{ alert: showAlert, confirm: showConfirm, prompt: showPrompt }}>
      {children}
      {modal && <AlertModalUI modal={modal} onClose={close} />}
    </AlertContext.Provider>
  );
}

function AlertModalUI({ modal, onClose }) {
  const [inputVal, setInputVal] = useState(modal.defaultValue || '');

  const typeColors = {
    alert: '#6366F1',
    confirm: '#F59E0B',
    prompt: '#6366F1'
  };
  const color = typeColors[modal.type];

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }} onClick={() => onClose(modal.type === 'confirm' ? false : modal.type === 'prompt' ? null : undefined)}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg-1, #14162E)', border: '1px solid var(--line, #334155)',
          borderRadius: 14, width: 380, maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden', animation: 'fadeIn 0.15s ease'
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: `2px solid ${color}20`,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ fontSize: 18 }}>
              {modal.type === 'alert' ? 'ℹ️' : modal.type === 'confirm' ? '⚠️' : '✏️'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink, #e2e8f0)' }}>
              {modal.title}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '16px 18px' }}>
            <div style={{
              fontSize: 13, color: 'var(--ink-2, #cbd5e1)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap'
            }}>
              {modal.message}
            </div>

            {modal.type === 'prompt' && (
              <input
                autoFocus
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onClose(inputVal); }}
                style={{
                  width: '100%', marginTop: 12, padding: '8px 12px',
                  border: `1px solid ${color}40`, borderRadius: 8,
                  fontSize: 13, fontFamily: 'Inter, sans-serif',
                  background: 'var(--glass, rgba(255,255,255,0.03))',
                  color: 'var(--ink, #e2e8f0)', outline: 'none',
                  boxSizing: 'border-box'
                }}
                placeholder="Type here..."
              />
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--line, #334155)',
            display: 'flex', justifyContent: 'flex-end', gap: 8
          }}>
            {modal.type === 'confirm' && (
              <button onClick={() => onClose(false)} style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 600,
                border: '1px solid var(--line, #334155)', borderRadius: 8,
                background: 'var(--glass, transparent)', color: 'var(--ink-2, #94a3b8)',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif'
              }}>
                Cancel
              </button>
            )}
            {modal.type === 'prompt' && (
              <button onClick={() => onClose(null)} style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 600,
                border: '1px solid var(--line, #334155)', borderRadius: 8,
                background: 'var(--glass, transparent)', color: 'var(--ink-2, #94a3b8)',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif'
              }}>
                Cancel
              </button>
            )}
            <button
              autoFocus={modal.type !== 'prompt'}
              onClick={() => {
                if (modal.type === 'alert') onClose(true);
                else if (modal.type === 'confirm') onClose(true);
                else if (modal.type === 'prompt') onClose(inputVal);
              }}
              style={{
                padding: '8px 22px', fontSize: 12, fontWeight: 700,
                border: 'none', borderRadius: 8,
                background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                color: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif'
              }}
            >
              {modal.type === 'alert' ? 'OK' : modal.type === 'confirm' ? 'Yes' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </>
  );
}
