import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Microscope,
  Radar,
  ShieldCheck,
  Sprout,
  User,
} from 'lucide-react';
import { api } from '../api/client.ts';
import { UserAccount, UserRole } from '../types/agroshield.ts';
import fieldCanopyImg from '../assets/images/agroshield_field_canopy_1795193943461.jpg';

interface LoginPageProps {
  onLoginSuccess: (payload: { token: string; expiresAt: string; user: UserAccount }) => void;
}

const DEMO_ACCOUNTS: Array<{
  role: UserRole;
  title: string;
  email: string;
  scope: string;
}> = [
  {
    role: UserRole.FARMER,
    title: 'Farmer Operator',
    email: 'demo.farmer@agroshield.local',
    scope: 'Field scans, progression & treatments',
  },
  {
    role: UserRole.EXPERT,
    title: 'Agricultural Expert',
    email: 'demo.expert@agroshield.local',
    scope: 'Diagnosis review & outbreak verification',
  },
  {
    role: UserRole.ADMIN,
    title: 'Platform Admin',
    email: 'demo.admin@agroshield.local',
    scope: 'User governance, FastAPI & telemetry',
  },
];

const KARNATAKA_DISTRICTS = [
  'Mandya',
  'Hassan',
  'Kolar',
  'Chikkaballapur',
  'Belagavi',
  'Haveri',
  'Mysuru',
  'Davanagere',
  'Shivamogga',
  'Tumakuru',
  'Ballari',
  'Dharwad',
  'Chitradurga',
  'Ramanagara',
  'Koppal',
  'Raichur',
  'Gadag',
  'Bagalkot',
  'Vijayanagara',
  'Bidar',
];

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo.farmer@agroshield.local');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [registerRole, setRegisterRole] = useState<UserRole>(UserRole.FARMER);
  const [district, setDistrict] = useState('Mandya');
  const [organization, setOrganization] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [demoLoadingRole, setDemoLoadingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleModeSwitch = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError(null);
    setInfoNotice(null);
    if (nextMode === 'register' && email === 'demo.farmer@agroshield.local') {
      setEmail('');
      setPassword('');
    } else if (nextMode === 'login' && !email) {
      setEmail('demo.farmer@agroshield.local');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!email.trim() || !password) {
      setError('Enter both your email address and password to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.authLogin({
        email: email.trim(),
        password,
        rememberMe,
      });
      onLoginSuccess(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in with those credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please complete your full name, email address, and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.authRegister({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role: registerRole,
        district,
        organization: organization.trim() || `${district} Grower Plot`,
      });
      onLoginSuccess(result);
    } catch (err: any) {
      setError(err?.message || 'Account registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoSignIn = async (role: UserRole) => {
    setError(null);
    setInfoNotice(null);
    setDemoLoadingRole(role);
    try {
      const result = await api.authDemoLogin({ role });
      onLoginSuccess(result);
    } catch (err: any) {
      setError(err?.message || 'Demo authentication failed.');
    } finally {
      setDemoLoadingRole(null);
    }
  };

  const handleFillDemoCredentials = (demoEmail: string) => {
    setMode('login');
    setError(null);
    setEmail(demoEmail);
    setPassword('AgroShield@2026');
    setInfoNotice(`Credentials filled for ${demoEmail}. Click Sign In to authenticate.`);
  };

  return (
    <div className="min-h-screen bg-[#F6F7F5] text-slate-900 grid lg:grid-cols-12">
      {/* Left Brand & Agronomic Field Panel */}
      <aside className="hidden lg:flex lg:col-span-5 relative overflow-hidden bg-[#0F2E1E] text-stone-100 flex-col justify-between p-9 xl:p-12 border-r border-emerald-950">
        {!imgFailed && (
          <img
            src={fieldCanopyImg}
            alt="Terraced tomato and paddy crop rows in Karnataka under morning sunlight"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-35 scale-[1.02]"
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#0F2E1E]/90 via-[#0F2E1E]/75 to-[#081C12]/95"
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-800/80 border border-emerald-500/30 flex items-center justify-center text-emerald-200">
              <Sprout className="w-4 h-4" />
            </div>
            <div>
              <div className="font-display font-bold text-lg tracking-tight text-white leading-none">
                AgroShield
              </div>
              <div className="text-[11px] text-emerald-300/90 mt-1">
                Karnataka Crop Intelligence
              </div>
            </div>
          </div>

          <div className="mt-12 max-w-md">
            <h1 className="font-display text-3xl xl:text-[34px] font-semibold tracking-tight text-white leading-[1.15]">
              Early disease intelligence for resilient farms.
            </h1>
            <p className="mt-4 text-sm text-emerald-100/80 leading-relaxed">
              Unify foliar image diagnostics, microclimate risk modeling, plot-level progression tracking, and verified plant pathology guidance in one operational workspace.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 space-y-4 pt-8 border-t border-emerald-800/60"
        >
          <div className="flex items-start gap-3">
            <Microscope className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white">Foliar Diagnostics &amp; Progression</div>
              <div className="text-xs text-emerald-200/75 mt-0.5">
                Track crop severity changes chronologically across matched farm zones.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Radar className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white">Environmental Risk &amp; Outbreak Radar</div>
              <div className="text-xs text-emerald-200/75 mt-0.5">
                Combine Open-Meteo forecasts, ESP32 node telemetry, and district clusters.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white">Expert-Verified Advisory Governance</div>
              <div className="text-xs text-emerald-200/75 mt-0.5">
                Transparent audit trails separating AI hypotheses from pathologist approval.
              </div>
            </div>
          </div>
        </motion.div>
      </aside>

      {/* Right Focused Authentication Workspace */}
      <main className="lg:col-span-7 flex flex-col justify-center items-center p-5 sm:p-8 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[460px]"
        >
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-md bg-[#0F2E1E] flex items-center justify-center text-emerald-300">
              <Sprout className="w-4 h-4" />
            </div>
            <div>
              <div className="font-display font-bold text-base tracking-tight text-slate-900">
                AgroShield
              </div>
              <div className="text-xs text-slate-500">Karnataka Crop Intelligence</div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 shadow-xs">
            <div className="mb-6">
              <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">
                {mode === 'login' ? 'Sign in to AgroShield' : 'Create an AgroShield account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Authenticate with your operator credentials or enter using a demo role below.'
                  : 'Register a farmer operator or agricultural expert profile in the workspace.'}
              </p>
            </div>

            {/* Segmented Mode Switch */}
            <div
              className="grid grid-cols-2 p-1 bg-stone-100 border border-stone-200 rounded-lg mb-6"
              role="tablist"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => handleModeSwitch('login')}
                className={`relative py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode === 'login' && (
                  <motion.span
                    layoutId="auth-mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 bg-white border border-stone-200/80 rounded-md shadow-xs"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">Sign In</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => handleModeSwitch('register')}
                className={`relative py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode === 'register' && (
                  <motion.span
                    layoutId="auth-mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 bg-white border border-stone-200/80 rounded-md shadow-xs"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">Create Account</span>
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  role="alert"
                  className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800"
                >
                  {error}
                </motion.div>
              )}
              {infoNotice && !error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{infoNotice}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {mode === 'login' ? (
                <motion.form
                  key="login-form"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleLoginSubmit}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="operator@farm.in"
                        className="w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full rounded-md border border-stone-300 bg-white pl-9 pr-10 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-stone-300 text-emerald-900 focus:ring-emerald-700"
                      />
                      <span>Keep me signed in for 7 days</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || demoLoadingRole !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Workspace</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="register-form"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleRegisterSubmit}
                  className="space-y-3.5"
                >
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                      Full name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Ramesh Gowda"
                        className="w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ramesh@farmcluster.in"
                        className="w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-role" className="block text-xs font-medium text-slate-700 mb-1">
                        Role
                      </label>
                      <select
                        id="reg-role"
                        value={registerRole}
                        onChange={(e) => setRegisterRole(e.target.value as UserRole)}
                        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                      >
                        <option value={UserRole.FARMER}>Farmer Operator</option>
                        <option value={UserRole.EXPERT}>Agricultural Expert</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reg-district" className="block text-xs font-medium text-slate-700 mb-1">
                        District
                      </label>
                      <select
                        id="reg-district"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                      >
                        {KARNATAKA_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-org" className="block text-xs font-medium text-slate-700 mb-1">
                      Farm or Organization
                    </label>
                    <input
                      id="reg-org"
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="e.g. Maddur Horti FPO"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full rounded-md border border-stone-300 bg-white pl-9 pr-10 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || demoLoadingRole !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap mt-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Account &amp; Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Demo Sandbox Access */}
            <div className="mt-6 pt-5 border-t border-stone-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold text-slate-800">
                  Demo Sandbox Access
                </span>
                <span className="text-[11px] text-slate-500">
                  Password:{' '}
                  <code className="font-mono text-slate-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                    AgroShield@2026
                  </code>
                </span>
              </div>

              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((acct) => {
                  const isLoading = demoLoadingRole === acct.role;
                  return (
                    <div
                      key={acct.role}
                      className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 hover:border-stone-300 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900 truncate">
                          {acct.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          <span className="font-mono">{acct.email}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{acct.scope}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleFillDemoCredentials(acct.email)}
                          disabled={submitting || demoLoadingRole !== null}
                          className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded border border-transparent hover:border-stone-200 transition-colors whitespace-nowrap"
                        >
                          Fill
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickDemoSignIn(acct.role)}
                          disabled={submitting || demoLoadingRole !== null}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-white text-emerald-900 border border-stone-300 rounded hover:bg-emerald-50 hover:border-emerald-700/40 disabled:opacity-60 transition-colors whitespace-nowrap"
                        >
                          {isLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span>Enter</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-500">
            Session tokens are stored locally and verified against AgroShield SQLite user governance.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
