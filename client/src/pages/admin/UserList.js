import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
  'linear-gradient(135deg,#EF4444,#F97316)',
  'linear-gradient(135deg,#06B6D4,#10B981)',
];

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.jobTitle || '').toLowerCase().includes(search.toLowerCase())
  );

  const getRoleBadge = (user) => {
    if (user.role === 'main_admin') return { label: 'Main Admin', bg: 'rgba(99,102,241,0.08)', color: '#6366F1' };
    if (user.role === 'admin') return { label: user.adminTitle || 'Admin', bg: 'rgba(249,115,22,0.08)', color: '#F97316' };
    return { label: 'Employee', bg: 'rgba(16,185,129,0.08)', color: '#10B981' };
  };

  const getWorkTypeBadge = (wt) => {
    if (wt === 'full_office') return { label: 'Office', bg: 'rgba(99,102,241,0.08)', color: '#6366F1' };
    if (wt === 'full_remote') return { label: 'Remote', bg: 'rgba(6,182,212,0.08)', color: '#06B6D4' };
    return { label: 'Hybrid', bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading users...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Manage Users</div>
          <div className="page-subtitle">{users.length} employees</div>
        </div>
        <button className="btn btn-primary-sm" onClick={() => navigate('/admin/users/new')}>
          + Create Employee
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name, email, or job title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 400, padding: '9px 14px', border: '1px solid #E2E8F0',
            borderRadius: 8, background: '#fff', fontSize: 12, fontFamily: 'Inter, sans-serif',
            color: '#1E293B', outline: 'none'
          }}
        />
      </div>

      {/* User Table */}
      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: '1fr 1fr 120px 100px 100px 80px' }}>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Work Type</div>
          <div>Team</div>
          <div>Status</div>
        </div>
        {filtered.map((user, i) => {
          const role = getRoleBadge(user);
          const wt = getWorkTypeBadge(user.workType);
          const initials = user.name.split(' ').map(w => w[0]).join('');
          return (
            <div
              key={user._id}
              className="table-row"
              style={{ gridTemplateColumns: '1fr 1fr 120px 100px 100px 80px', cursor: 'pointer' }}
              onClick={() => navigate(`/admin/users/${user._id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar-sm" style={{ background: GRADIENTS[i % GRADIENTS.length] }}>{initials}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#1E293B' }}>{user.name}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{user.jobTitle || '—'}</div>
                </div>
              </div>
              <div style={{ color: '#64748B' }}>{user.email}</div>
              <div><span className="badge-pill" style={{ background: role.bg, color: role.color }}>{role.label}</span></div>
              <div><span className="badge-pill" style={{ background: wt.bg, color: wt.color }}>{wt.label}</span></div>
              <div style={{ color: '#64748B', fontSize: 11 }}>{user.teams?.map(t => t.name).join(', ') || '—'}</div>
              <div>
                {user.isFirstLogin
                  ? <span className="badge-pill" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B' }}>Pending</span>
                  : <span className="badge-pill" style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>Active</span>
                }
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No users found.
          </div>
        )}
      </div>
    </div>
  );
}
