import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

export default function OfficeManager() {
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', wifiSubnet: '', radiusMeters: 100, address: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/teams/offices');
      setOffices(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ name: '', lat: '', lng: '', wifiSubnet: '', radiusMeters: 100, address: '' });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (office) => {
    setForm({
      name: office.name,
      lat: office.lat,
      lng: office.lng,
      wifiSubnet: office.wifiSubnet,
      radiusMeters: office.radiusMeters || 100,
      address: office.address || ''
    });
    setEditing(office._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, lat: Number(form.lat), lng: Number(form.lng), radiusMeters: Number(form.radiusMeters) };
      if (editing) {
        await api.put(`/teams/offices/${editing}`, payload);
      } else {
        await api.post('/teams/offices', payload);
      }
      resetForm();
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save office.');
    } finally { setSaving(false); }
  };

  const deleteOffice = async (id) => {
    if (!window.confirm('Deactivate this office?')) return;
    await api.delete(`/teams/offices/${id}`);
    load();
  };

  const getMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
      () => alert('Could not get your location. Allow GPS permission and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Office Locations</div>
          <div className="page-subtitle">{offices.length} offices configured</div>
        </div>
        <button className="btn btn-primary-sm" onClick={() => { resetForm(); setShowForm(true); }}>+ Add Office</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 600 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
              {editing ? 'Edit Office' : 'Add New Office'}
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Office Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hyderabad HQ" required className="ad-input" />
              </div>
              <div className="form-field">
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Business Park, City" className="ad-input" />
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10 }}>
              📍 GPS Coordinates (for 100m geofence check)
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Latitude *</label>
                <input type="number" step="any" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="17.385044" required className="ad-input" />
              </div>
              <div className="form-field">
                <label>Longitude *</label>
                <input type="number" step="any" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="78.486671" required className="ad-input" />
              </div>
            </div>
            <button type="button" onClick={getMyLocation} className="btn btn-ghost" style={{ marginBottom: 14, fontSize: 11 }}>
              📍 Use My Current Location
            </button>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10 }}>
              📶 WiFi Subnet (Layer 1 check — first 3 octets)
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>WiFi Subnet *</label>
                <input value={form.wifiSubnet} onChange={e => setForm(f => ({ ...f, wifiSubnet: e.target.value }))} placeholder="192.168.1" required className="ad-input" />
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>First 3 octets of office WiFi IP (e.g. 192.168.1)</div>
              </div>
              <div className="form-field">
                <label>Radius (meters)</label>
                <input type="number" value={form.radiusMeters} onChange={e => setForm(f => ({ ...f, radiusMeters: e.target.value }))} className="ad-input" />
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>GPS check radius — default 100m</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn btn-primary-sm" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Office' : 'Add Office'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Loading offices...</div>
      ) : offices.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No offices configured</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Add your first office location to enable geofence attendance</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {offices.map(office => (
            <div key={office._id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>🏢 {office.name}</div>
                  {office.address && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{office.address}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => startEdit(office)}>Edit</button>
                  <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => deleteOffice(office._id)}>Remove</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--glass-2)', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>GPS Coordinates</div>
                  <div style={{ fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{office.lat}, {office.lng}</div>
                </div>
                <div style={{ background: 'var(--glass-2)', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>WiFi Subnet</div>
                  <div style={{ fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{office.wifiSubnet}.*</div>
                </div>
                <div style={{ background: 'var(--glass-2)', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>Radius</div>
                  <div style={{ fontSize: 11, color: 'var(--ink)' }}>{office.radiusMeters || 100}m</div>
                </div>
                <div style={{ background: 'var(--glass-2)', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 2 }}>Status</div>
                  <div style={{ fontSize: 11, color: 'var(--emerald)' }}>✓ Active</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
