import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CloudRain,
  Cpu,
  FileSpreadsheet,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Microscope,
  Radar,
  ScanLine,
  Settings,
  ShieldCheck,
  Sprout,
  Tractor,
  X,
} from 'lucide-react';
import { UserAccount, UserRole } from '../types/agroshield.ts';

export interface NavItem {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview Dashboard', group: 'Command', icon: LayoutDashboard },
  { id: 'digital_twin', label: 'Farm Digital Twin', group: 'Field Operations', icon: MapIcon },
  { id: 'farms', label: 'Farm Management', group: 'Field Operations', icon: Tractor },
  { id: 'crop_health', label: 'Crop Health Monitoring', group: 'Field Operations', icon: Sprout },
  { id: 'scanner', label: 'AI Disease Scanner', group: 'Diagnostics', icon: ScanLine },
  { id: 'severity', label: 'Severity Analysis', group: 'Diagnostics', icon: Microscope },
  { id: 'progression', label: 'Disease Progression', group: 'Diagnostics', icon: GitCompare },
  { id: 'weather', label: 'Weather Monitoring', group: 'Environment & Risk', icon: CloudRain },
  { id: 'iot', label: 'IoT Sensor Network', group: 'Environment & Risk', icon: Cpu },
  { id: 'risk', label: 'Disease Risk Engine', group: 'Environment & Risk', icon: Activity },
  { id: 'outbreaks', label: 'Outbreak Intelligence', group: 'Environment & Risk', icon: Radar },
  { id: 'advisory', label: 'Smart Advisory', group: 'Advisory & Governance', icon: BookOpen },
  { id: 'expert', label: 'Expert Dashboard', group: 'Advisory & Governance', icon: ShieldCheck },
  { id: 'alerts', label: 'Alert Centre', group: 'Advisory & Governance', icon: AlertTriangle },
  { id: 'reports', label: 'Reports & Analytics', group: 'Advisory & Governance', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings & Users', group: 'Advisory & Governance', icon: Settings },
];

interface AppLayoutProps {
  activePage: string;
  onSelectPage: (pageId: string) => void;
  activeRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  activeAlertCount: number;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

export function AppLayout({
  activePage,
  onSelectPage,
  activeRole,
  onChangeRole,
  activeAlertCount,
  currentUser,
  onLogout,
  children,
}: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const groups = ['Command', 'Field Operations', 'Diagnostics', 'Environment & Risk', 'Advisory & Governance'];
  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) || NAV_ITEMS[0];

  const renderSidebar = (idPrefix: string) => (
    <div className="flex flex-col h-full bg-[#0F2E1E] text-stone-100">
      <div className="px-5 py-4 border-b border-emerald-900/80 flex items-center justify-between">
        <div>
          <div className="font-display font-bold text-base tracking-tight text-white whitespace-nowrap">
            AgroShield
          </div>
          <div className="text-[11px] text-emerald-300/90 mt-0.5">
            Karnataka Crop Intelligence
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-emerald-200 hover:text-white"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Primary modules">
        {groups.map((group) => (
          <div key={group}>
            <div className="px-2.5 mb-1.5 text-[11px] font-medium text-emerald-300/75">
              {group}
            </div>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectPage(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                      isActive
                        ? 'text-white'
                        : 'text-emerald-100/80 hover:bg-emerald-900/50 hover:text-white'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={`active-nav-indicator-${idPrefix}`}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-md bg-emerald-700/75 border border-emerald-500/30 shadow-xs"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 transition-transform duration-150 ${isActive ? 'scale-105' : ''}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'alerts' && activeAlertCount > 0 && (
                      <motion.span
                        key={activeAlertCount}
                        initial={{ scale: 0.85, opacity: 0.7 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 font-mono tabular-nums text-[11px] text-amber-300 shrink-0"
                      >
                        {activeAlertCount}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-emerald-900/80 bg-[#0B2317] space-y-3">
        {currentUser && (
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-emerald-900/70">
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">{currentUser.fullName}</div>
              <div className="text-[11px] text-emerald-300/80 font-mono truncate">{currentUser.email}</div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign out"
                aria-label="Sign out of AgroShield"
                className="p-1.5 rounded-md text-emerald-200 hover:text-white hover:bg-emerald-900/60 transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <div>
          <label htmlFor={`role-switcher-${idPrefix}`} className="block text-[11px] text-emerald-300/80 mb-1.5">
            Active Access Role (RBAC)
          </label>
          <select
            id={`role-switcher-${idPrefix}`}
            value={activeRole}
            onChange={(e) => onChangeRole(e.target.value as UserRole)}
            className="w-full rounded-md bg-emerald-950 border border-emerald-800 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-colors"
          >
            <option value={UserRole.FARMER}>Farmer Operator (Demo)</option>
            <option value={UserRole.EXPERT}>Agricultural Expert (Demo)</option>
            <option value={UserRole.ADMIN}>Platform Admin (Demo)</option>
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F6F7F5] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-stone-200 sticky top-0 h-screen">
        {renderSidebar('desktop')}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="w-64 h-full shrink-0 shadow-xl relative z-10"
            >
              {renderSidebar('mobile')}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 bg-slate-900/45"
              onClick={() => setMobileMenuOpen(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white/95 backdrop-blur-xs border-b border-stone-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-stone-100 rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-700 truncate flex items-center">
              <span className="text-slate-400">AgroShield</span>
              <span className="mx-2 text-slate-300">/</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentNav.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.16 }}
                  className="text-slate-900"
                >
                  {currentNav.label}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              Role: <strong className="font-medium text-slate-800 capitalize">{activeRole}</strong> ·{' '}
              {currentUser?.isDemo === false ? 'Registered Account' : 'Demo Mode'}
            </span>
            <button
              onClick={() => onSelectPage('scanner')}
              className="px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 shadow-xs hover:shadow-sm transition-all whitespace-nowrap shrink-0"
            >
              New Leaf Scan
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
