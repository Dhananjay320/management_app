import { useState, useMemo } from 'react';

// Click-to-load video preview: shows the thumbnail with a play button.
// When clicked, swaps to the embed iframe. Falls back to opening the
// original URL if the iframe errors (e.g. YouTube Error 153 = embed blocked).
export default function InlineVideoPlayer({ embedUrl, image, title, fallbackUrl }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Append window origin for YouTube (required to avoid Error 153) and
  // enablejsapi so we can listen for player state via postMessage.
  const finalEmbedUrl = useMemo(() => {
    if (!embedUrl) return embedUrl;
    try {
      const u = new URL(embedUrl);
      if (/youtube\.com|youtube-nocookie\.com/.test(u.hostname)) {
        u.searchParams.set('origin', window.location.origin);
        u.searchParams.set('enablejsapi', '1');
        u.searchParams.set('widget_referrer', window.location.href);
      }
      return u.toString();
    } catch {
      return embedUrl;
    }
  }, [embedUrl]);

  if (!loaded) {
    return (
      <div
        onClick={() => setLoaded(true)}
        style={{
          position: 'relative', width: '100%', paddingBottom: '56.25%',
          background: image ? `#000 center/cover no-repeat url(${image})` : '#111',
          cursor: 'pointer'
        }}
        title="Click to play"
      >
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 100%)'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            border: '2px solid rgba(255,255,255,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: '#fff', paddingLeft: 4
          }}>▶</div>
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div style={{
        position: 'relative', width: '100%', paddingBottom: '56.25%',
        background: image ? `#000 center/cover no-repeat url(${image})` : '#111'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', gap: 12,
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', textAlign: 'center', padding: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Inline player not allowed for this video</div>
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              padding: '8px 16px', background: '#FF0000',
              color: '#fff', textDecoration: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 700
            }}>
            ▶ Open on YouTube
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
      <iframe
        src={finalEmbedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onError={() => setErrored(true)}
        // We can't reliably detect iframe error from outside. As a heuristic,
        // give it 4s then show a "click to open if it didn't play" button.
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
      />
      {/* Always-available escape hatch — small "Open externally" overlay button */}
      <a href={fallbackUrl} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 8, right: 8,
          padding: '4px 8px', background: 'rgba(0,0,0,0.55)',
          color: '#fff', textDecoration: 'none', borderRadius: 4,
          fontSize: 10, fontWeight: 600,
        }}>
        ↗ Open
      </a>
    </div>
  );
}
