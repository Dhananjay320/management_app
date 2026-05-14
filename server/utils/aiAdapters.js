const crypto = require('crypto');

// ═══════════════════════════════════════
//  ENCRYPTION — for storing API keys
// ═══════════════════════════════════════

let AI_ENABLED = true;
if (!process.env.AI_MASTER_SECRET || process.env.AI_MASTER_SECRET.length < 16) {
  console.warn('[AI WARNING] AI_MASTER_SECRET env var is missing or shorter than 16 chars. AI encryption features will be disabled.');
  AI_ENABLED = false;
}
const MASTER_SECRET = process.env.AI_MASTER_SECRET || null;
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!AI_ENABLED) throw new Error('AI features are disabled — AI_MASTER_SECRET not configured.');
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(MASTER_SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  if (!AI_ENABLED) throw new Error('AI features are disabled — AI_MASTER_SECRET not configured.');
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

function parseActivationCode(code) {
  // Format: PROVIDER:ENCRYPTED_KEY:EXPIRY:CHECKSUM
  const parts = code.split(':');
  if (parts.length < 4) return null;

  const provider = parts[0].toLowerCase();
  const apiKey = parts.slice(1, -2).join(':'); // Key might contain colons
  const expiry = parts[parts.length - 2];
  const checksum = parts[parts.length - 1];

  if (!['gemini', 'openai', 'claude'].includes(provider)) return null;

  // For demo: simple validation (in production: HMAC checksum with MASTER_SECRET)
  return { provider, apiKey, expiry, checksum };
}

// ═══════════════════════════════════════
//  PROVIDER ADAPTERS
// ═══════════════════════════════════════

// Prompts for each AI feature
const PROMPTS = {
  summarize: (text) => `You are a professional conversation analyst. Summarize the following chat messages.

IMPORTANT RULES:
- Messages are numbered [1], [2], etc. in CHRONOLOGICAL order (earliest first)
- Each message shows: [number] SenderName (time): message content
- Some messages may have been selected from a larger conversation — there might be gaps. Focus only on what's provided.
- Identify the main topics discussed, key decisions, and any action items
- Group related points together even if they were discussed at different times
- Use clear, concise bullet points

OUTPUT FORMAT:
**Summary**
• [Main point 1]
• [Main point 2]
• [Main point 3]

**Key Decisions** (if any)
• [Decision]

**Action Items** (if any)
• [Who] → [What they need to do]

CONVERSATION:
${text}`,

  extractTasks: (text) => `You are a task extraction assistant. Analyze the following meeting notes carefully and extract ALL actionable tasks.

For each task found, provide:
- title: A clear, actionable title (start with a verb: "Create...", "Review...", "Send...", "Update...")
- description: Brief context explaining what needs to be done
- priority: "high", "medium", or "low" based on urgency/importance mentioned
- deadline: If any date/timeframe is mentioned (format: YYYY-MM-DD), otherwise empty string
- assignee: If a person's name is mentioned as responsible, include it, otherwise empty string

RULES:
- Extract EVERY possible action item, even implicit ones
- If someone says "I'll do X" or "Let's do Y" — that's a task
- If a decision was made that requires follow-up — that's a task
- Be specific in titles — "Update the API docs" not just "Update docs"

Return ONLY a valid JSON array, no other text:
[{"title": "...", "description": "...", "priority": "...", "deadline": "...", "assignee": "..."}, ...]

MEETING NOTES:
${text}`,

  draftEmail: (oneLiner) => `Write a professional business email based on this brief description.

RULES:
- Keep it concise but complete
- Use a professional but warm tone
- Include a clear subject line
- Structure: greeting, main point, any needed details, closing
- Don't be overly formal or use outdated phrases like "I hope this email finds you well"

Request: ${oneLiner}

Return as JSON only: {"subject": "...", "body": "..."}`,

  formatMoM: (rawNotes) => `Format these raw meeting notes into a clean, professional Minutes of Meeting document.

STRUCTURE:
1. **Key Discussion Points** — Bulleted list of main topics discussed
2. **Decisions Made** — Clear list of what was decided
3. **Action Items** — Table format: Who | What | Deadline (if mentioned)
4. **Notes** — Any other important information

RULES:
- Be concise but don't lose important details
- Group related points together
- Use clear, professional language
- If action items mention people, list them by name

RAW NOTES:
${rawNotes}`,

  generateMeetingSummary: (content) => `Generate a professional meeting summary from the following content.

OUTPUT FORMAT:
**Meeting Purpose**: [One sentence]

**Key Points Discussed**:
• [Point 1]
• [Point 2]
• [Point 3]

**Decisions Made**:
• [Decision 1]

**Action Items**:
• [Person] → [Task] (by [date] if mentioned)

**Next Steps**:
• [What happens next]

RULES:
- Be concise — max 200 words total
- Focus on outcomes, not process
- Highlight disagreements or concerns if any

Content:
${content}`
};

// ─── Gemini Adapter — tries multiple models as fallback ───
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite'];

async function callGemini(apiKey, prompt) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      const err = await response.json().catch(() => ({}));
      const status = response.status;

      // 403 = bad key, don't retry other models
      if (status === 403) throw new Error(err.error?.message || 'Gemini API key invalid or forbidden. Check your key in Settings.');
      // 404 = model not found, try next
      if (status === 404) { lastError = `Model ${model} not available`; continue; }
      // 429 = quota hit, try next model (might have separate quota)
      if (status === 429) { lastError = err.error?.message || 'Rate limit exceeded'; continue; }
      // 503 = overloaded, try next
      if (status === 503) { lastError = `${model} overloaded`; continue; }

      throw new Error(err.error?.message || `Gemini error ${status}`);
    } catch (e) {
      if (e.message?.includes('forbidden') || e.message?.includes('invalid')) throw e;
      lastError = e.message || String(e);
    }
  }

  // All models failed
  throw { quotaExceeded: true, status: 429, message: `Gemini API unavailable — all models exhausted. ${lastError || 'Check your API key quota at ai.google.dev. You may need to generate a new key or enable billing.'}` };
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
    if (response.status === 429) throw { quotaExceeded: true, status: 429, message: 'OpenAI rate limit exceeded. Wait a moment and try again.' };
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
    if (status === 429 || status === 529) throw { quotaExceeded: true, status, message: `Claude API ${status === 429 ? 'rate limit' : 'overloaded'}. Try again in a moment.` };
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
      throw new Error(err.message || 'AI quota exceeded. Wait a few minutes or check your API plan at ai.google.dev.');
    }
    throw err;
  }
}

module.exports = {
  encrypt, decrypt, parseActivationCode,
  PROMPTS, callAI, callWithFallback
};
