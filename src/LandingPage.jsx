import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Brain, BarChart3, Building2, CheckCircle, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';

const HARDCODED_USERNAME = 'lender';
const HARDCODED_PASSWORD = 'finsight2025';

const FEATURES = [
  {
    icon: BarChart3,
    title: '7-Ratio Scoring Engine',
    desc: 'Current Ratio, D/E, EBITDA Margin, ROA, DSCR, Quick Ratio, and ICR — configurable weights with SAMA-aligned benchmarks across 7 sectors.',
  },
  {
    icon: Brain,
    title: 'Altman Z′′-Score Classification',
    desc: 'Private non-manufacturing variant. Classifies bankruptcy risk into Safe, Grey, and Distress zones from balance-sheet data.',
  },
  {
    icon: TrendingUp,
    title: '6-Month Cash Flow Forecast',
    desc: 'Double Exponential Smoothing or ARIMA projection with adaptive confidence bands and LightGBM probability-of-default per month.',
  },
  {
    icon: ShieldCheck,
    title: 'Knockout Disqualifiers',
    desc: 'Hard rules: negative equity, critical liquidity failure (CR < 0.5), negative cash flow with debt, DSCR breach, and ICR below 1.0x.',
  },
  {
    icon: Building2,
    title: 'Industry Benchmarks',
    desc: 'Thresholds calibrated to 7 Saudi sectors: SaaS, Retail, Construction, Logistics, Manufacturing, Tourism, and Healthcare.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('signin');

  // Sign In state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Sign Up state
  const [signupName, setSignupName] = useState('');
  const [signupInstitution, setSignupInstitution] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  // ── Sign In Handler ──
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    setTimeout(() => {
      if (loginUsername === HARDCODED_USERNAME && loginPassword === HARDCODED_PASSWORD) {
        localStorage.setItem('finsight_auth', 'true');
        navigate('/dashboard');
        return;
      }
      const stored = localStorage.getItem('finsight_users');
      if (stored) {
        const users = JSON.parse(stored);
        const match = users.find(u => u.username === loginUsername && u.password === loginPassword);
        if (match) {
          localStorage.setItem('finsight_auth', 'true');
          localStorage.setItem('finsight_current_user', JSON.stringify(match));
          navigate('/dashboard');
          return;
        }
      }
      setLoginError('Invalid username or password.');
      setLoginLoading(false);
    }, 800);
  };

  // ── Sign Up Handler ──
  const handleSignup = (e) => {
    e.preventDefault();
    setSignupLoading(true);
    setSignupError('');
    setSignupSuccess('');
    setTimeout(() => {
      if (signupPassword !== signupConfirm) {
        setSignupError('Passwords do not match.');
        setSignupLoading(false);
        return;
      }
      if (signupPassword.length < 6) {
        setSignupError('Password must be at least 6 characters.');
        setSignupLoading(false);
        return;
      }
      if (signupUsername === HARDCODED_USERNAME) {
        setSignupError('That username is already taken.');
        setSignupLoading(false);
        return;
      }
      const stored = localStorage.getItem('finsight_users');
      const users = stored ? JSON.parse(stored) : [];
      if (users.find(u => u.username === signupUsername)) {
        setSignupError('That username is already taken.');
        setSignupLoading(false);
        return;
      }
      const newUser = {
        name: signupName,
        institution: signupInstitution,
        username: signupUsername,
        password: signupPassword,
        createdAt: new Date().toISOString(),
      };
      users.push(newUser);
      localStorage.setItem('finsight_users', JSON.stringify(users));
      setSignupSuccess('Account created. You can now sign in.');
      setSignupLoading(false);
      setTimeout(() => {
        setActiveTab('signin');
        setLoginUsername(signupUsername);
        setSignupName(''); setSignupInstitution(''); setSignupUsername('');
        setSignupPassword(''); setSignupConfirm(''); setSignupSuccess('');
      }, 1500);
    }, 800);
  };

  // ── Continue as Demo ──
  const handleDemo = () => {
    localStorage.setItem('finsight_auth', 'true');
    navigate('/dashboard');
  };

  // ── Shared input style ──
  const inputCls = 'w-full px-3 py-2.5 text-sm rounded outline-none transition-colors';
  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-sans)',
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>

      {/* Chrome nav bar */}
      <nav className="h-12 flex items-center justify-between px-8 shrink-0"
        style={{ background: 'var(--navy-950)', borderBottom: '1px solid var(--navy-800)' }}>
        <img src="/logo.png" alt="FinSight" className="h-8 w-auto" />
        <span className="r-eyebrow" style={{ color: 'oklch(0.48 0.035 200)' }}>
          IMSIU — Information Systems Department
        </span>
      </nav>

      {/* Main content */}
      <div className="flex-1 max-w-[1320px] mx-auto w-full px-8 py-16
                      grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16 items-start">

        {/* ── Hero ── */}
        <div>
          <p className="r-eyebrow mb-5">Credit Assessment Platform</p>
          <h1 className="text-4xl font-bold leading-tight mb-5">
            SME Credit Decisions for Saudi Financial Institutions
          </h1>
          <p className="text-base leading-relaxed mb-12"
            style={{ color: 'var(--ink-muted)', maxWidth: '520px' }}>
            FinSight scores loan applications using ratio analysis, Altman
            Z''-Score bankruptcy modeling, 6-month cash flow forecasting, and
            probability-of-default classification. Designed for SAMA-aligned
            credit analysis.
          </p>

          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-4 r-panel">
                <div className="p-2 rounded shrink-0 mt-0.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                  <Icon className="h-4 w-4" style={{ color: 'var(--signal)' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Auth Card ── */}
        <div className="r-panel overflow-hidden">

          {/* Tab switcher */}
          <div className="grid grid-cols-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
            {[
              { key: 'signin', label: 'Sign In' },
              { key: 'signup', label: 'Create Account' },
            ].map(({ key, label }) => (
              <button key={key}
                onClick={() => { setActiveTab(key); setLoginError(''); setSignupError(''); setSignupSuccess(''); }}
                className="py-3.5 text-sm font-semibold transition-colors"
                style={{
                  background: activeTab === key ? 'var(--panel)' : 'var(--surface)',
                  color: activeTab === key ? 'var(--ink)' : 'var(--ink-faint)',
                  borderBottom: activeTab === key ? '2px solid var(--signal)' : '2px solid transparent',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-7">

            {/* ── Sign In ── */}
            {activeTab === 'signin' && (
              <>
                <div className="mb-6">
                  <h2 className="text-base font-bold mb-1">Welcome back</h2>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Sign in to FinSight</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="r-eyebrow block mb-2">Username</label>
                    <input type="text" value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className={inputCls} style={inputStyle}
                      placeholder="Enter username" required />
                  </div>
                  <div>
                    <label className="r-eyebrow block mb-2">Password</label>
                    <div className="relative">
                      <input type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputCls} style={{ ...inputStyle, paddingRight: '2.5rem' }}
                        placeholder="Enter password" required />
                      <button type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ink-faint)' }}>
                        {showLoginPassword
                          ? <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                          : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <p className="text-xs px-3 py-2 rounded"
                      style={{ background: 'var(--danger-tint)', color: 'var(--danger)', border: '1px solid color-mix(in oklch, var(--danger) 20%, transparent)' }}>
                      {loginError}
                    </p>
                  )}

                  <button type="submit" disabled={loginLoading}
                    className="r-btn-primary w-full py-2.5 text-sm">
                    {loginLoading
                      ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />Signing in...</>
                      : <>Sign in <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></>}
                  </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                </div>

                {/* Continue as Demo */}
                <button onClick={handleDemo}
                  className="r-btn-ghost w-full py-2.5 text-sm">
                  Continue as Demo
                </button>

                <p className="text-center text-xs mt-5" style={{ color: 'var(--ink-faint)' }}>
                  No account?{' '}
                  <button onClick={() => setActiveTab('signup')}
                    className="font-semibold" style={{ color: 'var(--signal)' }}>
                    Create one
                  </button>
                </p>
              </>
            )}

            {/* ── Sign Up ── */}
            {activeTab === 'signup' && (
              <>
                <div className="mb-6">
                  <h2 className="text-base font-bold mb-1">Create an account</h2>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Register your institution's access</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                  {[
                    { label: 'Full Name',    field: 'name',        value: signupName,        onChange: setSignupName,        placeholder: 'Ahmed Al-Rashidi', type: 'text' },
                    { label: 'Institution',  field: 'institution', value: signupInstitution, onChange: setSignupInstitution, placeholder: 'Al Rajhi Bank',    type: 'text' },
                    { label: 'Username',     field: 'username',    value: signupUsername,    onChange: setSignupUsername,    placeholder: 'Choose a username', type: 'text' },
                  ].map(({ label, value, onChange, placeholder, type }) => (
                    <div key={label}>
                      <label className="r-eyebrow block mb-2">{label}</label>
                      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
                        className={inputCls} style={inputStyle} placeholder={placeholder} required />
                    </div>
                  ))}

                  <div>
                    <label className="r-eyebrow block mb-2">Password</label>
                    <div className="relative">
                      <input type={showSignupPassword ? 'text' : 'password'}
                        value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)}
                        className={inputCls} style={{ ...inputStyle, paddingRight: '2.5rem' }}
                        placeholder="Min. 6 characters" required />
                      <button type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ink-faint)' }}>
                        {showSignupPassword
                          ? <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                          : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="r-eyebrow block mb-2">Confirm Password</label>
                    <input type="password" value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      className={inputCls} style={inputStyle}
                      placeholder="Repeat your password" required />
                  </div>

                  {signupError && (
                    <p className="text-xs px-3 py-2 rounded"
                      style={{ background: 'var(--danger-tint)', color: 'var(--danger)', border: '1px solid color-mix(in oklch, var(--danger) 20%, transparent)' }}>
                      {signupError}
                    </p>
                  )}
                  {signupSuccess && (
                    <p className="text-xs px-3 py-2 rounded flex items-center gap-2"
                      style={{ background: 'var(--safe-tint)', color: 'var(--safe)', border: '1px solid color-mix(in oklch, var(--safe) 20%, transparent)' }}>
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />{signupSuccess}
                    </p>
                  )}

                  <button type="submit" disabled={signupLoading}
                    className="r-btn-primary w-full py-2.5 text-sm">
                    {signupLoading
                      ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />Creating account...</>
                      : <>Create Account <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></>}
                  </button>
                </form>

                <p className="text-center text-xs mt-5" style={{ color: 'var(--ink-faint)' }}>
                  Already have an account?{' '}
                  <button onClick={() => setActiveTab('signin')}
                    className="font-semibold" style={{ color: 'var(--signal)' }}>
                    Sign in
                  </button>
                </p>
              </>
            )}

          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="px-8 py-4 text-center" style={{ borderTop: '1px solid var(--hairline)' }}>
        <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          FinSight &copy; 2026 &mdash; Graduation Project, Information Systems Department, IMSIU
        </p>
      </footer>

    </div>
  );
}
