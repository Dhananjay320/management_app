const router = require('express').Router();
const ApiConfig = require('../models/ApiConfig');
const { protect, requireRole } = require('../middleware/auth');
const { encrypt, decrypt, parseActivationCode, PROMPTS, callWithFallback } = require('../utils/aiAdapters');

// ══════════════════════════════════════
//  ACTIVATION & CONFIG
// ══════════════════════════════════════

// GET /api/v1/ai/config — get current AI config status (never returns key)
router.get('/config', protect, async (req, res) => {
  try {
    const config = await ApiConfig.findOne({ user: req.user._id });
    if (!config) {
      return res.json({ configured: false });
    }
    res.json({
      configured: true,
      provider: config.provider,
      isActive: config.isActive,
      expiresAt: config.expiresAt,
      activatedAt: config.activatedAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/ai/activate — activate with code
router.post('/activate', protect, async (req, res) => {
  try {
    const { activationCode } = req.body;
    if (!activationCode) return res.status(400).json({ error: 'Activation code required.' });

    const parsed = parseActivationCode(activationCode);
    if (!parsed) return res.status(400).json({ error: 'Invalid activation code format.' });

    // Check expiry — handle both YYYY-MM and YYYY-MM-DD formats
    let expiryDate = null;
    if (parsed.expiry) {
      const parts = parsed.expiry.split('-');
      if (parts.length === 2) {
        // YYYY-MM format: expire at end of that month
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10); // 1-based
        expiryDate = new Date(year, month, 0, 23, 59, 59, 999); // last day of month
      } else if (parts.length === 3) {
        // YYYY-MM-DD format: expire at end of that day
        expiryDate = new Date(parts[0], parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999);
      } else {
        expiryDate = new Date(parsed.expiry);
      }
      if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(400).json({ error: 'Activation code has expired.' });
      }
    }

    // Encrypt and store key
    const encryptedKey = encrypt(parsed.apiKey);

    await ApiConfig.findOneAndUpdate(
      { user: req.user._id },
      {
        provider: parsed.provider,
        encryptedKey,
        activationCode: activationCode.substring(0, 20) + '...', // Store truncated for reference
        expiresAt: expiryDate || undefined,
        isActive: true,
        activatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      provider: parsed.provider,
      message: `AI activated with ${parsed.provider}. You can now use AI features.`
    });
  } catch (err) {
    console.error('Activate AI error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/v1/ai/activate-direct — direct key entry (for development/testing)
router.post('/activate-direct', protect, async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and apiKey required.' });

    const encryptedKey = encrypt(apiKey);

    await ApiConfig.findOneAndUpdate(
      { user: req.user._id },
      {
        provider,
        encryptedKey,
        isActive: true,
        activatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, provider, message: `AI activated with ${provider}.` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/ai/config — deactivate
router.delete('/config', protect, async (req, res) => {
  try {
    await ApiConfig.findOneAndUpdate({ user: req.user._id }, { isActive: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ══════════════════════════════════════
//  AI FEATURES
// ══════════════════════════════════════

// POST /api/v1/ai/company-key — set company-wide AI key (main_admin only)
router.post('/company-key', protect, requireRole('main_admin'), async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and apiKey required.' });

    const encryptedKey = encrypt(apiKey);

    await ApiConfig.findOneAndUpdate(
      { type: 'company' },
      {
        type: 'company',
        provider,
        encryptedKey,
        isActive: true,
        activatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, provider, message: `Company AI key set for ${provider}.` });
  } catch (err) {
    console.error('Set company key error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/v1/ai/company-key — get company key status (main_admin only)
router.get('/company-key', protect, requireRole('main_admin'), async (req, res) => {
  try {
    const config = await ApiConfig.findOne({ type: 'company', isActive: true });
    if (!config) return res.json({ configured: false });
    res.json({ configured: true, provider: config.provider, activatedAt: config.activatedAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/v1/ai/company-key — remove company key (main_admin only)
router.delete('/company-key', protect, requireRole('main_admin'), async (req, res) => {
  try {
    await ApiConfig.findOneAndUpdate({ type: 'company' }, { isActive: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Helper: get user's AI config and decrypted key, with company fallback for high-priority features
async function getUserAI(userId, priority) {
  const config = await ApiConfig.findOne({ user: userId, isActive: true });
  if (config) {
    try {
      const apiKey = decrypt(config.encryptedKey);
      return { provider: config.provider, apiKey };
    } catch {
      // Personal key failed — fall through to company key for high priority
    }
  }

  // Fallback to company key if feature is high priority or personal key not set
  if (priority === 'high' || !config) {
    const companyConfig = await ApiConfig.findOne({ type: 'company', isActive: true });
    if (companyConfig) {
      try {
        const apiKey = decrypt(companyConfig.encryptedKey);
        return { provider: companyConfig.provider, apiKey, isCompanyKey: true };
      } catch {
        return null;
      }
    }
  }

  return null;
}

// POST /api/v1/ai/summarize — summarize chat/thread
router.post('/summarize', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required.' });

    const ai = await getUserAI(req.user._id, 'low');
    if (!ai) return res.status(400).json({ error: 'AI not configured. Go to Settings > API Configuration.' });

    const result = await callWithFallback(ai.provider, ai.apiKey, 'summarize', PROMPTS.summarize(text));
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI request failed.' });
  }
});

// POST /api/v1/ai/extract-tasks — extract tasks from MoM
router.post('/extract-tasks', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required.' });

    const ai = await getUserAI(req.user._id, 'high');
    if (!ai) return res.status(400).json({ error: 'AI not configured. Go to Settings > API Configuration.' });

    const result = await callWithFallback(ai.provider, ai.apiKey, 'extractTasks', PROMPTS.extractTasks(text));

    // Try to parse JSON array from response
    let tasks = [];
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) tasks = JSON.parse(jsonMatch[0]);
    } catch {
      tasks = [{ title: 'Review AI output', description: result }];
    }

    res.json({ tasks, raw: result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI request failed.' });
  }
});

// POST /api/v1/ai/draft-email — draft email from one-liner
router.post('/draft-email', protect, async (req, res) => {
  try {
    const { oneLiner } = req.body;
    if (!oneLiner) return res.status(400).json({ error: 'One-liner required.' });

    const ai = await getUserAI(req.user._id, 'low');
    if (!ai) return res.status(400).json({ error: 'AI not configured. Go to Settings > API Configuration.' });

    const result = await callWithFallback(ai.provider, ai.apiKey, 'draftEmail', PROMPTS.draftEmail(oneLiner));

    // Try to parse JSON
    let draft = { subject: '', body: result };
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) draft = JSON.parse(jsonMatch[0]);
    } catch {}

    res.json({ draft, raw: result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI request failed.' });
  }
});

// POST /api/v1/ai/format-mom — format raw notes into structured MoM
router.post('/format-mom', protect, async (req, res) => {
  try {
    const { rawNotes } = req.body;
    if (!rawNotes) return res.status(400).json({ error: 'Raw notes required.' });

    const ai = await getUserAI(req.user._id, 'high');
    if (!ai) return res.status(400).json({ error: 'AI not configured. Go to Settings > API Configuration.' });

    const result = await callWithFallback(ai.provider, ai.apiKey, 'formatMoM', PROMPTS.formatMoM(rawNotes));
    res.json({ formatted: result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI request failed.' });
  }
});

// POST /api/v1/ai/meeting-summary — generate meeting summary
router.post('/meeting-summary', protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required.' });

    const ai = await getUserAI(req.user._id, 'high');
    if (!ai) return res.status(400).json({ error: 'AI not configured. Go to Settings > API Configuration.' });

    const result = await callWithFallback(ai.provider, ai.apiKey, 'generateMeetingSummary', PROMPTS.generateMeetingSummary(content));
    res.json({ summary: result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI request failed.' });
  }
});

module.exports = router;
