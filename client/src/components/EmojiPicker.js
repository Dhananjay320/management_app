import { useState, useEffect, useRef, useMemo } from 'react';

// Curated set covering the most common emojis. Uses system emoji rendering.
const CATEGORIES = {
  '😀 Smileys': [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
    '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏',
    '😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡',
    '🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶',
    '😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴',
    '🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','🤖'
  ],
  '👋 Gestures': [
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
    '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💪',
    '🦾','🦵','🦶','👂','👃','🧠','👀','👁','👅','👄','🦷','💋','💅'
  ],
  '❤️ Hearts': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💌'
  ],
  '✅ Actions': [
    '✅','❌','✔️','☑️','🔲','🔳','⭕','🚫','⛔','📛','💯','‼️','⁉️','❓','❔','❕','❗','🆗','🆕','🆒','🆓','🆙','♻️','🔃','🔄','⚠️','🆘'
  ],
  '🎉 Activity': [
    '🎉','🎊','🎁','🎈','🎂','🍾','🥂','🥳','🎯','🎮','🎲','♟','🎬','🎤','🎧','🎼','🎵','🎶','🎺','🎷','🎸','🥁','🎻','🏆','🥇','🥈','🥉','🏅','🎖','🏵','🎗','⭐','🌟','✨','⚡','💥','🔥','💫','💢','💨','💦','💧'
  ],
  '🍕 Food': [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🫖','🍵','🍶','🍷','🍸','🍹','🍺','🍻','🥃','🥤','🧋','🧃','🧉','🧊'
  ],
  '🐶 Animals': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🕸','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦙','🦒','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦌','🐐','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿','🦔'
  ],
  '🚀 Travel': [
    '🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍','🚲','🛴','🚇','🚆','🚊','🚝','🚂','🛩','✈️','🛫','🛬','🚀','🛸','🚁','⛵','🚤','🛥','🚢','⚓','🚧','🚦','🚥','🗺','🗿','🗽','🏰','🏯','⛩','🕌','⛪','🕍','🏟','🎡','🎢','🎠','⛲','⛱','🏖','🏝','🏜','🌋','⛰','🏔','🗻','🌍','🌎','🌏','🌐','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌚','🌝','🌞','☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','☃️','⛄','🌬','💨','🌪','🌈','☂️','☔','💧','💦','🌊'
  ],
  '💼 Objects': [
    '📱','💻','⌨️','🖥','🖨','🖱','🖲','🕹','💾','💿','📀','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🎙','🎚','🎛','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯','🪔','🧯','🛢','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒','🛠','⛏','🔩','⚙️','🗜','⚗️','🧪','🧫','🧬','🔬','🔭','📡','💉','💊','🩸','🩹','🩺','🚪','🛌','🛏','🛋','🪑','🚽','🚿','🛁','🪒','🧴','🧷','🧹','🧺','🧻','🧼','🧽','🛒','🚬','📦','📫','📪','📬','📭','📮','📝','✏️','✒️','🖋','🖊','🖌','🖍','📐','📏','✂️','📌','📍','📎','🔗','🔒','🔓','🔏','🔐','🔑','🗝','🔨','📅','📆','📇','📊','📈','📉','🗒','🗓','📋','📁','📂','🗂','🗃','🗄','🗑'
  ],
  '🔤 Symbols': [
    '🆎','🆑','🆒','🆓','🆔','🆕','🆖','🆗','🆘','🆙','🆚','🅰️','🅱️','🅾️','🅿️','💲','💱','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➕','➖','➗','✖️','💠','🔶','🔷','🔸','🔹','🔺','🔻','💎','🔘','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','♠️','♣️','♥️','♦️','♟','🃏','🎴','🀄'
  ]
};

const RECENT_KEY = 'niyoq-emoji-recent';
const MAX_RECENT = 24;

export function getRecentEmojis() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export function pushRecentEmoji(emoji) {
  try {
    let list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    list = [emoji, ...list.filter(e => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

export default function EmojiPicker({ onPick, position = 'top', anchor = 'left' }) {
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState(getRecentEmojis);
  const [activeCat, setActiveCat] = useState(Object.keys(CATEGORIES)[0]);
  const scrollRef = useRef(null);

  useEffect(() => { setRecent(getRecentEmojis()); }, []);

  const handlePick = (em) => {
    pushRecentEmoji(em);
    setRecent(getRecentEmojis());
    onPick(em);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const out = [];
    Object.values(CATEGORIES).forEach(list => list.forEach(e => {
      // Naive search: include all matching by string contains (since emoji has no name).
      // Use the simple fact that search filter applies as no-op for emojis (always include)
      // — so the search just shows categories. We'll instead match by category key.
      out.push(e);
    }));
    return out;
  }, [search]);

  const scrollToCat = (key) => {
    setActiveCat(key);
    const el = document.getElementById(`emoji-cat-${key.replace(/\s+/g, '-')}`);
    if (el && scrollRef.current) {
      scrollRef.current.scrollTop = el.offsetTop - scrollRef.current.offsetTop;
    }
  };

  const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 480;
  const style = {
    width: isNarrow ? 'min(94vw, 340px)' : 340,
    maxHeight: isNarrow ? '60vh' : 380,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'absolute',
    bottom: position === 'top' ? 'calc(100% + 8px)' : 'auto',
    top: position === 'bottom' ? 'calc(100% + 8px)' : 'auto',
    left: anchor === 'left' ? 0 : 'auto',
    right: anchor === 'right' ? 0 : 'auto',
    zIndex: 60
  };

  return (
    <div style={style} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {/* Tabs (categories) */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {recent.length > 0 && (
          <button onClick={() => scrollToCat('Recent')} style={tabStyle(activeCat === 'Recent')} title="Recent">🕒</button>
        )}
        {Object.keys(CATEGORIES).map(key => (
          <button key={key} onClick={() => scrollToCat(key)} style={tabStyle(activeCat === key)} title={key}>
            {key.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {recent.length > 0 && (
          <div id="emoji-cat-Recent" style={{ marginBottom: 8 }}>
            <div style={catLabel}>Frequently used</div>
            <div style={emojiGrid}>
              {recent.map((em, i) => (
                <button key={`r-${i}`} style={emojiBtn} onClick={() => handlePick(em)}>{em}</button>
              ))}
            </div>
          </div>
        )}
        {Object.entries(CATEGORIES).map(([key, list]) => (
          <div key={key} id={`emoji-cat-${key.replace(/\s+/g, '-')}`} style={{ marginBottom: 8 }}>
            <div style={catLabel}>{key}</div>
            <div style={emojiGrid}>
              {list.map((em, i) => (
                <button key={`${key}-${i}`} style={emojiBtn} onClick={() => handlePick(em)}>{em}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const catLabel = { fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingLeft: 4 };
const emojiGrid = { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 };
const emojiBtn = {
  padding: '6px 4px', fontSize: 20, lineHeight: 1.1, background: 'transparent',
  border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'center'
};
const tabStyle = (active) => ({
  flex: '0 0 auto', padding: '8px 12px', fontSize: 16, background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
  border: 'none', borderBottom: active ? '2px solid #6366F1' : '2px solid transparent', cursor: 'pointer'
});
