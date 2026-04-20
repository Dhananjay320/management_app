// ============================================================================
// GamificationPage.js — your XP, level, achievements, and leaderboard.
// ============================================================================
// Session 28 (N8). Three-tab page:
//
//   Stats       — hero showing level, XP progress bar, streaks, counts
//   Achievements — grid of all definitions with locked/unlocked state
//   Leaderboard  — top 20 by XP with your own rank highlighted
// ============================================================================

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, SegmentedControl, GradientText,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import './GamificationPage.css';

const TIER_META = {
  bronze:   { color: '#B45309', label: 'Bronze'   },
  silver:   { color: '#9CA3AF', label: 'Silver'   },
  gold:     { color: '#F59E0B', label: 'Gold'     },
  platinum: { color: '#8B5CF6', label: 'Platinum' },
};

export default function GamificationPage() {
  const [tab, setTab] = useState('stats');

  const { data: me, loading: loadingMe, error: errorMe, refetch: refetchMe } = useFetchSafe(
    async () => (await api.get('/gamification/me')).data, []
  );
  const { data: defs = [], loading: loadingDefs } = useFetchSafe(
    async () => (await api.get('/gamification/achievements')).data, []
  );
  const { data: board, loading: loadingBoard, refetch: refetchBoard } = useFetchSafe(
    async () => (await api.get('/gamification/leaderboard')).data, []
  );

  return (
    <div className="ad-gam">
      <header className="ad-gam__head ad-enter">
        <div>
          <h1 className="ad-gam__title">
            Your <GradientText>progress</GradientText>
          </h1>
          <p className="ad-gam__sub">
            Earn XP for completing tasks, checking in daily, and more.
          </p>
        </div>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'stats',        label: 'Stats'        },
            { key: 'achievements', label: 'Achievements' },
            { key: 'leaderboard',  label: 'Leaderboard'  },
          ]}
        />
      </header>

      {errorMe && <ErrorState error={errorMe} onRetry={refetchMe} />}

      {tab === 'stats' && (
        <StatsView me={me} loading={loadingMe} defs={defs} />
      )}
      {tab === 'achievements' && (
        <AchievementsView me={me} defs={defs} loading={loadingDefs} />
      )}
      {tab === 'leaderboard' && (
        <LeaderboardView board={board} loading={loadingBoard} refetch={refetchBoard} />
      )}
    </div>
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────
function StatsView({ me, loading, defs }) {
  if (loading || !me) {
    return <GlassPanel elevated className="ad-gam__state">Loading…</GlassPanel>;
  }
  const { progress } = me;
  const unlockedSet = useMemo(() => new Set((me.unlocked || []).map(u => u.key)), [me.unlocked]);
  const recentUnlocks = (me.unlocked || []).slice(0, 5).map(u => ({
    ...u,
    def: defs.find(d => d.key === u.key),
  })).filter(u => u.def);

  return (
    <>
      <GlassPanel elevated className="ad-gam-hero ad-enter">
        <div className="ad-gam-hero__level">
          <div className="ad-gam-hero__level-ring">
            <div className="ad-gam-hero__level-num">{me.level}</div>
          </div>
          <div className="ad-gam-hero__level-label">Level</div>
        </div>

        <div className="ad-gam-hero__info">
          <div className="ad-gam-hero__xp">
            <span className="ad-gam-hero__xp-value">{me.xp.toLocaleString()}</span>
            <span className="ad-gam-hero__xp-label">total XP</span>
          </div>
          <div className="ad-gam-hero__bar-wrap">
            <div className="ad-gam-hero__bar">
              <div
                className="ad-gam-hero__bar-fill"
                style={{ width: `${progress.pctToNext}%` }}
              />
            </div>
            <div className="ad-gam-hero__bar-text">
              {progress.xpIntoLevel} / {progress.xpForNextLevel} XP to level {me.level + 1}
            </div>
          </div>
        </div>

        <div className="ad-gam-hero__stats">
          <div className="ad-gam-hero__stat">
            <span className="ad-gam-hero__stat-value">{me.moodStreak}</span>
            <span className="ad-gam-hero__stat-label">🔥 Mood streak</span>
          </div>
          <div className="ad-gam-hero__stat">
            <span className="ad-gam-hero__stat-value">{unlockedSet.size}</span>
            <span className="ad-gam-hero__stat-label">🏅 Badges</span>
          </div>
        </div>
      </GlassPanel>

      {recentUnlocks.length > 0 && (
        <GlassPanel elevated className="ad-gam-recent">
          <div className="ad-gam-recent__title">Recent unlocks</div>
          <div className="ad-gam-recent__list">
            {recentUnlocks.map(u => (
              <div key={u.key} className="ad-gam-recent__item">
                <span className="ad-gam-recent__icon">{u.def.icon}</span>
                <div className="ad-gam-recent__text">
                  <div className="ad-gam-recent__name">{u.def.title}</div>
                  <div className="ad-gam-recent__desc">
                    +{u.def.xp} XP · {new Date(u.unlockedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </>
  );
}

// ─── Achievements ─────────────────────────────────────────────────────
function AchievementsView({ me, defs, loading }) {
  const unlockedMap = useMemo(() => {
    const map = new Map();
    (me?.unlocked || []).forEach(u => map.set(u.key, u));
    return map;
  }, [me]);

  if (loading || !defs.length) {
    return <GlassPanel elevated className="ad-gam__state">Loading achievements…</GlassPanel>;
  }

  const unlocked = defs.filter(d => unlockedMap.has(d.key));
  const locked = defs.filter(d => !unlockedMap.has(d.key));

  return (
    <div className="ad-gam-ach">
      <div className="ad-gam-ach__summary">
        {unlocked.length} of {defs.length} unlocked
      </div>
      <div className="ad-gam-ach__grid">
        {[...unlocked, ...locked].map(def => {
          const unlock = unlockedMap.get(def.key);
          const tier = TIER_META[def.tier] || TIER_META.bronze;
          return (
            <div
              key={def.key}
              className={`ad-ach ${unlock ? 'ad-ach--unlocked' : 'ad-ach--locked'}`}
              style={{ '--tier': tier.color }}
            >
              <div className="ad-ach__icon">{def.icon}</div>
              <div className="ad-ach__name">{def.title}</div>
              <div className="ad-ach__desc">{def.description}</div>
              <div className="ad-ach__foot">
                <span className="ad-ach__tier" style={{ color: tier.color }}>
                  {tier.label}
                </span>
                <span className="ad-ach__xp">+{def.xp} XP</span>
              </div>
              {unlock && (
                <div className="ad-ach__unlocked-date">
                  Unlocked {new Date(unlock.unlockedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────
function LeaderboardView({ board, loading }) {
  const { user: me } = useAuth();
  if (loading || !board) {
    return <GlassPanel elevated className="ad-gam__state">Loading leaderboard…</GlassPanel>;
  }

  return (
    <GlassPanel elevated className="ad-gam-board">
      <div className="ad-gam-board__head">
        <div className="ad-gam-board__title">Top players</div>
        <div className="ad-gam-board__my-rank">Your rank: #{board.myRank}</div>
      </div>

      {(!board.leaderboard || board.leaderboard.length === 0) ? (
        <div className="ad-gam__state">No rankings yet.</div>
      ) : (
        <div className="ad-gam-board__list">
          {board.leaderboard.map(entry => (
            <Link
              to={`/profile/${entry.userId}`}
              key={entry.userId}
              className={`ad-board-row ${entry.isMe ? 'ad-board-row--me' : ''} ${
                entry.rank <= 3 ? `ad-board-row--top${entry.rank}` : ''
              }`}
            >
              <div className="ad-board-row__rank">
                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
              </div>
              <div className="ad-board-row__name">
                {entry.name}
                {entry.isMe && <span className="ad-board-row__you">you</span>}
              </div>
              <div className="ad-board-row__stats">
                <span className="ad-board-row__level">Lv {entry.level}</span>
                <span className="ad-board-row__xp">{entry.xp.toLocaleString()} XP</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
