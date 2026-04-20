// ============================================================================
// teamAccess.js — team-membership checks.
// ============================================================================
// Session 11 (C9 — Team Membership Enforcement).
//
// The User model holds membership on its own `teams` array. Every "team-scoped"
// endpoint currently accepts a team ID from the client without checking that
// the caller is actually a member or scoped admin. This module centralizes
// those checks so each route does the same thing.
//
// Exports:
//   isTeamMember(user, teamId)        — sync, reads user.teams array
//   isTeamLead(user, teamOrId)        — given a Team doc or ID, is this user its lead?
//   canAccessTeam(user, teamId)       — member OR lead OR main_admin OR in admin scope
//   requireTeamMember(getTeamId)      — Express middleware form
//   assertTeamMember(user, teamId)    — throws HTTP-shaped error for try/catch
// ============================================================================

const mongoose = require('mongoose');
const Team = require('../models/Team');

function toStr(x) { return x == null ? '' : String(x._id || x); }

function isTeamMember(user, teamId) {
  if (!user || !teamId) return false;
  const needle = toStr(teamId);
  return (user.teams || []).some(t => toStr(t) === needle);
}

// Session 11: Channel membership check that works with mongoose ObjectId docs.
// `channel.members.includes(userId)` does NOT work reliably because ObjectId
// comparison with `includes` uses `===` which is always false for different
// instances. This helper normalizes both sides to strings.
function isChannelMember(channel, userId) {
  if (!channel || !userId) return false;
  const needle = toStr(userId);
  return (channel.members || []).some(m => toStr(m) === needle);
}

async function isTeamLead(user, teamOrId) {
  if (!user || !teamOrId) return false;
  let team = teamOrId;
  if (typeof teamOrId === 'string' || mongoose.Types.ObjectId.isValid(teamOrId)) {
    team = await Team.findById(teamOrId).select('lead');
  }
  if (!team) return false;
  return toStr(team.lead) === toStr(user._id);
}

/**
 * canAccessTeam — the canonical "should this user see this team's stuff" check.
 *   - main_admin: yes
 *   - team member (user.teams includes teamId): yes
 *   - scoped admin whose adminScope.teams includes teamId: yes
 *     (i.e. an HR admin scoped to Team X can see Team X even if not a member)
 *   - everyone else: no
 */
async function canAccessTeam(user, teamId) {
  if (!user || !teamId) return false;
  if (user.role === 'main_admin') return true;
  if (isTeamMember(user, teamId)) return true;
  // isInAdminScope returns true when scope is empty (unrestricted) — that
  // would allow unrestricted admins to see everything. For team access we
  // only want "in scope" to grant access when scope is non-empty.
  if (user.adminScope?.teams?.length) {
    const inScope = user.adminScope.teams.some(t => toStr(t) === toStr(teamId));
    if (inScope) return true;
  }
  return false;
}

/**
 * Express middleware: require the caller to be a member of the team specified
 * at `getTeamId(req)`. Returns 400 if team ID missing, 403 if not a member.
 *
 * Usage:
 *   router.post('/', protect,
 *     requireTeamMember(req => req.body.team),
 *     handler);
 */
function requireTeamMember(getTeamId) {
  return async (req, res, next) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return res.status(400).json({ error: 'team is required.' });

      const ok = await canAccessTeam(req.user, teamId);
      if (!ok) return res.status(403).json({ error: 'You are not a member of that team.' });
      next();
    } catch (err) {
      console.error('[teamAccess] check failed', err);
      res.status(500).json({ error: 'Server error.' });
    }
  };
}

// Throw a tagged error so callers can `catch (e)` and return the right HTTP status.
async function assertTeamMember(user, teamId) {
  const ok = await canAccessTeam(user, teamId);
  if (!ok) {
    const e = new Error('You are not a member of that team.');
    e.status = 403;
    throw e;
  }
}

module.exports = {
  isTeamMember,
  isChannelMember,
  isTeamLead,
  canAccessTeam,
  requireTeamMember,
  assertTeamMember,
};
