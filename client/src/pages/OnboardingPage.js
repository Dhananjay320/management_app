import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import '../styles/onboarding.css';

const TOTAL_STEPS = 6; // 0A, 0B, 1, 2, 3, 4

const INTRO_FEATURES = [
  { icon: '📅', text: '<strong>Calendar</strong> — Your central hub. Tasks, meetings, leaves, and activities all in one view.' },
  { icon: '💬', text: '<strong>Messaging</strong> — Channels, DMs, rooms, reactions, threads. Real-time team communication.' },
  { icon: '✅', text: '<strong>Tasks</strong> — Assign, track, and complete work with priorities, deadlines, and progress.' },
  { icon: '👥', text: '<strong>Meetings</strong> — Create, manage, and follow up with built-in MoM and task creation.' },
  { icon: '📁', text: '<strong>Workspace</strong> — Documents, notes, files, and links organized by project.' },
  { icon: '✉️', text: '<strong>Email</strong> — Send and receive company emails without leaving the app.' },
];

const DEFAULT_SETTINGS = {
  calendarDefaultView: 'weekly',
  meetingReminder: 10,
  wrapUpFrequency: 30,
  autoWrapUpTime: '20:00',
  notificationSound: true,
  messagePreview: true,
  autoDND: true,
  autoStatusMeeting: true,
  autoStatusLeave: true,
  autoStatusWFH: true,
  mentionBreaksDND: true,
  broadcastDefault: 'hidden'
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [profile, setProfile] = useState({ phone: '', statusMessage: '' });
  const [checklist, setChecklist] = useState({
    profile: false, calendar: false, feed: false, tasks: false, spaces: false
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [companyRes, statusRes] = await Promise.all([
          api.get('/onboarding/company'),
          api.get('/onboarding/status')
        ]);
        setCompany(companyRes.data);
        setUserInfo(statusRes.data.user);
        if (statusRes.data.user?.phone) setProfile(prev => ({ ...prev, phone: statusRes.data.user.phone }));
        if (statusRes.data.user?.statusMessage) setProfile(prev => ({ ...prev, statusMessage: statusRes.data.user.statusMessage }));
      } catch {}
    };
    load();
  }, []);

  const nextStep = () => setStep(prev => Math.min(prev + 1, TOTAL_STEPS - 1));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 0));

  const saveSettings = async () => {
    try {
      await api.put('/onboarding/settings', { settings });
    } catch {}
    nextStep();
  };

  const saveProfile = async () => {
    try {
      await api.put('/onboarding/profile', profile);
    } catch {}
    nextStep();
  };

  const completeOnboarding = async () => {
    try {
      await api.put('/onboarding/complete');
    } catch {}
    navigate('/');
  };

  const getInitials = (name) => (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="onb-layout">
      <div className="onb-container">
        <div className="onb-progress">
          <div className="onb-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Step 0A: App Introduction */}
        {step === 0 && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">🚀</div>
              <h2>Welcome to Avadeti Team</h2>
              <p>Your complete company management platform. Everything your team needs in one place.</p>
              <div className="onb-slides">
                {INTRO_FEATURES.map((f, i) => (
                  <div key={i} className="onb-slide-item">
                    <span className="onb-slide-icon">{f.icon}</span>
                    <span className="onb-slide-text" dangerouslySetInnerHTML={{ __html: f.text }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-skip" onClick={completeOnboarding}>Skip all</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={nextStep}>Next</button>
            </div>
          </>
        )}

        {/* Step 0B: Company Card */}
        {step === 1 && company && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">🏢</div>
              <h2>Your Company</h2>
              <p>Here's your company information. You can access this anytime from settings.</p>
              <div className="onb-company-card">
                <div className="onb-company-name">{company.name}</div>
                {company.tagline && <div className="onb-company-tagline">{company.tagline}</div>}
                {company.about && <div className="onb-company-about">{company.about}</div>}
                <div className="onb-company-details">
                  {company.email && <div className="onb-company-detail">✉️ {company.email}</div>}
                  {company.phone && <div className="onb-company-detail">📞 {company.phone}</div>}
                  {company.address && <div className="onb-company-detail">📍 {company.address}</div>}
                  {company.website && <div className="onb-company-detail">🌐 {company.website}</div>}
                </div>
                {(company.social?.linkedin || company.social?.twitter) && (
                  <div className="onb-company-social">
                    {company.social.linkedin && <a href={company.social.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                    {company.social.twitter && <a href={company.social.twitter} target="_blank" rel="noreferrer">Twitter</a>}
                    {company.social.instagram && <a href={company.social.instagram} target="_blank" rel="noreferrer">Instagram</a>}
                  </div>
                )}
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-back" onClick={prevStep}>Back</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={nextStep}>Next</button>
            </div>
          </>
        )}

        {/* Step 1: Welcome Screen */}
        {step === 2 && userInfo && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">👋</div>
              <h2>Welcome, <span className="onb-welcome-name">{userInfo.name?.split(' ')[0]}</span>!</h2>
              <p>{company?.welcomeMessage || 'We\'re excited to have you on the team.'}</p>
              <div className="onb-welcome-info">
                <div className="onb-welcome-row">
                  <span className="onb-welcome-row-label">Role</span>
                  <span className="onb-welcome-row-value">{userInfo.role === 'main_admin' ? 'Main Admin' : userInfo.role === 'admin' ? 'Admin' : 'Employee'}</span>
                </div>
                {userInfo.jobTitle && (
                  <div className="onb-welcome-row">
                    <span className="onb-welcome-row-label">Title</span>
                    <span className="onb-welcome-row-value">{userInfo.jobTitle}</span>
                  </div>
                )}
                {userInfo.teams?.length > 0 && (
                  <div className="onb-welcome-row">
                    <span className="onb-welcome-row-label">Team</span>
                    <span className="onb-welcome-row-value">{userInfo.teams.map(t => t.name).join(', ')}</span>
                  </div>
                )}
                {userInfo.manager && (
                  <div className="onb-welcome-row">
                    <span className="onb-welcome-row-label">Manager</span>
                    <span className="onb-welcome-row-value">{userInfo.manager.name}</span>
                  </div>
                )}
                {userInfo.office && (
                  <div className="onb-welcome-row">
                    <span className="onb-welcome-row-label">Office</span>
                    <span className="onb-welcome-row-value">{userInfo.office.name}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-back" onClick={prevStep}>Back</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={nextStep}>Next</button>
            </div>
          </>
        )}

        {/* Step 2: Default Settings */}
        {step === 3 && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">⚙️</div>
              <h2>Your Preferences</h2>
              <p>We've set suggested defaults. Adjust anything you like, or skip to accept all defaults.</p>
              <div className="onb-settings">
                <div className="onb-setting-row">
                  <span className="onb-setting-label">Calendar default view</span>
                  <div className="onb-setting-control">
                    <select value={settings.calendarDefaultView} onChange={e => setSettings(prev => ({ ...prev, calendarDefaultView: e.target.value }))}>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                </div>
                <div className="onb-setting-row">
                  <span className="onb-setting-label">Meeting reminder</span>
                  <div className="onb-setting-control">
                    <select value={settings.meetingReminder} onChange={e => setSettings(prev => ({ ...prev, meetingReminder: parseInt(e.target.value) }))}>
                      <option value={5}>5 min before</option>
                      <option value={10}>10 min before</option>
                      <option value={15}>15 min before</option>
                      <option value={30}>30 min before</option>
                    </select>
                  </div>
                </div>
                {[
                  { key: 'notificationSound', label: 'Notification sounds' },
                  { key: 'messagePreview', label: 'Message preview in notifications' },
                  { key: 'autoDND', label: 'Auto DND when meeting starts' },
                  { key: 'autoStatusMeeting', label: 'Auto status: In a Meeting' },
                  { key: 'autoStatusLeave', label: 'Auto status: On Leave' },
                  { key: 'autoStatusWFH', label: 'Auto status: Working from Home' },
                  { key: 'mentionBreaksDND', label: '@Mention breaks DND' },
                ].map(s => (
                  <div key={s.key} className="onb-setting-row">
                    <span className="onb-setting-label">{s.label}</span>
                    <div
                      className={`onb-toggle ${settings[s.key] ? 'on' : ''}`}
                      onClick={() => setSettings(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                    >
                      <div className="onb-toggle-knob" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-skip" onClick={nextStep}>Skip (use defaults)</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={saveSettings}>Save & Continue</button>
            </div>
          </>
        )}

        {/* Step 3: Profile Setup */}
        {step === 4 && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">👤</div>
              <h2>Set Up Your Profile</h2>
              <p>Let your team know who you are.</p>
              <div className="onb-profile">
                <div className="onb-avatar-upload">
                  {getInitials(user?.name)}
                  <div className="onb-avatar-edit">📷</div>
                </div>
                <div className="onb-form-group">
                  <label>Phone number</label>
                  <input
                    value={profile.phone}
                    onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="onb-form-group">
                  <label>Status message</label>
                  <input
                    value={profile.statusMessage}
                    onChange={e => setProfile(prev => ({ ...prev, statusMessage: e.target.value }))}
                    placeholder="What are you working on?"
                  />
                </div>
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-back" onClick={prevStep}>Back</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={saveProfile}>Save & Continue</button>
            </div>
          </>
        )}

        {/* Step 4: First Steps Checklist */}
        {step === 5 && (
          <>
            <div className="onb-step">
              <div className="onb-step-icon">🎯</div>
              <h2>Getting Started</h2>
              <p>Here are a few things to explore. You can always come back to these later.</p>
              <div className="onb-checklist">
                {[
                  { key: 'profile', label: 'Complete your profile', icon: '👤', path: '/profile' },
                  { key: 'calendar', label: 'Check your calendar', icon: '📅', path: '/' },
                  { key: 'feed', label: 'Say hi on Team Feed', icon: '📰', path: '/feed' },
                  { key: 'tasks', label: 'Check your tasks', icon: '✅', path: '/tasks' },
                  { key: 'spaces', label: 'Explore Messaging', icon: '💬', path: '/messages' },
                ].map(item => (
                  <div
                    key={item.key}
                    className={`onb-check-item ${checklist[item.key] ? 'done' : ''}`}
                    onClick={() => {
                      setChecklist(prev => ({ ...prev, [item.key]: true }));
                      if (item.path) { completeOnboarding().then(() => navigate(item.path)); }
                    }}
                  >
                    <div className="onb-check-box">{checklist[item.key] ? '✓' : ''}</div>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="onb-footer">
              <button className="onb-back" onClick={prevStep}>Back</button>
              <div className="onb-step-dots">
                {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                  <div key={i} className={`onb-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
                ))}
              </div>
              <button className="onb-next" onClick={completeOnboarding}>Get Started!</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
