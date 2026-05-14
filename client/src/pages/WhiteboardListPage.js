import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function WhiteboardListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shareModal, setShareModal] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

  const loadBoards = useCallback(async () => {
    try { const { data } = await api.get('/whiteboards'); setBoards(data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const createBoard = async () => {
    try { const { data } = await api.post('/whiteboards', { title: 'Untitled Board' }); navigate(`/whiteboards/${data._id}`); } catch {}
  };

  const deleteBoard = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this whiteboard?')) return;
    try { await api.delete(`/whiteboards/${id}`); loadBoards(); } catch {}
  };

  const openShare = (board, e) => {
    e.stopPropagation();
    setShareModal(board);
    if (!allUsers.length) api.get('/users/directory').then(r => setAllUsers(r.data || [])).catch(() => {});
  };

  const shareWith = async (userId, role) => {
    if (!shareModal) return;
    try { await api.put(`/whiteboards/${shareModal._id}/share`, { userId, role }); loadBoards(); } catch {}
  };

  const unshare = async (userId) => {
    if (!shareModal) return;
    try { await api.put(`/whiteboards/${shareModal._id}/unshare`, { userId }); loadBoards(); } catch {}
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--ink-3)' }}>Loading whiteboards...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Whiteboards</h1>
          <p className="page-subtitle">Collaborative drawing and brainstorming</p>
        </div>
        <button className="btn btn-primary-sm" onClick={createBoard}>+ New Whiteboard</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        <div onClick={createBoard}
          style={{ background: 'var(--glass)', border: '2px dashed var(--line)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 160, transition: 'border-color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#6366F1'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
          <div style={{ fontSize: 32, color: 'var(--ink-3)', marginBottom: 8 }}>+</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6366F1' }}>New Whiteboard</div>
        </div>

        {boards.map(board => {
          const isOwner = board.owner?._id === user?._id;
          const memberEntry = board.members?.find(m => (m.user?._id || m.user) === user?._id);
          const myRole = isOwner ? 'owner' : (memberEntry?.role || 'viewer');

          return (
            <div key={board._id} className="card"
              style={{ cursor: 'pointer', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              onClick={() => navigate(`/whiteboards/${board._id}`)}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{board.title}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {board.isShared && <span className="badge-pill" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontSize: 8 }}>Shared</span>}
                    {!isOwner && <span className="badge-pill" style={{ background: myRole === 'editor' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: myRole === 'editor' ? '#10B981' : '#F59E0B', fontSize: 8 }}>{myRole === 'editor' ? 'Can Edit' : 'View Only'}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{board.shapes?.length || 0} shapes</div>
                {board.members?.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                    {board.members.slice(0, 4).map((m, i) => (
                      <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 7, fontWeight: 700, border: '1px solid var(--bg-1)' }}>
                        {(m.user?.name || '?')[0]}
                      </div>
                    ))}
                    {board.members.length > 4 && <span style={{ fontSize: 9, color: 'var(--ink-3)', alignSelf: 'center' }}>+{board.members.length - 4}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                  {board.owner?.name} &middot; {new Date(board.updatedAt).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {isOwner && (
                    <button onClick={(e) => openShare(board, e)}
                      style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 8px', fontSize: 9, color: '#6366F1', cursor: 'pointer', fontFamily: 'Inter' }}>
                      Share
                    </button>
                  )}
                  {(isOwner || user?.role === 'main_admin') && (
                    <button onClick={(e) => deleteBoard(board._id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)', padding: '2px 6px', borderRadius: 4 }}>x</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {boards.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)', fontSize: 13 }}>
          No whiteboards yet. Create one to start collaborating!
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setShareModal(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 14, width: 380, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Share "{shareModal.title}"</div>
              <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => setShareModal(null)}>&times;</button>
            </div>
            <div style={{ padding: 16 }}>
              {/* Current members */}
              {shareModal.members?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase' }}>Shared with</div>
                  {shareModal.members.map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>
                        {(m.user?.name || '?')[0]}
                      </div>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--ink)' }}>{m.user?.name || 'Unknown'}</span>
                      <select value={m.role} onChange={e => shareWith((m.user?._id || m.user), e.target.value)}
                        style={{ padding: '2px 6px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--glass)', color: 'var(--ink)', fontFamily: 'Inter' }}>
                        <option value="editor">Can Edit</option>
                        <option value="viewer">View Only</option>
                      </select>
                      <button onClick={() => unshare(m.user?._id || m.user)}
                        style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add people */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6, textTransform: 'uppercase' }}>Add people</div>
              {allUsers.filter(u => u._id !== user._id && !shareModal.members?.some(m => (m.user?._id || m.user) === u._id)).map(u => (
                <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--glass)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#10B981,#06B6D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>
                    {(u.name || '?')[0]}
                  </div>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--ink)' }}>{u.name}</span>
                  <button onClick={() => shareWith(u._id, 'editor')}
                    style={{ padding: '2px 8px', fontSize: 9, border: '1px solid #10B981', borderRadius: 4, background: 'rgba(16,185,129,0.06)', color: '#10B981', cursor: 'pointer', fontFamily: 'Inter', marginRight: 2 }}>
                    Editor
                  </button>
                  <button onClick={() => shareWith(u._id, 'viewer')}
                    style={{ padding: '2px 8px', fontSize: 9, border: '1px solid #F59E0B', borderRadius: 4, background: 'rgba(245,158,11,0.06)', color: '#F59E0B', cursor: 'pointer', fontFamily: 'Inter' }}>
                    Viewer
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
