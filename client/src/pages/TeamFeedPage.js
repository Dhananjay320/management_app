import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api, { getFileUrl } from '../services/api';
import ReactionPill from '../components/ReactionPill';
import Avatar from '../components/Avatar';
import '../styles/teamfeed.css';
// TODO: Add FormatSwitcher from '../components/FormatSwitcher' to allow switching feed posts between chat/email/table/calendar/document views

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
  'linear-gradient(135deg,#06B6D4,#10B981)',
];

function getGradient(str) {
  const hash = (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getInitials(name) {
  return (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '💪'];

export default function TeamFeedPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState('all'); // 'all', 'team', 'pinned'
  const [newPost, setNewPost] = useState('');
  const [audience, setAudience] = useState('company');
  const [commentInputs, setCommentInputs] = useState({});
  const [showComments, setShowComments] = useState({});
  const [mediaFile, setMediaFile] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  useEffect(() => { api.get('/users').then(r => setAllUsers(r.data || [])).catch(() => {}); }, []);

  const loadPosts = useCallback(async () => {
    try {
      const params = {};
      if (tab === 'team') params.audience = 'team';
      if (tab === 'pinned') params.pinned = 'true';
      const { data } = await api.get('/feed', { params });
      setPosts(data);
    } catch {}
  }, [tab]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Load teams for team picker
  useEffect(() => {
    api.get('/teams').then(res => setTeams(res.data)).catch(() => {});
  }, []);

  // Socket: new feed post
  useEffect(() => {
    if (!socket) return;
    const handleNew = () => loadPosts();
    socket.on('feed:new', handleNew);
    return () => socket.off('feed:new', handleNew);
  }, [socket, loadPosts]);

  // Polling fallback every 45s in case socket isn't connected
  useEffect(() => {
    const t = setInterval(loadPosts, 45000);
    return () => clearInterval(t);
  }, [loadPosts]);

  // Per-post "expanded" state for long text
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const toggleExpanded = (id) => setExpandedPosts(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const createPost = async () => {
    if (!newPost.trim() && !mediaFile) return;
    try {
      if (mediaFile) {
        const formData = new FormData();
        formData.append('media', mediaFile);
        formData.append('content', newPost.trim());
        formData.append('audience', audience);
        await api.post('/feed/with-media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/feed', { content: newPost.trim(), audience, team: audience === 'team' ? selectedTeam : undefined });
      }
      setNewPost('');
      setMediaFile(null);
      loadPosts();
    } catch {}
  };

  const react = async (postId, emoji) => {
    try {
      const { data } = await api.post(`/feed/${postId}/react`, { emoji });
      setPosts(prev => prev.map(p => p._id === postId ? { ...p, reactions: data } : p));
    } catch {}
  };

  const comment = async (postId) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    try {
      const { data } = await api.post(`/feed/${postId}/comment`, { content: text });
      setPosts(prev => prev.map(p => p._id === postId ? { ...p, comments: data } : p));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    } catch {}
  };

  const togglePin = async (postId) => {
    try {
      const { data } = await api.post(`/feed/${postId}/pin`);
      setPosts(prev => prev.map(p => {
        if (p._id !== postId) return p;
        const pinnedBy = data.pinned
          ? [...(p.pinnedBy || []), user._id]
          : (p.pinnedBy || []).filter(id => id !== user._id);
        return { ...p, pinnedBy };
      }));
    } catch {}
  };

  const deletePost = async (postId) => {
    try {
      await api.delete(`/feed/${postId}`);
      setPosts(prev => prev.filter(p => p._id !== postId));
    } catch {}
  };

  const isPinned = (post) => (post.pinnedBy || []).some(id => id === user._id || id?._id === user._id);

  return (
    <div className="feed-layout">
      <div className="feed-header">
        <h2>Team Feed</h2>
        <div className="feed-tabs">
          {[
            { key: 'all', label: 'All' },
            { key: 'team', label: 'My Team' },
            { key: 'pinned', label: 'Pinned' }
          ].map(t => (
            <button key={t.key} className={`feed-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Create Post */}
      <div className="feed-create">
        <div className="feed-create-top">
          <Avatar user={user} size={36} />
          <textarea
            className="feed-create-input"
            placeholder="Share something with the team..."
            value={newPost}
            onChange={e => setNewPost(e.target.value)}
          />
        </div>
        <div className="feed-create-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="feed-create-tools">
              <label className="feed-create-tool" title="Image" style={{ cursor: 'pointer' }}>🖼️
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setMediaFile(e.target.files[0])} />
              </label>
              <label className="feed-create-tool" title="Video" style={{ cursor: 'pointer' }}>🎬
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => setMediaFile(e.target.files[0])} />
              </label>
              <button className="feed-create-tool" title="Link" onClick={() => {
                const url = prompt('Enter link URL:');
                if (url) setNewPost(prev => prev + (prev ? '\n' : '') + url);
              }}>🔗</button>
              <label className="feed-create-tool" title="File" style={{ cursor: 'pointer' }}>📎
                <input type="file" style={{ display: 'none' }} onChange={e => setMediaFile(e.target.files[0])} />
              </label>
            </div>
            {mediaFile && (
              <span style={{ fontSize: 10, color: '#6366F1', fontWeight: 600 }}>
                📎 {mediaFile.name}
                <span style={{ cursor: 'pointer', marginLeft: 4, color: '#EF4444' }} onClick={() => setMediaFile(null)}>&times;</span>
              </span>
            )}
            <select className="feed-create-audience" value={audience} onChange={e => setAudience(e.target.value)}>
              <option value="company">Company</option>
              <option value="team">Team</option>
            </select>
            {audience === 'team' && (
              <select className="feed-create-audience" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                <option value="">Select team...</option>
                {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <button className="feed-post-btn" onClick={createPost} disabled={!newPost.trim()}>Post</button>
        </div>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="feed-empty">
          <div className="feed-empty-icon">📰</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            {tab === 'pinned' ? 'No pinned posts' : 'No posts yet'}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {tab === 'pinned' ? 'Pin posts to bookmark them here.' : 'Be the first to share something fun, a learning, or a shoutout!'}
          </p>
        </div>
      ) : (
        posts.map(post => (
          <div key={post._id} className="feed-card">
            {/* Header */}
            <div className="feed-card-header">
              <Avatar user={post.author} size={36} />
              <div className="feed-card-author">
                <div className="feed-card-name">{post.author?.name}</div>
                <div className="feed-card-sub">
                  {post.author?.jobTitle && <span>{post.author.jobTitle}</span>}
                  <span>{timeAgo(post.createdAt)}</span>
                  <span className={`feed-audience-badge ${post.audience === 'company' ? 'feed-audience-company' : 'feed-audience-team'}`}>
                    {post.audience === 'company' ? 'Company' : post.team?.name || 'Team'}
                  </span>
                </div>
              </div>
              <div className="feed-card-actions-top">
                <button
                  className={`feed-card-action-btn ${isPinned(post) ? 'pinned' : ''}`}
                  onClick={() => togglePin(post._id)}
                  title={isPinned(post) ? 'Unpin' : 'Pin for me'}
                >
                  📌
                </button>
                {(post.author?._id === user._id || ['main_admin', 'admin'].includes(user.role)) && (
                  <button className="feed-card-action-btn" onClick={() => deletePost(post._id)} title="Delete">
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="feed-card-body">
              {(() => {
                const isLong = (post.content || '').length > 280 || (post.content || '').split('\n').length > 5;
                const expanded = expandedPosts.has(post._id);
                return (
                  <>
                    <div className={`feed-card-text ${isLong && !expanded ? 'clamped' : ''}`}>{post.content}</div>
                    {post.media?.url && post.contentType === 'image' && (
                      <img src={getFileUrl(post.media.url || post.media.path)} alt={post.media.name} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8, marginTop: 8, display: 'block' }} />
                    )}
                    {post.media?.url && post.contentType === 'video' && (
                      <video src={getFileUrl(post.media.url || post.media.path)} controls style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }} />
                    )}
                    {post.media?.url && post.contentType === 'file' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 6, marginTop: 8, fontSize: 11 }}>
                        📎 <span style={{ fontWeight: 600 }}>{post.media.name}</span>
                      </div>
                    )}
                    {post.linkPreview?.url && (
                      <div className="feed-link-preview">
                        <div>
                          <div className="feed-link-title">{post.linkPreview.title}</div>
                          <div className="feed-link-desc">{post.linkPreview.description}</div>
                          <div className="feed-link-url">{post.linkPreview.url}</div>
                        </div>
                      </div>
                    )}
                    {isLong && (
                      <button onClick={() => toggleExpanded(post._id)}
                        style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--indigo)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        {expanded ? 'Show less ▲' : 'Show more ▼'}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Reactions — hover any pill to see who reacted */}
            {post.reactions?.length > 0 && (
              <div className="feed-reactions">
                {post.reactions.map((r, ri) => (
                  <ReactionPill
                    key={ri}
                    emoji={r.emoji}
                    users={r.users}
                    mine={r.users?.some(u => String(u._id || u) === String(user._id))}
                    resolveName={(id) => {
                      if (String(id) === String(user._id)) return 'You';
                      const u = (allUsers || []).find(x => String(x._id) === String(id));
                      return u?.name || 'Someone';
                    }}
                    className="feed-reaction"
                    onClick={() => react(post._id, r.emoji)}
                  />
                ))}
              </div>
            )}

            {/* Action Bar */}
            <div className="feed-action-bar">
              {QUICK_REACTIONS.slice(0, 3).map(em => (
                <button key={em} className="feed-action-btn" onClick={() => react(post._id, em)}>
                  {em}
                </button>
              ))}
              <button
                className="feed-action-btn"
                onClick={() => setShowComments(prev => ({ ...prev, [post._id]: !prev[post._id] }))}
              >
                💬 {post.comments?.length || 0}
              </button>
            </div>

            {/* Comments */}
            {showComments[post._id] && (
              <div className="feed-comments">
                {post.comments?.map(c => (
                  <div key={c._id} className="feed-comment">
                    <Avatar user={c.author} size={24} />
                    <div className="feed-comment-body">
                      <span className="feed-comment-name">{c.author?.name}</span>
                      <div className="feed-comment-text">{c.content}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <div className="feed-comment-time">{timeAgo(c.createdAt)}</div>
                        {['👍','❤️','😂'].map(em => (
                          <span key={em} style={{ cursor: 'pointer', fontSize: 11, padding: '1px 4px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--glass)' }}
                            onClick={async () => {
                              try {
                                const { data } = await api.post(`/feed/${post._id}/comment/${c._id}/react`, { emoji: em });
                                setPosts(prev => prev.map(p => p._id === post._id ? { ...p, comments: data } : p));
                              } catch {}
                            }}>{em}</span>
                        ))}
                      </div>
                      {c.reactions?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          {c.reactions.map((r, ri) => (
                            <span key={ri} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                              {r.emoji} {r.users?.length || 0}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="feed-comment-input">
                  <input
                    placeholder="Write a comment..."
                    value={commentInputs[post._id] || ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [post._id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') comment(post._id); }}
                  />
                  <button
                    className="feed-comment-send"
                    onClick={() => comment(post._id)}
                    disabled={!(commentInputs[post._id] || '').trim()}
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
