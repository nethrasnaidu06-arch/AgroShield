import React, { useEffect, useState } from 'react';
import { RefreshCw, Server, Shield, UserPlus } from 'lucide-react';
import { api } from '../api/client.ts';
import { UserAccount, UserRole } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  StatusPulseDot,
} from '../components/ui/CommonPrimitives.tsx';

export function SettingsUsersPage({
  activeRole,
  onChangeRole,
}: {
  activeRole: UserRole;
  onChangeRole: (role: UserRole) => void;
}) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [fastApiHealth, setFastApiHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    role: UserRole.FARMER,
    district: 'Mandya',
    organization: 'Partner Farm',
  });

  const isAdmin = activeRole === UserRole.ADMIN;

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, st, fa] = await Promise.all([
        api.getUsers(),
        api.getSettings(),
        api.getFastApiHealth(),
      ]);
      setUsers(u);
      setSettings(st);
      setFastApiHealth(fa);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api.updateSettings(settings);
      const fa = await api.getFastApiHealth();
      setFastApiHealth(fa);
      setNotice('Integration settings saved.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api.createUser(newUser);
      setNewUser({ fullName: '', email: '', role: UserRole.FARMER, district: 'Mandya', organization: 'Partner Farm' });
      setNotice('User account provisioned.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetDemo = async () => {
    setError(null);
    setNotice(null);
    try {
      await api.resetDemoData();
      setNotice('Synthetic Karnataka demo dataset restored cleanly.');
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & User Management"
        subtitle="Role-based access control (Farmer, Agricultural Expert, Administrator), Python FastAPI inference integration, and dataset management."
      />

      {!isAdmin && (
        <DemoDisclaimerBar text={`RBAC Notice: Current active role is '${activeRole}'. Switch to Administrator below (or in the sidebar) to edit integration endpoints, provision accounts, or reset demo data.`} />
      )}

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={notice} />

      {loading || !settings ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Integration Architecture Settings */}
          <form onSubmit={handleSaveSettings} className="lg:col-span-6 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-800" />
              External FastAPI & Weather Integration
            </h2>

            <div className="bg-stone-50 border border-stone-200 rounded p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">FastAPI Service Status</span>
                <span className={`inline-flex items-center gap-1.5 font-semibold ${fastApiHealth?.connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                  <StatusPulseDot variant={fastApiHealth?.connected ? 'online' : 'warning'} />
                  {fastApiHealth?.connected ? 'Reachable' : 'Offline / Not Connected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Trained PyTorch/YOLO Weights</span>
                <span className="font-mono text-slate-800">
                  {fastApiHealth?.weightsLoaded ? 'Loaded' : 'Not Loaded (Demo Mode)'}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Python FastAPI Base URL</label>
                <input
                  disabled={!isAdmin}
                  value={settings.fastApiBaseUrl}
                  onChange={(e) => setSettings({ ...settings, fastApiBaseUrl: e.target.value })}
                  className="w-full rounded border border-stone-200 px-3 py-2 font-mono disabled:bg-stone-50"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Inference Mode</label>
                <select
                  disabled={!isAdmin}
                  value={settings.inferenceMode}
                  onChange={(e) => setSettings({ ...settings, inferenceMode: e.target.value })}
                  className="w-full rounded border border-stone-200 px-3 py-2 bg-white disabled:bg-stone-50"
                >
                  <option value="demo_sandbox">Demo Diagnostic Sandbox (Canvas Heuristic)</option>
                  <option value="fastapi_external">External Python FastAPI (PyTorch ResNet50 / YOLOv8)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={!isAdmin}
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-stone-200 rounded-md text-slate-700 hover:bg-stone-50 disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Demo Dataset
              </button>
              <button
                type="submit"
                disabled={!isAdmin}
                className="px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-40"
              >
                Save Integration Settings
              </button>
            </div>
          </form>

          {/* RBAC User Management */}
          <div className="lg:col-span-6 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-800" />
                Role-Based User Accounts
              </h2>
              <select
                value={activeRole}
                onChange={(e) => onChangeRole(e.target.value as UserRole)}
                className="rounded border border-stone-200 bg-white px-2.5 py-1 text-xs"
              >
                <option value={UserRole.FARMER}>Simulate: Farmer</option>
                <option value={UserRole.EXPERT}>Simulate: Expert</option>
                <option value={UserRole.ADMIN}>Simulate: Admin</option>
              </select>
            </div>

            <div className="divide-y divide-stone-100 border border-stone-200 rounded-md px-3">
              {users.map((u, idx) => (
                <div
                  key={u.id}
                  style={{ animationDelay: `${idx * 25}ms` }}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs agro-row-enter"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{u.fullName}</div>
                    <div className="text-slate-500 truncate">{u.email} · {u.district}</div>
                  </div>
                  <span className="font-mono capitalize font-medium text-emerald-800 shrink-0">{u.role}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateUser} className="pt-3 border-t border-stone-200 space-y-3 text-xs">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-emerald-800" />
                Provision New Account (Admin Only)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  required
                  disabled={!isAdmin}
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  placeholder="Full Name"
                  className="rounded border border-stone-200 px-3 py-1.5 disabled:bg-stone-50"
                />
                <input
                  required
                  type="email"
                  disabled={!isAdmin}
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="Email Address"
                  className="rounded border border-stone-200 px-3 py-1.5 disabled:bg-stone-50"
                />
                <select
                  disabled={!isAdmin}
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                  className="rounded border border-stone-200 px-3 py-1.5 bg-white disabled:bg-stone-50"
                >
                  <option value={UserRole.FARMER}>Farmer</option>
                  <option value={UserRole.EXPERT}>Agricultural Expert</option>
                  <option value={UserRole.ADMIN}>Administrator</option>
                </select>
                <input
                  disabled={!isAdmin}
                  value={newUser.district}
                  onChange={(e) => setNewUser({ ...newUser, district: e.target.value })}
                  placeholder="Karnataka District"
                  className="rounded border border-stone-200 px-3 py-1.5 disabled:bg-stone-50"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!isAdmin}
                  className="px-3.5 py-1.5 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-40"
                >
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
