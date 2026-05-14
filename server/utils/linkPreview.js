// Lightweight Open Graph / Twitter Card extractor.
// Uses regex (not a full HTML parser) so we have zero dependencies.
// Cached in-memory for 6h to avoid hammering external sites.

const CACHE = new Map(); // url → { value, expires }
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BODY = 1024 * 1024; // 1 MB cap — some sites (YouTube) have heavy <head>
const FETCH_TIMEOUT = 8000;

function extractFirstUrl(text) {
  if (!text) return null;
  const m = text.match(/(https?:\/\/[^\s<>"'`]+)/i);
  return m ? m[1].replace(/[.,;!?)]+$/, '') : null;
}

function pickMeta(html, ...patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      // Decode the most common HTML entities
      return m[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
    }
  }
  return null;
}

// Fast path for sites that publish oEmbed (better than scraping)
// Slack-style provider list. Each provider returns {endpoint, name}.
const OEMBED_PROVIDERS = [
  { test: /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/i, endpoint: 'https://www.youtube.com/oembed?url={U}&format=json', name: 'YouTube' },
  { test: /vimeo\.com\//i, endpoint: 'https://vimeo.com/api/oembed.json?url={U}', name: 'Vimeo' },
  { test: /open\.spotify\.com\//i, endpoint: 'https://open.spotify.com/oembed?url={U}', name: 'Spotify' },
  { test: /soundcloud\.com\//i, endpoint: 'https://soundcloud.com/oembed?format=json&url={U}', name: 'SoundCloud' },
  { test: /(?:twitch\.tv\/videos\/|clips\.twitch\.tv\/|twitch\.tv\/[^/]+\/clip\/)/i, endpoint: 'https://api.twitch.tv/v5/oembed?url={U}', name: 'Twitch' },
  { test: /flickr\.com\//i, endpoint: 'https://www.flickr.com/services/oembed?format=json&url={U}', name: 'Flickr' },
  { test: /(?:tiktok\.com\/@[^/]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/)/i, endpoint: 'https://www.tiktok.com/oembed?url={U}', name: 'TikTok' },
  { test: /reddit\.com\/r\/[^/]+\/comments\//i, endpoint: 'https://www.reddit.com/oembed?url={U}', name: 'Reddit' },
  { test: /(?:dribbble\.com\/shots\/)/i, endpoint: 'https://api.dribbble.com/v1/oembed?url={U}', name: 'Dribbble' },
  { test: /imgur\.com\//i, endpoint: 'https://api.imgur.com/oembed.json?url={U}', name: 'Imgur' },
  { test: /(?:figma\.com\/(?:file|design|proto)\/)/i, endpoint: 'https://www.figma.com/api/oembed?url={U}', name: 'Figma' },
  { test: /loom\.com\/share\//i, endpoint: 'https://www.loom.com/v1/oembed?url={U}', name: 'Loom' },
  { test: /(?:codepen\.io\/[^/]+\/pen\/)/i, endpoint: 'https://codepen.io/api/oembed?url={U}&format=json', name: 'CodePen' },
];

function youtubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
  return m ? m[1] : null;
}
function youtubeStart(url) {
  // Supports ?t=761s or ?t=761 or &t=12m30s
  const m = url.match(/[?&]t=(\d+)(?:s)?|[?&]t=(\d+)m(\d+)s/i);
  if (!m) return 0;
  if (m[2] && m[3]) return parseInt(m[2]) * 60 + parseInt(m[3]);
  return parseInt(m[1] || 0);
}
function vimeoId(url) {
  const m = url.match(/vimeo\.com\/(\d+)/i);
  return m ? m[1] : null;
}

async function tryOEmbed(url) {
  const match = OEMBED_PROVIDERS.find(p => p.test.test(url));
  if (!match) return null;
  const oembedUrl = match.endpoint.replace('{U}', encodeURIComponent(url));
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NiyoqBot/1.0', 'Accept': 'application/json' }
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!j?.title) return null;

    // Compute inline-player embed URL for video providers
    // Note: we don't append origin here — that's a runtime concern set on the client.
    let videoEmbedUrl = null;
    if (match.name === 'YouTube') {
      const id = youtubeId(url);
      const start = youtubeStart(url);
      if (id) {
        // Store a template; client appends ?origin=<window.location.origin> at render time
        videoEmbedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${start ? `&start=${start}` : ''}`;
      }
    } else if (match.name === 'Vimeo') {
      const id = vimeoId(url);
      if (id) videoEmbedUrl = `https://player.vimeo.com/video/${id}`;
    } else if (match.name === 'Loom') {
      const m = url.match(/loom\.com\/share\/([a-f0-9]+)/i);
      if (m) videoEmbedUrl = `https://www.loom.com/embed/${m[1]}`;
    }

    return {
      url,
      title: j.title,
      description: j.author_name ? `by ${j.author_name}` : '',
      image: j.thumbnail_url || j.image || null,
      siteName: j.provider_name || match.name,
      videoEmbedUrl
    };
  } catch (e) { return null; }
}

// Twitter/X blocks scrapers. Use fxtwitter mirror which returns OG tags
// designed for embedding. Same URL just with the host swapped.
function rewriteTwitterForUnfurl(url) {
  return url
    .replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i, 'https://api.fxtwitter.com/')
    .replace(/^https?:\/\/(?:mobile\.)?(?:twitter|x)\.com\//i, 'https://api.fxtwitter.com/');
}

async function tryTwitter(url) {
  if (!/(?:^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/[^/]+\/status\/)/i.test(url)) return null;
  try {
    const m = url.match(/\/([^/?#]+)\/status\/(\d+)/);
    if (!m) return null;
    const apiUrl = `https://api.fxtwitter.com/${m[1]}/status/${m[2]}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NiyoqBot/1.0', 'Accept': 'application/json' }
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const j = await resp.json();
    const tw = j?.tweet;
    if (!tw) return null;

    // Capture full media gallery (photos + video thumbnails)
    const gallery = [];
    (tw.media?.photos || []).forEach(p => { if (p.url) gallery.push({ url: p.url, type: 'photo' }); });
    (tw.media?.videos || []).forEach(v => { if (v.thumbnail_url) gallery.push({ url: v.thumbnail_url, type: 'video' }); });

    return {
      url,
      title: tw.author?.name ? `${tw.author.name} (@${tw.author.screen_name})` : 'Tweet',
      description: tw.text || '',
      image: gallery[0]?.url || tw.author?.avatar_url || null,
      siteName: 'X / Twitter',
      gallery
    };
  } catch (e) { return null; }
}

async function fetchPreview(url) {
  if (!url) return null;
  const now = Date.now();
  const cached = CACHE.get(url);
  if (cached && cached.expires > now) return cached.value;

  // Try oEmbed first for known providers (YouTube, Vimeo, Spotify, etc.)
  const oembed = await tryOEmbed(url);
  if (oembed) {
    CACHE.set(url, { value: oembed, expires: now + TTL_MS });
    console.log('[linkPreview] OK (oembed)', url, '→', oembed.title.slice(0, 50));
    return oembed;
  }
  // Twitter/X uses fxtwitter mirror
  const tw = await tryTwitter(url);
  if (tw) {
    CACHE.set(url, { value: tw, expires: now + TTL_MS });
    console.log('[linkPreview] OK (twitter)', url, '→', tw.title);
    return tw;
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'NiyoqBot/1.0 (+https://airanva.com) Link-Preview',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    clearTimeout(t);
    if (!resp.ok) {
      console.log('[linkPreview] HTTP', resp.status, 'for', url);
      return null;
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      console.log('[linkPreview] non-HTML content-type', ct, 'for', url);
      return null;
    }

    // Stream up to MAX_BODY
    const buf = await resp.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BODY));

    const meta = {
      url,
      title: pickMeta(html,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        /<title>([^<]+)<\/title>/i
      ),
      description: pickMeta(html,
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      ),
      image: pickMeta(html,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
      ),
      siteName: pickMeta(html,
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
      ) || new URL(url).hostname.replace(/^www\./, '')
    };

    // Resolve relative image URLs
    if (meta.image && !/^https?:\/\//i.test(meta.image)) {
      try { meta.image = new URL(meta.image, url).toString(); } catch {}
    }

    // Require at least a title for the preview to be useful
    if (!meta.title) {
      console.log('[linkPreview] no title found for', url);
      return null;
    }
    console.log('[linkPreview] OK (og)', url, '→', meta.title.slice(0, 50));

    // Trim long fields
    if (meta.title) meta.title = meta.title.slice(0, 200);
    if (meta.description) meta.description = meta.description.slice(0, 400);

    CACHE.set(url, { value: meta, expires: now + TTL_MS });
    // Bound cache size
    if (CACHE.size > 500) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
      CACHE.delete(oldest[0]);
    }
    return meta;
  } catch (e) {
    console.log('[linkPreview] FAIL', url, '→', e?.message);
    return null;
  }
}

module.exports = { fetchPreview, extractFirstUrl };
