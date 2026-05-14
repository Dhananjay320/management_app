import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import api from '../services/api';
import '../styles/salary.css';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount || 0);
}

export default function SalaryPage() {
  const { user } = useAuth();
  const { adminMode } = useOutletContext() || {};

  const [tab, setTab] = useState('summary');
  const [year, setYear] = useState(2026);
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeForm, setDisputeForm] = useState({ month: '', year: 2026, whatIsWrong: '', description: '' });
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState({ employee: '', amount: '', reason: '' });
  const [allEmployees, setAllEmployees] = useState([]);

  const loadRecords = useCallback(async () => {
    try {
      const { data } = await api.get('/salary/monthly', { params: { year } });
      setRecords(data);
      if (data.length > 0 && !selectedRecord) setSelectedRecord(data[0]);
    } catch {}
  }, [year, selectedRecord]);

  const loadDisputes = useCallback(async () => {
    try {
      const params = {};
      if (adminMode && user.role !== 'employee') params.all = 'true';
      const { data } = await api.get('/salary/disputes', { params });
      setDisputes(data);
    } catch {}
  }, [adminMode, user.role]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const raiseDispute = async () => {
    if (!disputeForm.month || !disputeForm.whatIsWrong.trim() || !disputeForm.description.trim()) return;
    try {
      await api.post('/salary/disputes', {
        month: parseInt(disputeForm.month),
        year: disputeForm.year,
        whatIsWrong: disputeForm.whatIsWrong,
        description: disputeForm.description
      });
      setShowDisputeForm(false);
      setDisputeForm({ month: '', year: 2026, whatIsWrong: '', description: '' });
      loadDisputes();
    } catch {}
  };

  const loadEmployees = async () => {
    try { const { data } = await api.get('/users/directory'); setAllEmployees(data); } catch {}
  };

  const awardBonus = async () => {
    if (!bonusForm.employee || !bonusForm.amount || !bonusForm.reason.trim()) return;
    try {
      await api.post('/salary/bonus', {
        userId: bonusForm.employee,
        amount: parseFloat(bonusForm.amount),
        reason: bonusForm.reason.trim()
      });
      setShowBonusForm(false);
      setBonusForm({ employee: '', amount: '', reason: '' });
      loadRecords();
    } catch {}
  };

  const resolveDispute = async (id, status, text) => {
    try {
      await api.put(`/salary/disputes/${id}`, {
        status,
        resolution: status === 'resolved' ? text : undefined,
        rejectionReason: status === 'rejected' ? text : undefined
      });
      loadDisputes();
    } catch {}
  };

  return (
    <div className="sal-layout">
      <div className="sal-header">
        <h2>Salary Summary</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {adminMode && user.role !== 'employee' && (
            <>
              <button className="sal-detail-btn primary" onClick={() => { setShowBonusForm(true); loadEmployees(); }}>
                Award Bonus
              </button>
              <button className="sal-detail-btn primary" style={{ background: 'linear-gradient(135deg,#10B981,#06B6D4)' }}
                onClick={async () => {
                  const now = new Date();
                  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
                  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                  if (!window.confirm(`Generate salary records for ${prevMonth}/${prevYear} for all employees?`)) return;
                  try {
                    const r = await api.post('/salary/generate-all', { month: prevMonth, year: prevYear });
                    alert(`✓ Generated ${r.data.generated || 0}/${r.data.total || 0} (${r.data.failed || 0} failed)`);
                    loadRecords();
                  } catch (e) {
                    alert('Failed: ' + (e.response?.data?.error || e.message));
                  }
                }}>
                ⚙️ Generate Now
              </button>
            </>
          )}
          <select className="sal-year-select" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="sal-tabs">
        <button className={`sal-tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>Monthly Summary</button>
        <button className={`sal-tab ${tab === 'disputes' ? 'active' : ''}`} onClick={() => setTab('disputes')}>
          Disputes {disputes.filter(d => d.status === 'open').length > 0 && `(${disputes.filter(d => d.status === 'open').length})`}
        </button>
      </div>

      {tab === 'summary' && (
        <>
          {/* Month Cards */}
          {records.length === 0 ? (
            <div className="sal-empty">
              <div className="sal-empty-icon">💰</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No salary records</h3>
              <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Salary records for {year} will appear here once generated by admin.</p>
            </div>
          ) : (
            <>
              <div className="sal-grid">
                {records.map(r => (
                  <div
                    key={r._id}
                    className={`sal-card ${selectedRecord?._id === r._id ? 'active' : ''}`}
                    onClick={() => setSelectedRecord(r)}
                  >
                    <div className="sal-card-header">
                      <span className="sal-card-month">{MONTHS[r.month]} {r.year}</span>
                      <span className={`sal-card-status ${r.status}`}>{r.status}</span>
                    </div>
                    <div className="sal-card-net">
                      <span className="currency">INR </span>{formatCurrency(r.netSalary)}
                    </div>
                    <div className="sal-card-breakdown">
                      <div className="sal-card-row">
                        <span className="sal-card-row-label">Base</span>
                        <span className="sal-card-row-value">INR {formatCurrency(r.baseSalary)}</span>
                      </div>
                      {r.totalDeductions > 0 && (
                        <div className="sal-card-row">
                          <span className="sal-card-row-label">Deductions</span>
                          <span className="sal-card-row-value deduction">- INR {formatCurrency(r.totalDeductions)}</span>
                        </div>
                      )}
                      <div className="sal-card-row">
                        <span className="sal-card-row-label">Tax</span>
                        <span className="sal-card-row-value deduction">- INR {formatCurrency(r.totalTax)}</span>
                      </div>
                      {r.totalBonuses > 0 && (
                        <div className="sal-card-row">
                          <span className="sal-card-row-label">Bonuses</span>
                          <span className="sal-card-row-value bonus">+ INR {formatCurrency(r.totalBonuses)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Detail */}
              {selectedRecord && (
                <div className="sal-detail">
                  <div className="sal-detail-header">
                    <span className="sal-detail-title">
                      {MONTHS[selectedRecord.month]} {selectedRecord.year} — Full Breakdown
                    </span>
                    <div className="sal-detail-actions">
                      <button className="sal-detail-btn" onClick={async () => {
                        try {
                          const response = await api.get(`/salary/monthly/${user._id}/${selectedRecord.year}/${selectedRecord.month}/pdf`, { responseType: 'blob' });
                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `salary_${MONTHS[selectedRecord.month]}_${selectedRecord.year}.txt`;
                          a.click();
                          window.URL.revokeObjectURL(url);
                        } catch {}
                      }}>
                        📄 Download Payslip
                      </button>
                      <button className="sal-detail-btn" onClick={() => setShowDisputeForm(true)}>
                        ⚠️ Raise Dispute
                      </button>
                    </div>
                  </div>

                  {/* Attendance Summary */}
                  <div className="sal-attendance">
                    <div className="sal-att-item">
                      <div className="sal-att-value">{selectedRecord.workingDays}</div>
                      <div className="sal-att-label">Working Days</div>
                    </div>
                    <div className="sal-att-item present">
                      <div className="sal-att-value">{selectedRecord.presentDays}</div>
                      <div className="sal-att-label">Present</div>
                    </div>
                    <div className="sal-att-item absent">
                      <div className="sal-att-value">{selectedRecord.absentDays}</div>
                      <div className="sal-att-label">Absent</div>
                    </div>
                    <div className="sal-att-item">
                      <div className="sal-att-value">{selectedRecord.halfDays}</div>
                      <div className="sal-att-label">Half Days</div>
                    </div>
                    <div className="sal-att-item">
                      <div className="sal-att-value">{selectedRecord.leaveDays}</div>
                      <div className="sal-att-label">Leaves</div>
                    </div>
                  </div>

                  {/* Breakdown Table */}
                  <table className="sal-table">
                    <thead>
                      <tr><th>Component</th><th>Details</th><th style={{ textAlign: 'right' }}>Amount (INR)</th></tr>
                    </thead>
                    <tbody>
                      {/* Earnings */}
                      <tr className="section-header"><td colSpan="3">Earnings</td></tr>
                      <tr>
                        <td>Base Salary</td>
                        <td>Monthly base</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(selectedRecord.baseSalary)}</td>
                      </tr>

                      {/* Deductions */}
                      {selectedRecord.deductions?.length > 0 && (
                        <>
                          <tr className="section-header"><td colSpan="3">Deductions</td></tr>
                          {selectedRecord.deductions.map((d, i) => (
                            <tr key={i}>
                              <td>{d.name}</td>
                              <td>{d.count} day(s)</td>
                              <td style={{ textAlign: 'right' }} className="deduction">- {formatCurrency(d.amount)}</td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* Tax */}
                      <tr className="section-header"><td colSpan="3">Tax Deductions</td></tr>
                      {selectedRecord.tds > 0 && <tr><td>TDS</td><td>Tax Deducted at Source</td><td style={{ textAlign: 'right' }} className="deduction">- {formatCurrency(selectedRecord.tds)}</td></tr>}
                      {selectedRecord.pf > 0 && <tr><td>PF</td><td>Provident Fund</td><td style={{ textAlign: 'right' }} className="deduction">- {formatCurrency(selectedRecord.pf)}</td></tr>}
                      {selectedRecord.esi > 0 && <tr><td>ESI</td><td>Employee State Insurance</td><td style={{ textAlign: 'right' }} className="deduction">- {formatCurrency(selectedRecord.esi)}</td></tr>}

                      {/* Bonuses */}
                      {selectedRecord.totalBonuses > 0 && (
                        <>
                          <tr className="section-header"><td colSpan="3">Bonuses</td></tr>
                          {selectedRecord.fixedBonus > 0 && (
                            <tr><td>Fixed Bonus</td><td>Monthly fixed</td><td style={{ textAlign: 'right' }} className="bonus">+ {formatCurrency(selectedRecord.fixedBonus)}</td></tr>
                          )}
                          {selectedRecord.performanceBonuses?.map((b, i) => (
                            <tr key={i}><td>{b.name}</td><td>Performance rule</td><td style={{ textAlign: 'right' }} className="bonus">+ {formatCurrency(b.amount)}</td></tr>
                          ))}
                        </>
                      )}

                      {/* Net */}
                      <tr className="total-row">
                        <td>Net Salary</td>
                        <td></td>
                        <td style={{ textAlign: 'right' }} className="net-amount">INR {formatCurrency(selectedRecord.netSalary)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'disputes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="sal-detail-btn primary" onClick={() => setShowDisputeForm(true)}>
              + Raise Dispute
            </button>
          </div>

          {disputes.length === 0 ? (
            <div className="sal-empty">
              <div className="sal-empty-icon">✅</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No disputes</h3>
              <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>All salary records look good. Raise a dispute if something seems incorrect.</p>
            </div>
          ) : (
            disputes.map(d => (
              <div key={d._id} className="sal-dispute-card">
                <div className="sal-dispute-header">
                  <span className="sal-dispute-month">
                    {MONTHS[d.month]} {d.year}
                    {d.user && d.user._id !== user._id && ` — ${d.user.name}`}
                  </span>
                  <span className={`sal-dispute-status ${d.status}`}>{d.status}</span>
                </div>
                <div className="sal-dispute-issue">{d.whatIsWrong}</div>
                <div className="sal-dispute-desc">{d.description}</div>
                {d.resolution && (
                  <div className="sal-dispute-resolution">
                    <strong>Resolution:</strong> {d.resolution}
                    {d.resolvedBy && ` — by ${d.resolvedBy.name}`}
                  </div>
                )}
                {d.rejectionReason && (
                  <div className="sal-dispute-resolution">
                    <strong>Rejected:</strong> {d.rejectionReason}
                  </div>
                )}
                {/* Admin resolve/reject buttons */}
                {adminMode && d.status === 'open' && user.role !== 'employee' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      className="sal-detail-btn primary"
                      onClick={() => {
                        const resolution = prompt('Resolution note:');
                        if (resolution) resolveDispute(d._id, 'resolved', resolution);
                      }}
                    >
                      Resolve
                    </button>
                    <button
                      className="sal-detail-btn"
                      onClick={() => {
                        const reason = prompt('Rejection reason:');
                        if (reason) resolveDispute(d._id, 'rejected', reason);
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {/* Bonus Award Modal */}
      {showBonusForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowBonusForm(false)}>
          <div className="sal-dispute-form" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <h4>Award Bonus</h4>
            <div className="sal-form-group">
              <label>Employee *</label>
              <select value={bonusForm.employee} onChange={e => setBonusForm(prev => ({ ...prev, employee: e.target.value }))}>
                <option value="">Select employee...</option>
                {allEmployees.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
            <div className="sal-form-group">
              <label>Amount (INR) *</label>
              <input type="number" min="0" value={bonusForm.amount}
                onChange={e => setBonusForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="e.g. 5000" />
            </div>
            <div className="sal-form-group">
              <label>Reason *</label>
              <textarea value={bonusForm.reason}
                onChange={e => setBonusForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Reason for the bonus..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sal-detail-btn" onClick={() => setShowBonusForm(false)}>Cancel</button>
              <button className="sal-form-submit" onClick={awardBonus}
                disabled={!bonusForm.employee || !bonusForm.amount || !bonusForm.reason.trim()}>
                Award Bonus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Form Modal */}
      {showDisputeForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowDisputeForm(false)}
        >
          <div className="sal-dispute-form" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <h4>Raise Salary Dispute</h4>
            <div className="sal-form-group">
              <label>Month *</label>
              <select value={disputeForm.month} onChange={e => setDisputeForm(prev => ({ ...prev, month: e.target.value }))}>
                <option value="">Select month</option>
                {MONTHS.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="sal-form-group">
              <label>What is wrong? *</label>
              <input
                value={disputeForm.whatIsWrong}
                onChange={e => setDisputeForm(prev => ({ ...prev, whatIsWrong: e.target.value }))}
                placeholder="e.g., Absent days count incorrect"
              />
            </div>
            <div className="sal-form-group">
              <label>Description *</label>
              <textarea
                value={disputeForm.description}
                onChange={e => setDisputeForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Explain what seems wrong..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sal-detail-btn" onClick={() => setShowDisputeForm(false)}>Cancel</button>
              <button
                className="sal-form-submit"
                onClick={raiseDispute}
                disabled={!disputeForm.month || !disputeForm.whatIsWrong.trim() || !disputeForm.description.trim()}
              >
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
