import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#10B981,#06B6D4)',
  'linear-gradient(135deg,#F59E0B,#F97316)',
  'linear-gradient(135deg,#EC4899,#8B5CF6)',
];

export default function IDCardPage() {
  const { user } = useAuth();
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef(null);

  useEffect(() => {
    api.get('/users/me/id-card').then(r => setCardData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const downloadCard = () => {
    // Simple print/save as PDF
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>ID Card - ${cardData?.name}</title>
      <style>
        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; font-family: 'Inter', 'Segoe UI', sans-serif; }
        .card { width: 340px; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
        .card-top { background: linear-gradient(135deg, #6366F1, #8B5CF6); padding: 24px 20px 16px; text-align: center; color: #fff; }
        .card-top h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 1px; }
        .card-top p { margin: 4px 0 0; font-size: 10px; opacity: 0.8; }
        .avatar { width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.2); border: 3px solid #fff; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 24px; font-weight: 800; margin: 12px auto; }
        .name { font-size: 18px; font-weight: 800; margin: 0; }
        .title { font-size: 11px; opacity: 0.9; margin: 2px 0 0; }
        .id-badge { display: inline-block; padding: 3px 12px; border-radius: 12px; background: rgba(255,255,255,0.2); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; margin-top: 8px; }
        .card-body { background: #fff; padding: 20px; }
        .field { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .field-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
        .field-value { font-size: 11px; color: #1e293b; font-weight: 600; text-align: right; }
        .card-footer { background: #f8fafc; padding: 10px 20px; text-align: center; font-size: 8px; color: #94a3b8; }
        @media print { body { background: #fff; } .card { box-shadow: none; } }
      </style></head><body>
      <div class="card">
        <div class="card-top">
          <h1>${(cardData?.company?.name || 'Avadeti Media').toUpperCase()}</h1>
          <p>${cardData?.company?.address || ''}</p>
          <div class="avatar">${cardData?.avatar ? `<img src="${cardData.avatar.startsWith('http') ? cardData.avatar : window.location.origin + cardData.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />` : (cardData?.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
          <p class="name">${cardData?.name || ''}</p>
          <p class="title">${cardData?.jobTitle || cardData?.role || ''}</p>
          <div class="id-badge">${cardData?.employeeId || ''}</div>
        </div>
        <div class="card-body">
          <div class="field"><span class="field-label">Employee ID</span><span class="field-value">${cardData?.employeeId || '—'}</span></div>
          <div class="field"><span class="field-label">Email</span><span class="field-value">${cardData?.email || '—'}</span></div>
          <div class="field"><span class="field-label">Phone</span><span class="field-value">${cardData?.phone || '—'}</span></div>
          <div class="field"><span class="field-label">Office</span><span class="field-value">${cardData?.office?.name || '—'}</span></div>
          <div class="field"><span class="field-label">Teams</span><span class="field-value">${(cardData?.teams || []).map(t => t.name).join(', ') || '—'}</span></div>
          <div class="field"><span class="field-label">Work Type</span><span class="field-value">${(cardData?.workType || '').replace('_', ' ')}</span></div>
          <div class="field"><span class="field-label">Joined</span><span class="field-value">${cardData?.dateOfJoining ? new Date(cardData.dateOfJoining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          <div class="field"><span class="field-label">DOB</span><span class="field-value">${cardData?.dateOfBirth ? new Date(cardData.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          <div class="field"><span class="field-label">Blood Group</span><span class="field-value">${cardData?.bloodGroup || '—'}</span></div>
          <div class="field"><span class="field-label">Address</span><span class="field-value">${cardData?.address || '—'}</span></div>
          <div class="field"><span class="field-label">Emergency Contact</span><span class="field-value">${cardData?.emergencyContact || '—'}</span></div>
        </div>
        <div class="card-footer">This ID card is the property of ${cardData?.company?.name || 'Avadeti Media'}. If found, please return to the nearest office.</div>
      </div>
      <script>setTimeout(() => window.print(), 500);</script>
      </body></html>
    `);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Loading...</div>;
  if (!cardData) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Could not load ID card data.</div>;

  const initials = (cardData.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2);
  const grad = GRADIENTS[(cardData.name || '').charCodeAt(0) % GRADIENTS.length];

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <div className="page-title">ID Card</div>
          <div className="page-subtitle">Your employee identification</div>
        </div>
        <button className="btn btn-primary-sm" onClick={downloadCard}>Print / Download</button>
      </div>

      {/* ID Card */}
      <div ref={cardRef} style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid var(--line)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', padding: '28px 24px 20px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>{cardData.company?.name || 'Avadeti Media'}</div>
          {cardData.company?.address && <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 12 }}>{cardData.company.address}</div>}
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            border: '3px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 auto 10px', overflow: 'hidden'
          }}>
            {cardData.avatar ? (
              <img src={cardData.avatar.startsWith('http') ? cardData.avatar : cardData.avatar}
                alt={cardData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : initials}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{cardData.name}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            {cardData.jobTitle || (cardData.role === 'main_admin' ? 'Main Admin' : cardData.role === 'admin' ? cardData.adminTitle || 'Admin' : 'Employee')}
          </div>
          <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
            {cardData.employeeId}
          </div>
        </div>

        {/* Details */}
        <div style={{ background: 'var(--bg-1)', padding: '16px 24px' }}>
          {[
            ['Employee ID', cardData.employeeId],
            ['Email', cardData.email],
            ['Phone', cardData.phone],
            ['Office', cardData.office?.name],
            ['Teams', (cardData.teams || []).map(t => t.name).join(', ')],
            ['Work Type', (cardData.workType || '').replace(/_/g, ' ')],
            ['Joined', cardData.dateOfJoining ? new Date(cardData.dateOfJoining).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null],
            ['Date of Birth', cardData.dateOfBirth ? new Date(cardData.dateOfBirth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null],
            ['Blood Group', cardData.bloodGroup],
            ['Address', cardData.address],
            ['Emergency Contact', cardData.emergencyContact],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>{value || '—'}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ background: 'var(--glass)', padding: '8px 24px', textAlign: 'center', fontSize: 9, color: 'var(--ink-4)' }}>
          This ID card is the property of {cardData.company?.name || 'Avadeti Media'}. If found, please return to the nearest office.
        </div>
      </div>

      {/* Login info */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Login Credentials</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Employee ID</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', fontFamily: 'JetBrains Mono, monospace' }}>{cardData.employeeId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Email (for login)</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{cardData.email}</span>
        </div>
      </div>
    </div>
  );
}
