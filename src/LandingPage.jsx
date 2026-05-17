import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Brain, Eye, EyeOff, ArrowRight, CheckCircle, Building2 } from 'lucide-react';

const HARDCODED_USERNAME = 'lender';
const HARDCODED_PASSWORD = 'finsight2025';

export default function LandingPage() {
  const navigate = useNavigate();

  // Tab state: 'signin' or 'signup'
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
      // Check hardcoded credentials first
      if (loginUsername === HARDCODED_USERNAME && loginPassword === HARDCODED_PASSWORD) {
        localStorage.setItem('finsight_auth', 'true');
        navigate('/dashboard');
        return;
      }

      // Check user-created accounts in localStorage
      const stored = localStorage.getItem('finsight_users');
      if (stored) {
        const users = JSON.parse(stored);
        const match = users.find(
          u => u.username === loginUsername && u.password === loginPassword
        );
        if (match) {
          localStorage.setItem('finsight_auth', 'true');
          localStorage.setItem('finsight_current_user', JSON.stringify(match));
          navigate('/dashboard');
          return;
        }
      }

      setLoginError('Invalid username or password. Please try again.');
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
      // Validation
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

      // Check for duplicate username in existing accounts
      const stored = localStorage.getItem('finsight_users');
      const users  = stored ? JSON.parse(stored) : [];
      if (users.find(u => u.username === signupUsername)) {
        setSignupError('That username is already taken.');
        setSignupLoading(false);
        return;
      }

      // Save new user
      const newUser = {
        name:        signupName,
        institution: signupInstitution,
        username:    signupUsername,
        password:    signupPassword,
        createdAt:   new Date().toISOString()
      };
      users.push(newUser);
      localStorage.setItem('finsight_users', JSON.stringify(users));

      setSignupSuccess('Account created successfully. You can now sign in.');
      setSignupLoading(false);

      // Clear form and switch to sign in after short delay
      setTimeout(() => {
        setActiveTab('signin');
        setLoginUsername(signupUsername);
        setSignupName('');
        setSignupInstitution('');
        setSignupUsername('');
        setSignupPassword('');
        setSignupConfirm('');
        setSignupSuccess('');
      }, 1500);
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Dark Top Section ── */}
      <div className="bg-slate-900">
        <nav className="px-10 py-5 border-b border-slate-800 flex items-center justify-between">
          <img src="/logo.png" alt="FinSight" className="h-20 w-auto" />
          <span className="text-xs text-slate-500 font-medium">
            IMSIU — Information Systems Department
          </span>
        </nav>

        <div className="px-10 pt-16 pb-20 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-800 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 tracking-wide uppercase">
            <Brain className="h-3.5 w-3.5" />
            AI-Powered Credit Assessment
          </div>
          <h1 className="text-5xl font-bold text-white leading-tight mb-4">
            SME Funding Decisions,{' '}
            <span className="text-indigo-400">Automated.</span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-xl mx-auto">
            FinSight is a Decision Support System for Saudi financial institutions —
            upload SME financial data and get a data-driven lending decision in seconds.
          </p>
        </div>
      </div>

      {/* ── White Bottom Section ── */}
      <div className="flex-1 bg-white px-10 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

          {/* ── Features ── */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-6">What FinSight does</h2>
            <div className="space-y-4">
              {[
                { icon: TrendingUp,  title: '5-Ratio Scoring Engine',    desc: 'Current Ratio, D/E, Profit Margin, ROA, and DSCR — all configurable per institution.' },
                { icon: Brain,       title: 'ML Cash Flow Forecasting',  desc: 'LightGBM model projects 6-month cash flow with confidence bands.' },
                { icon: BarChart3,   title: 'Portfolio History',         desc: 'Every assessed company is saved with full ratio breakdowns.' },
                { icon: Building2,   title: 'Industry Benchmarks',       desc: 'Dynamic thresholds for SaaS, Retail, Construction, and Logistics.' },
                { icon: CheckCircle, title: 'Knockout Disqualifiers',    desc: 'Hard rules automatically reject insolvent or cash-flow-negative applicants.' },
              ].map(({ icon: Icon, title, desc }, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg mt-0.5">
                    <Icon className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 mb-0.5">{title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Auth Card ── */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden">

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 border-b border-slate-200">
              <button
                onClick={() => { setActiveTab('signin'); setLoginError(''); }}
                className={`py-4 text-sm font-bold transition-colors ${
                  activeTab === 'signin'
                    ? 'bg-white text-slate-900 border-b-2 border-indigo-600'
                    : 'bg-slate-50 text-slate-400 hover:text-slate-600'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setActiveTab('signup'); setSignupError(''); setSignupSuccess(''); }}
                className={`py-4 text-sm font-bold transition-colors ${
                  activeTab === 'signup'
                    ? 'bg-white text-slate-900 border-b-2 border-indigo-600'
                    : 'bg-slate-50 text-slate-400 hover:text-slate-600'
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="p-8">

              {/* ── Sign In Form ── */}
              {activeTab === 'signin' && (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-1">Welcome back</h2>
                    <p className="text-slate-500 text-xs">Sign in to FinSight</p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Username</label>
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400 outline-none"
                        placeholder="Enter username"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Password</label>
                      <div className="relative">
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400 outline-none pr-11"
                          placeholder="Enter password"
                          required
                        />
                        <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {loginError && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{loginError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {loginLoading ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Signing in...</>
                      ) : (
                        <>Sign in <ArrowRight className="h-4 w-4" /></>
                      )}
                    </button>
                  </form>

                  <p className="text-center text-xs text-slate-400 mt-4">
                    Don't have an account?{' '}
                    <button onClick={() => setActiveTab('signup')} className="text-indigo-600 font-semibold hover:underline">
                      Create one
                    </button>
                  </p>
                </>
              )}

              {/* ── Sign Up Form ── */}
              {activeTab === 'signup' && (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-1">Create an account</h2>
                    <p className="text-slate-500 text-xs">Register your institution's access to FinSight</p>
                  </div>

                  <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Full Name</label>
                      <input
                        type="text"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400"
                        placeholder="e.g. Ahmed Al-Rashidi"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Institution</label>
                      <input
                        type="text"
                        value={signupInstitution}
                        onChange={(e) => setSignupInstitution(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400"
                        placeholder="e.g. Al Rajhi Bank"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Username</label>
                      <input
                        type="text"
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400"
                        placeholder="Choose a username"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Password</label>
                      <div className="relative">
                        <input
                          type={showSignupPassword ? 'text' : 'password'}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400 pr-11"
                          placeholder="Min. 6 characters"
                          required
                        />
                        <button type="button" onClick={() => setShowSignupPassword(!showSignupPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Confirm Password</label>
                      <input
                        type="password"
                        value={signupConfirm}
                        onChange={(e) => setSignupConfirm(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400"
                        placeholder="Repeat your password"
                        required
                      />
                    </div>

                    {signupError && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{signupError}</p>
                    )}
                    {signupSuccess && (
                      <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5" />{signupSuccess}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={signupLoading}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {signupLoading ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating account...</>
                      ) : (
                        <>Create Account <ArrowRight className="h-4 w-4" /></>
                      )}
                    </button>
                  </form>

                  <p className="text-center text-xs text-slate-400 mt-4">
                    Already have an account?{' '}
                    <button onClick={() => setActiveTab('signin')} className="text-indigo-600 font-semibold hover:underline">
                      Sign in
                    </button>
                  </p>
                </>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-slate-200 px-10 py-4 text-center">
        <p className="text-xs text-slate-400">
          FinSight © 2026 — Graduation Project, Information Systems Department, IMSIU
        </p>
      </footer>

    </div>
  );
}