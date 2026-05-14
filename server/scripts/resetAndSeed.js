#!/usr/bin/env node
//
// DESTRUCTIVE — wipes the ENTIRE MongoDB database and seeds it with:
//   1. A new system account (_c=true, main_admin) — obscure email so nobody
//      hits it by accident. Email + password printed once to stdout.
//   2. Rajesh as Main Admin — email rajesh@niyoq.com, password ojas@2026.
//
// Usage (from server/ directory):
//   node scripts/resetAndSeed.js                # interactive: must type DB name to confirm
//   node scripts/resetAndSeed.js --yes          # skip confirmation
//   node scripts/resetAndSeed.js --rajesh-email someone@x.com --rajesh-password 'XYZ!2'
//
// IMPORTANT: stop the backend before running so it doesn't fight us:
//   pm2 stop niyoq
//   node scripts/resetAndSeed.js
//   pm2 start niyoq
//

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require(path.join(__dirname, '..', 'models', 'User'));

function parseArgs(argv) {
  const out = { flags: {}, bool: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out.bool[key] = true;
    } else {
      out.flags[key] = next;
      i++;
    }
  }
  return out;
}

function ask(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => resolve(String(data).trim()));
  });
}

function genSysEmail() {
  const tail = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  return `sysroot.${tail}@niyoq.internal`;
}

function genStrongPassword() {
  return 'Sys' + crypto.randomBytes(6).toString('hex') + '!9';
}

(async function main() {
  const args = parseArgs(process.argv);
  const skipPrompt = !!args.bool.yes;
  const rajeshEmail = (args.flags['rajesh-email'] || 'rajesh@niyoq.com').toLowerCase().trim();
  const rajeshPassword = args.flags['rajesh-password'] || 'ojas@2026';

  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set. Run from server/ directory.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    const collections = await db.collections();

    console.log('');
    console.log('================================================================');
    console.log('  WIPE AND SEED — destructive');
    console.log('================================================================');
    console.log(`  Database  : ${dbName}`);
    console.log(`  URI       : ${process.env.MONGODB_URI}`);
    console.log(`  Will drop : ${collections.length} collection(s)`);
    if (collections.length > 0) {
      console.log('              ' + collections.map(c => c.collectionName).join(', '));
    }
    console.log('');
    console.log('  After wipe, will create:');
    console.log(`    - SYSTEM (dev panel) account with random email`);
    console.log(`    - MAIN ADMIN: ${rajeshEmail} (Rajesh, COO)`);
    console.log('================================================================');
    console.log('');

    if (!skipPrompt) {
      const answer = await ask(`Type the database name (${dbName}) to confirm wipe: `);
      if (answer !== dbName) {
        console.log('');
        console.log('Aborted — confirmation did not match. Nothing was changed.');
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // Drop every collection
    let dropped = 0;
    for (const c of collections) {
      try {
        await c.drop();
        dropped++;
      } catch (e) {
        // 26 = NamespaceNotFound (already gone) — ignore
        if (e.code !== 26) {
          console.warn(`  warn: could not drop ${c.collectionName}: ${e.message}`);
        }
      }
    }
    console.log(`[ok] Dropped ${dropped} collection(s).`);

    // Reconnect to ensure clean schema state
    await mongoose.disconnect();
    await mongoose.connect(process.env.MONGODB_URI);

    // ── System account ─────────────────────────────────────
    const sysEmail = genSysEmail();
    const sysPassword = genStrongPassword();
    await User.create({
      name: 'System',
      email: sysEmail,
      password: sysPassword,
      role: 'main_admin',
      _c: true,
      jobTitle: 'System Administrator',
      workType: 'full_remote',
      isFirstLogin: false,
      onboardingComplete: true,
      isActive: true
    });

    // ── Rajesh ─────────────────────────────────────────────
    await User.create({
      employeeId: 'AVD-001',
      name: 'Rajesh',
      email: rajeshEmail,
      password: rajeshPassword,
      role: 'main_admin',
      jobTitle: 'COO',
      workType: 'full_office',
      isFirstLogin: false,
      onboardingComplete: true,
      isActive: true,
      dateOfJoining: new Date()
    });

    console.log('');
    console.log('================================================================');
    console.log('  RESET COMPLETE');
    console.log('================================================================');
    console.log('  SYSTEM (dev panel /sys) — keep these credentials private:');
    console.log(`    Email    : ${sysEmail}`);
    console.log(`    Password : ${sysPassword}`);
    console.log('');
    console.log('  MAIN ADMIN (Rajesh — main login):');
    console.log(`    Email    : ${rajeshEmail}`);
    console.log(`    Password : ${rajeshPassword}`);
    console.log('================================================================');
    console.log('');
    console.log('Save the SYSTEM credentials NOW — the password cannot be recovered.');
    console.log('Rajesh can change his password from Profile -> Change Password.');
    console.log('');
    console.log('If the backend was stopped, restart it now:  pm2 start niyoq');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
})();
