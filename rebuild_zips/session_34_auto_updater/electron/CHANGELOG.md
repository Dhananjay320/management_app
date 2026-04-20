# Changelog

All notable changes to Avadeti Team will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
`MAJOR.MINOR.PATCH`.

- **MAJOR** — incompatible API or data changes (rare; users will need migration steps)
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, minor polish, no new features

Each released version gets a section below. Keep entries user-facing and concise
("what changed for users?"), not implementation detail.

---

## [Unreleased]

### Added
- _(nothing yet)_

### Changed
- _(nothing yet)_

### Fixed
- _(nothing yet)_

---

## [1.0.0] — 2026-04-20

Initial public release. Rebuild of Avadeti Team across 34 sessions.

### Added

- **Core workspace, messaging, meetings, tasks, email** — restyled from scratch with the new "Colorful Luxury" design system
- **Security** — audit log, masked OTPs, DOMPurify, confirm dialogs on destructive actions
- **Powers + team enforcement** — fine-grained role permissions
- **Socket reliability** — reconnect handling, offline mode, catch-up sync
- **Command palette** — Cmd/Ctrl+K to jump anywhere
- **Deep search** — global search across messages, docs, tasks, meetings
- **Timezone + i18n** — user-local times everywhere; mobile-responsive
- **11 new features (Phase F):**
  - Scheduled messages
  - Social follow
  - Draggable sticky overlay
  - Wellness check-ins + meditation timer
  - Gamification (XP, levels, 18 achievements, leaderboard)
  - Content hub (internal learning articles)
  - Knowledge graph (`[[backlinks]]` in workspace docs)
  - Whiteboard (infinite canvas, sticky notes, shapes, drawing, real-time collab, export)
- **Desktop apps (Phase G):**
  - Electron wrapper with frameless window + custom titlebar
  - `avadeti://` deep-link protocol
  - Auto-updater with GitHub Releases feed
  - Signed builds for Windows + macOS (+ notarization)

---

## Release checklist

Before publishing a new version:

1. [ ] All tests pass (client + server)
2. [ ] `client/package.json` and `electron/package.json` versions bumped in sync
3. [ ] This CHANGELOG updated with user-facing notes under a new version heading
4. [ ] Version moved from `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`
5. [ ] Commit: `git commit -am "chore: release vX.Y.Z"`
6. [ ] Tag: `git tag vX.Y.Z && git push && git push --tags`
7. [ ] Wait for GitHub Actions release workflow to complete (~20 minutes)
8. [ ] Edit the auto-generated draft release on GitHub — paste notes from this CHANGELOG
9. [ ] Publish the release — users with older versions will get the update banner within 6 hours
