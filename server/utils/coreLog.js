const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '.core.log.enc');
const ALG = 'aes-256-cbc';
const KEY = crypto.scryptSync(process.env.JWT_ACCESS_SECRET || 'avadeti_core', 'salt', 32);

function enc(text) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv(ALG, KEY, iv);
  let e = c.update(text, 'utf8', 'hex');
  e += c.final('hex');
  return iv.toString('hex') + ':' + e;
}

function dec(data) {
  const [ivH, e] = data.split(':');
  const iv = Buffer.from(ivH, 'hex');
  const d = crypto.createDecipheriv(ALG, KEY, iv);
  let t = d.update(e, 'hex', 'utf8');
  t += d.final('utf8');
  return t;
}

function log(action, detail, userId) {
  const entry = enc(JSON.stringify({
    ts: new Date().toISOString(),
    action,
    detail,
    uid: userId
  }));
  fs.appendFileSync(LOG_PATH, entry + '\n');
}

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map(line => {
    try { return JSON.parse(dec(line)); } catch { return null; }
  }).filter(Boolean);
}

function clearLog() {
  if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
}

module.exports = { log, readLog, clearLog };
