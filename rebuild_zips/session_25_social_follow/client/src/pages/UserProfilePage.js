// ============================================================================
// UserProfilePage.js — view any user's public profile.
// ============================================================================
// Session 25 (N4). Accessible at /profile/:userId. Shows the user's name,
// role/team, status, follower/following counts, and a Follow button
// (absent when viewing your own profile).
//
// This is purposely minimal — richer profile content (activity timeline,
// achievements) can be layered in by later feature sessions (like N8
// gamification which will show badges here).
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  GlassPanel, GradientText,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import FollowButton from '../components/FollowButton';
import './UserProfilePage.css';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
];

function getGradient(str) {
  const hash = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UserProfilePage() {
  const { userId } = useParams();
  const { user: me } = useAuth();
  const isSelf = String(me?._id) === String(userId);

  const { data: profile, loading, error, refetch } = useFetchSafe(
    async () => (await api.get(`/users/${userId}`)).data,
    [userId]
  );

  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const refreshCounts = async () => {
    try {
      const { data } = await api.get(`/follows/count/${userId}`);
      setCounts(data);
    } catch {}
  };
  useEffect(() => { refreshCounts(); /* eslint-disable-next-line */ }, [userId]);

  if (loading) {
    return <GlassPanel elevated className="ad-up__state">Loading…</GlassPanel>;
  }
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }
  if (!profile) return null;

  return (
    <div className="ad-up">
      {/* ─── Profile hero ───────────────────────────────────────────── */}
      <GlassPanel elevated className="ad-up__hero ad-enter">
        <div
          className="ad-up__avatar"
          style={{ background: getGradient(profile._id) }}
          aria-hidden
        >
          {getInitials(profile.name)}
        </div>

        <div className="ad-up__info">
          <h1 className="ad-up__name">
            <GradientText>{profile.name}</GradientText>
          </h1>

          {profile.jobTitle && <div className="ad-up__title">{profile.jobTitle}</div>}

          {profile.statusMessage && (
            <div className="ad-up__status">{profile.statusMessage}</div>
          )}

          <div className="ad-up__stats">
            <Link to="/social" className="ad-up__stat">
              <span className="ad-up__stat-value">{counts.followers}</span>
              <span className="ad-up__stat-label">followers</span>
            </Link>
            <Link to="/social" className="ad-up__stat">
              <span className="ad-up__stat-value">{counts.following}</span>
              <span className="ad-up__stat-label">following</span>
            </Link>
            {profile.team?.name && (
              <div className="ad-up__stat ad-up__stat--static">
                <span className="ad-up__stat-value">#{profile.team.name}</span>
                <span className="ad-up__stat-label">team</span>
              </div>
            )}
          </div>
        </div>

        {!isSelf && (
          <div className="ad-up__action">
            <FollowButton
              userId={userId}
              size="md"
              showDurationPicker
              onChange={refreshCounts}
            />
          </div>
        )}
      </GlassPanel>

      {/* ─── Details grid ──────────────────────────────────────────── */}
      <div className="ad-up__grid">
        {profile.email && (
          <div className="ad-up__field">
            <div className="ad-up__field-label">Email</div>
            <div className="ad-up__field-value">{profile.email}</div>
          </div>
        )}
        {profile.phone && (
          <div className="ad-up__field">
            <div className="ad-up__field-label">Phone</div>
            <div className="ad-up__field-value">{profile.phone}</div>
          </div>
        )}
        {profile.office?.name && (
          <div className="ad-up__field">
            <div className="ad-up__field-label">Office</div>
            <div className="ad-up__field-value">{profile.office.name}</div>
          </div>
        )}
        {profile.role && (
          <div className="ad-up__field">
            <div className="ad-up__field-label">Role</div>
            <div className="ad-up__field-value">{profile.role.replace('_', ' ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
