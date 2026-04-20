const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════
// Session 4 security fixes applied in this file:
//   S9  — Remove default MASTER_SECRET fallback. If AI_MASTER_SECRET is not
//         set in the environment, fail loudly at startup rather than using a
//         known hardcoded string that lets anyone with source access decrypt
//         stored API keys.
//   S10 — Robust activation expiry parsing. Previously "YYYY-MM-DD" produced
//         "Invalid Date" which silently bypassed the expiry check. Now we
//         accept both "YYYY-MM" and "YYYY-MM-DD", validate the parse, and
//         reject codes whose expiry can't be parsed.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════
//  ENCRYPTION — for storing API keys
// ═══════════════════════════════════════

const MASTER_SECRET = process.env.AI_MASTER_SECRET;
// S9: fail hard at import time if the secret isn't configured.
// Do NOT silently fall back to a known default — that defeats encryption.
if (!MASTER_SECRET || MASTER_SECRET.length < 16) {
  // Throwing here prevents the server from ever starting with insecure key storage.
  // Operators must set AI_MASTER_SECRET (at least 16 chars) in their environment.
  console.error('[FATAL] AI_MASTER_SECRET env var is missing or too short (<16 chars).');
  console.error('        Encryption of stored AI API keys would be insecure.');
  console.error('        Set AI_MASTER_SECRET to a strong random string and restart.');
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('AI_MASTER_SECRET not configured');
  }
}

const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(MASTER_SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(MASTER_SECRET, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ═══════════════════════════════════════
//  ACTIVATION CODE — parse & validate
// ═══════════════════════════════════════

// S10: parse expiry robustly. Accepts "YYYY-MM" or "YYYY-MM-DD".
// Returns a Date object, or null if unparseable.
function parseExpiry(expiryStr) {
  if (!expiryStr) return null;
  const trimmed = String(expiryStr).trim();
  // YYYY-MM -> last day of that month (end-of-month semantics)
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [y, m] = trimmed.split('-').map(Number);
    // new Date(y, m, 0) -> last day of month m (1-indexed)
    const d = new Date(y, m, 0, 23, 59, 59, 999);
    return isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split('-').map(Number);
    const d = new Date(y, m - 1, day, 23, 59, 59, 999);
    return isNaN(d.getTime()) ? null : d;
  }
  // Full ISO 8601
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function parseActivationCode(code) {
  // Format: PROVIDER:ENCRYPTED_KEY:EXPIRY:CHECKSUM
  const parts = code.split(':');
  if (parts.length < 4) return null;

  const provider = parts[0].toLowerCase();
  const apiKey = parts.slice(1, -2).join(':'); // Key might contain colons
  const expiry = parts[parts.length - 2];
  const checksum = parts[parts.length - 1];

  if (!['gemini', 'openai', 'claude'].includes(provider)) return null;
  if (!apiKey || apiKey.length < 8) return null;

  // S10: parse + validate expiry date so we can't silently bypass the check.
  const expiryDate = parseExpiry(expiry);
  if (!expiryDate) return null;  // unparseable expiry = reject

  // Checksum verification is a no-op until HMAC is wired (future work).
  // For now require checksum to be present and non-empty.
  if (!checksum) return null;

  return { provider, apiKey, expiry, expiryDate, checksum };
}

// ═══════════════════════════════════════
//  PROVIDER ADAPTERS
// ═══════════════════════════════════════

// Prompts for each AI feature
const PROMPTS = {
  summarize: (text) => `Summarize the following conversation or text concisely in 3-5 bullet points:\n\n${text}`,

  extractTasks: (text) => `Read the following meeting notes and extract all possible tasks. For each task, provide:
- Title (short action item)
- Description (brief context)

Return as JSON array: [{"title": "...", "description": "..."}, ...]

Meeting notes:
${text}`,

  draftEmail: (oneLiner) => `Write a professional email based on this one-line request. Include a subject line and body. Be concise and professional.

Request: ${oneLiner}

Return as JSON: {"subject": "...", "body": "..."}`,

  formatMoM: (rawNotes) => `Format the following raw meeting notes into a clean, structured Minutes of Meeting document with:
- Key Discussion Points (bulleted)
- Decisions Made
- Action Items (if any mentioned)

Raw notes:
${rawNotes}`,

  generateMeetingSummary: (content) => `Generate a concise meeting summary from the following meeting notes and chat content. Include:
- Meeting Purpose
- Key Points Discussed (3-5 bullets)
- Decisions Made
- Next Steps

Content:
${content}`
};

// ─── Gemini Adapter ───
async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const status = response.status;
    if (status === 429 || status === 403) throw { quotaExceeded: true, status };
    throw new Error(err.error?.message || `Gemini error ${status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── OpenAI Adapter ───
async function callOpenAI(apiKey, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 429) throw { quotaExceeded: true, status: 429 };
    throw new Error(err.error?.message || `OpenAI error ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Claude Adapter ───
async function callClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 529) throw { quotaExceeded: true, status };
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude error ${status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ─── Provider Router ───
const ADAPTERS = {
  gemini: callGemini,
  openai: callOpenAI,
  claude: callClaude
};

async function callAI(provider, apiKey, prompt) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown provider: ${provider}`);
  return adapter(apiKey, prompt);
}

// ═══════════════════════════════════════
//  FALLBACK MANAGER
// ═══════════════════════════════════════

// High priority features use company fallback key on quota exhaustion
const HIGH_PRIORITY_FEATURES = ['extractTasks', 'formatMoM', 'generateMeetingSummary'];

async function callWithFallback(provider, userKey, feature, prompt) {
  try {
    return await callAI(provider, userKey, prompt);
  } catch (err) {
    if (err.quotaExceeded && HIGH_PRIORITY_FEATURES.includes(feature)) {
      // Try company fallback key
      const fallbackKey = process.env.AI_COMPANY_FALLBACK_KEY;
      const fallbackProvider = process.env.AI_COMPANY_FALLBACK_PROVIDER || 'gemini';
      if (fallbackKey) {
        try {
          console.log(`AI fallback: using company key for ${feature}`);
          return await callAI(fallbackProvider, fallbackKey, prompt);
        } catch (fallbackErr) {
          throw new Error('AI unavailable — please try again later.');
        }
      }
    }

    if (err.quotaExceeded) {
      throw new Error('Your AI quota is exhausted. Try again tomorrow.');
    }
    throw err;
  }
}

module.exports = {
  encrypt, decrypt, parseActivationCode,
  PROMPTS, callAI, callWithFallback
};
