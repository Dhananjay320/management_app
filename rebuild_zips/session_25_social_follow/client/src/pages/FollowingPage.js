// ============================================================================
// FollowingPage.js — Followers and Following lists.
// ============================================================================
// Session 25 (N4). Two-tab page showing who follows me and who I follow,
// with unfollow + follow-back actions.
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  GlassPanel, SegmentedControl, GradientText, Icon,
} from '../design-system';
import ErrorState from '../components/ErrorState';
import { useFetchSafe } from '../hooks/useFetchSafe';
import FollowButton from '../components/FollowButton';
import './FollowingPage.css';

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

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatEndAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 86400000;
  if (diff < 0) return null;  // expired
  if (diff < 1) return 'expires today';
  if (diff < 2) return 'expires tomorrow';
  if (diff < 30) return `expires in ${Math.floor(diff)} days`;
  return `until ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function FollowingPage() {
  const [tab, setTab] = useState('following');

  const {
    data: following = [],
    loading: loadingFollowing,
    error:   errorFollowing,
    refetch: refetchFollowing,
  } = useFetchSafe(async () => (await api.get('/follows/following')).data, []);

  const {
    data: followers = [],
    loading: loadingFollowers,
    error:   errorFollowers,
    refetch: refetchFollowers,
  } = useFetchSafe(async () => (await api.get('/follows/followers')).data, []);

  const list   = tab === 'following' ? following : followers;
  const loading = tab === 'following' ? loadingFollowing : loadingFollowers;
  const error   = tab === 'following' ? errorFollowing   : errorFollowers;
  const refetch = tab === 'following' ? refetchFollowing : refetchFollowers;

  return (
    <div className="ad-followpage">
      <header className="ad-followpage__head ad-enter">
        <div className="ad-followpage__head-left">
          <h1 className="ad-followpage__title">
            Your <GradientText>social</GradientText> circle
          </h1>
          <p className="ad-followpage__sub">
            {tab === 'following'
              ? `You follow ${following.length} ${following.length === 1 ? 'person' : 'people'}`
              : `${followers.length} ${followers.length === 1 ? 'person follows' : 'people follow'} you`}
          </p>
        </div>
        <div className="ad-followpage__head-right">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { key: 'following', label: `Following (${following.length})` },
              { key: 'followers', label: `Followers (${followers.length})` },
            ]}
          />
        </div>
      </header>

      {loading ? (
        <GlassPanel elevated className="ad-followpage__state">Loading…</GlassPanel>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : list.length === 0 ? (
        <GlassPanel elevated className="ad-followpage__state">
          <div className="ad-followpage__empty-icon">
            {tab === 'following' ? '👥' : '⭐'}
          </div>
          <div className="ad-followpage__empty-title">
            {tab === 'following' ? 'Not following anyone yet' : 'No followers yet'}
          </div>
          <div className="ad-followpage__empty-sub">
            {tab === 'following'
              ? 'Visit a teammate\u2019s profile and tap Follow to keep up with their progress.'
              : 'When someone follows you, they\u2019ll show up here.'}
          </div>
        </GlassPanel>
      ) : (
        <div className="ad-followpage__list">
          {list.map(follow => {
            // In 'following' tab, the other user is `follow.following`;
            // in 'followers' tab, it's `follow.follower`.
            const person = tab === 'following' ? follow.following : follow.follower;
            if (!person) return null;

            const endInfo = formatEndAt(follow.endAt);

            return (
              <div key={follow._id} className="ad-follow-row">
                <Link to={`/profile/${person._id}`} className="ad-follow-row__user">
                  <div
                    className="ad-follow-row__avatar"
                    style={{ background: getGradient(person._id) }}
                  >
                    {getInitials(person.name)}
                  </div>
                  <div className="ad-follow-row__info">
                    <div className="ad-follow-row__name">{person.name}</div>
                    <div className="ad-follow-row__meta">
                      {person.jobTitle || person.email}
                      {follow.note && <span className="ad-follow-row__note"> · “{follow.note}”</span>}
                    </div>
                    <div className="ad-follow-row__time">
                      {tab === 'following' ? 'You followed' : 'Followed you'} {formatRelative(follow.createdAt)}
                      {endInfo && <span className="ad-follow-row__ends"> · {endInfo}</span>}
                    </div>
                  </div>
                </Link>

                <div className="ad-follow-row__action">
                  <FollowButton
                    userId={person._id}
                    size="sm"
                    onChange={() => { refetchFollowing(); refetchFollowers(); }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
