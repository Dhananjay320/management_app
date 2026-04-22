import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function WhiteboardListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBoards = useCallback(async () => {
    try {
      const { data } = await api.get('/whiteboards');
      setBoards(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const createBoard = async () => {
    try {
      const { data } = await api.post('/whiteboards', { title: 'Untitled Board' });
      navigate(`/whiteboards/${data._id}`);
    } catch {}
  };

  const deleteBoard = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this whiteboard?')) return;
    try {
      await api.delete(`/whiteboards/${id}`);
      loadBoards();
    } catch {}
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
        {/* New board card */}
        <div
          onClick={createBoard}
          style={{
            background: 'var(--glass)',
            border: '2px dashed #E2E8F0',
            borderRadius: 12,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            minHeight: 160,
            transition: 'border-color 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#6366F1'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
        >
          <div style={{ fontSize: 32, color: 'var(--ink-3)', marginBottom: 8 }}>+</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6366F1' }}>New Whiteboard</div>
        </div>

        {boards.map(board => (
          <div
            key={board._id}
            className="card"
            style={{ cursor: 'pointer', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            onClick={() => navigate(`/whiteboards/${board._id}`)}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{board.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {board.shapes?.length || 0} shapes
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {board.owner?.name || 'Unknown'} &middot; {new Date(board.updatedAt).toLocaleDateString()}
              </div>
              {(board.owner?._id === user?._id || user?.role === 'main_admin') && (
                <button
                  onClick={(e) => deleteBoard(board._id, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-3)', padding: '2px 6px', borderRadius: 4 }}
                  title="Delete"
                >
                  x
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {boards.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)', fontSize: 13 }}>
          No whiteboards yet. Create one to start collaborating!
        </div>
      )}
    </div>
  );
}
