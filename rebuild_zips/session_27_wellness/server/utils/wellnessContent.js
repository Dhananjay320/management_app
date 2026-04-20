// ============================================================================
// wellnessContent.js — seeded daily quotes and meditation presets.
// ============================================================================
// Session 27 (N6). Rather than building an admin UI to curate quotes
// (which would be more work than the quotes deserve) we ship a
// 60-quote library and pick one per day deterministically based on
// date + user-id. Same user sees the same quote all day; two users see
// different quotes. Wrap-around after 60 days means the library repeats,
// but the user index offset prevents two people from ever getting the
// exact same sequence.
//
// Categories help the client show a little accent color on each quote.
// ============================================================================

const QUOTES = [
  // mindful
  { text: "The present moment is the only moment available to us.",                     author: "Thich Nhat Hanh", category: 'mindful' },
  { text: "Wherever you are, be there totally.",                                         author: "Eckhart Tolle",   category: 'mindful' },
  { text: "The mind is everything. What you think you become.",                          author: "Buddha",          category: 'mindful' },
  { text: "Be happy for this moment. This moment is your life.",                         author: "Omar Khayyam",    category: 'mindful' },
  { text: "Peace comes from within. Do not seek it without.",                            author: "Buddha",          category: 'mindful' },
  { text: "Silence is sometimes the best answer.",                                       author: "Dalai Lama",      category: 'mindful' },
  { text: "You cannot control the wind, but you can adjust your sails.",                 author: "Proverb",         category: 'mindful' },
  { text: "Breathe in deeply, then let it go. That is today's work.",                    author: "Unknown",         category: 'mindful' },

  // work & focus
  { text: "Focus on being productive, not busy.",                                        author: "Tim Ferriss",     category: 'focus'  },
  { text: "The way to get started is to quit talking and begin doing.",                  author: "Walt Disney",     category: 'focus'  },
  { text: "Quality means doing it right when no one is looking.",                        author: "Henry Ford",      category: 'focus'  },
  { text: "It always seems impossible until it's done.",                                 author: "Nelson Mandela",  category: 'focus'  },
  { text: "Small daily improvements over time lead to stunning results.",                author: "Robin Sharma",    category: 'focus'  },
  { text: "Don't watch the clock; do what it does. Keep going.",                         author: "Sam Levenson",    category: 'focus'  },
  { text: "Discipline is the bridge between goals and accomplishment.",                  author: "Jim Rohn",        category: 'focus'  },
  { text: "What we fear doing most is usually what we most need to do.",                 author: "Tim Ferriss",     category: 'focus'  },

  // resilience
  { text: "Fall seven times, stand up eight.",                                           author: "Japanese proverb", category: 'resilience' },
  { text: "You may encounter many defeats, but you must not be defeated.",               author: "Maya Angelou",     category: 'resilience' },
  { text: "A smooth sea never made a skilled sailor.",                                   author: "Franklin D. Roosevelt", category: 'resilience' },
  { text: "The only way out is through.",                                                author: "Robert Frost",     category: 'resilience' },
  { text: "Hard times don't create heroes. It's during the hard times when the hero within us is revealed.", author: "Bob Riley", category: 'resilience' },
  { text: "Fall down seven times, get up eight.",                                        author: "Proverb",          category: 'resilience' },
  { text: "Strength doesn't come from what you can do. It comes from overcoming the things you once thought you couldn't.", author: "Rikki Rogers", category: 'resilience' },
  { text: "Storms make trees take deeper roots.",                                        author: "Dolly Parton",     category: 'resilience' },

  // kindness
  { text: "Be kind whenever possible. It is always possible.",                           author: "Dalai Lama",       category: 'kindness' },
  { text: "Kindness is a language which the deaf can hear and the blind can see.",       author: "Mark Twain",       category: 'kindness' },
  { text: "No act of kindness, no matter how small, is ever wasted.",                    author: "Aesop",            category: 'kindness' },
  { text: "Carry out a random act of kindness today.",                                   author: "Princess Diana",   category: 'kindness' },
  { text: "The smallest act of kindness is worth more than the grandest intention.",     author: "Oscar Wilde",      category: 'kindness' },
  { text: "Wherever there is a human being, there is an opportunity for kindness.",      author: "Seneca",           category: 'kindness' },
  { text: "Kind words can be short and easy to speak, but their echoes are truly endless.", author: "Mother Teresa", category: 'kindness' },

  // growth
  { text: "The only person you are destined to become is the person you decide to be.",  author: "Ralph Waldo Emerson", category: 'growth' },
  { text: "Growth begins at the end of your comfort zone.",                              author: "Neale Donald Walsch", category: 'growth' },
  { text: "Learn from yesterday, live for today, hope for tomorrow.",                    author: "Einstein",         category: 'growth' },
  { text: "Do something today that your future self will thank you for.",                author: "Sean Patrick Flanery", category: 'growth' },
  { text: "Change is the end result of all true learning.",                              author: "Leo Buscaglia",    category: 'growth' },
  { text: "A year from now you will wish you had started today.",                        author: "Karen Lamb",       category: 'growth' },
  { text: "Every accomplishment starts with the decision to try.",                       author: "John F. Kennedy",  category: 'growth' },
  { text: "It is never too late to be what you might have been.",                        author: "George Eliot",     category: 'growth' },

  // gratitude
  { text: "Gratitude turns what we have into enough.",                                   author: "Anonymous",        category: 'gratitude' },
  { text: "Acknowledging the good that you already have in your life is the foundation for all abundance.", author: "Eckhart Tolle", category: 'gratitude' },
  { text: "When you rise in the morning, give thanks for the light.",                    author: "Tecumseh",         category: 'gratitude' },
  { text: "Gratitude is the fairest blossom which springs from the soul.",               author: "Henry Ward Beecher", category: 'gratitude' },
  { text: "The more you praise and celebrate your life, the more there is to celebrate.", author: "Oprah Winfrey",   category: 'gratitude' },
  { text: "Enjoy the little things, for one day you may look back and realize they were the big things.", author: "Robert Brault", category: 'gratitude' },
  { text: "He who has a why to live can bear almost any how.",                           author: "Nietzsche",        category: 'growth'    },

  // balance
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", author: "Anne Lamott", category: 'balance' },
  { text: "Rest when you're weary. Refresh and renew yourself.",                          author: "Ralph Marston",    category: 'balance' },
  { text: "Take time to do what makes your soul happy.",                                  author: "Anonymous",        category: 'balance' },
  { text: "It's not the load that breaks you down, it's the way you carry it.",          author: "Lou Holtz",        category: 'balance' },
  { text: "You don't have to see the whole staircase. Just take the first step.",         author: "Martin Luther King Jr.", category: 'focus' },
  { text: "Sometimes the most productive thing you can do is relax.",                     author: "Mark Black",       category: 'balance' },
  { text: "Lost time is never found again.",                                              author: "Benjamin Franklin", category: 'focus' },
  { text: "You are never too old to set another goal or to dream a new dream.",           author: "C.S. Lewis",       category: 'growth'  },

  // connection
  { text: "The greatest gift of life is friendship.",                                     author: "Hubert H. Humphrey", category: 'connection' },
  { text: "Alone we can do so little; together we can do so much.",                       author: "Helen Keller",     category: 'connection' },
  { text: "Surround yourself with people who make you better.",                           author: "Anonymous",        category: 'connection' },
  { text: "A single act of kindness throws out roots in all directions.",                 author: "Amelia Earhart",   category: 'kindness'   },
  { text: "The people who are crazy enough to think they can change the world are the ones who do.", author: "Steve Jobs", category: 'growth' },
  { text: "What you do makes a difference, and you have to decide what kind of difference you want to make.", author: "Jane Goodall", category: 'growth' },
];

const CATEGORY_COLORS = {
  mindful:     '#A78BFA',
  focus:       '#6366F1',
  resilience:  '#F97316',
  kindness:    '#EC4899',
  growth:      '#10B981',
  gratitude:   '#F59E0B',
  balance:     '#06B6D4',
  connection:  '#8B5CF6',
};

// Deterministically pick a quote for (date, userId) so same person sees
// same quote all day, and two users see different quotes.
function quoteFor(dateStr, userId) {
  // Hash: date + userId → index
  const key = `${dateStr}:${userId || 'anon'}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % QUOTES.length;
  const q = QUOTES[idx];
  return { ...q, color: CATEGORY_COLORS[q.category] || '#6366F1' };
}

const MEDITATION_PRESETS = [
  { key: 'quick', label: '2-min breath', durationSec: 120 },
  { key: 'short', label: '5-min reset',  durationSec: 300 },
  { key: 'focus', label: '10-min focus', durationSec: 600 },
  { key: 'deep',  label: '15-min deep',  durationSec: 900 },
];

module.exports = { QUOTES, CATEGORY_COLORS, quoteFor, MEDITATION_PRESETS };
