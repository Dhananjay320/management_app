#!/usr/bin/env node
//
// DEVELOPER RESET — refreshes the system (dev panel) account ONLY.
// Does NOT touch users, channels, tasks, attendance, salary, or any other data.
//
// What it does:
//   1. Deactivates every existing system account (any user with _c=true)
//   2. Creates a NEW system account with a random obscure email and strong password
//   3. Prints the new credentials once
//
// Use this when you've lost the system password or rotated developer access.
// To wipe the entire database, use resetAndSeed.js instead.
//
// Usage (from server/ directory):
//   node scripts/resetSystem.js               # interactive — type YES to confirm
//   node scripts/resetSystem.js --yes         # skip confirmation
//   node scripts/resetSystem.js --keep-others # do NOT deactivate prior system accounts
//   node scripts/resetSystem.js --email 'sysroot.foo@niyoq.internal' --password 'X!1'
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
  const keepOthers = !!args.bool['keep-others'];
  const customEmail = args.flags.email ? String(args.flags.email).toLowerCase().trim() : null;
  const customPassword = args.flags.password || null;

  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set. Run from server/ directory.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[ok] Connected to ${process.env.MONGODB_URI}`);

    const existing = await User.find({ _c: true, isActive: true }).select('email').sort({ createdAt: 1 });

    console.log('');
    console.log('================================================================');
    console.log('  DEVELOPER RESET — system account only');
    console.log('================================================================');
    if (existing.length === 0) {
      console.log('  No active system accounts found.');
    } else {
      console.log(`  ${existing.length} active system account(s) found:`);
      existing.forEach(u => console.log(`    - ${u.email}`));
      console.log(keepOthers
        ? '  These will be LEFT UNTOUCHED (--keep-others).'
        : '  These will be DEACTIVATED (set isActive=false).');
    }
    console.log('');
    console.log('  A new system account will be created.');
    console.log('  All other data (users, tasks, etc) is left alone.');
    console.log('================================================================');
    console.log('');

    if (!skipPrompt) {
      const answer = await ask('Type YES to confirm: ');
      if (answer !== 'YES') {
        console.log('Aborted — nothing changed.');
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // Deactivate prior system accounts
    if (!keepOthers && existing.length > 0) {
      const r = await User.updateMany({ _c: true, isActive: true }, { $set: { isActive: false } });
      console.log(`[ok] Deactivated ${r.modifiedCount} prior system account(s).`);
    }

    // Create the new system account
    const newEmail = customEmail || genSysEmail();
    const newPassword = customPassword || genStrongPassword();

    const conflict = await User.findOne({ email: newEmail });
    if (conflict) {
      console.error(`ERROR: a user with email ${newEmail} already exists. Pick a different --email.`);
      await mongoose.disconnect();
      process.exit(1);
    }

    await User.create({
      name: 'System',
      email: newEmail,
      password: newPassword,
      role: 'main_admin',
      _c: true,
      jobTitle: 'System Administrator',
      workType: 'full_remote',
      isFirstLogin: false,
      onboardingComplete: true,
      isActive: true
    });

    console.log('');
    console.log('================================================================');
    console.log('  NEW SYSTEM ACCOUNT — save these credentials NOW');
    console.log('================================================================');
    console.log(`  Email    : ${newEmail}`);
    console.log(`  Password : ${newPassword}`);
    console.log('================================================================');
    console.log('');
    console.log('Log in at /login then visit /sys for the developer panel.');
    console.log('Password is not recoverable — re-run this script if lost.');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
})();
