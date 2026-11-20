import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Loader2, Sprout } from 'lucide-react';
import { api, setApiAuthToken, setApiClientRole } from './api/client.ts';
import { AppLayout } from './layouts/AppLayout.tsx';
import { CropType, UserAccount, UserRole } from './types/agroshield.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { OverviewDashboard } from './pages/OverviewDashboard.tsx';
import { FarmDigitalTwinPage } from './pages/FarmDigitalTwinPage.tsx';
import { FarmManagementPage } from './pages/FarmManagementPage.tsx';
import { CropHealthPage } from './pages/CropHealthPage.tsx';
import { DiseaseScannerPage } from './pages/DiseaseScannerPage.tsx';
import { SeverityAnalysisPage } from './pages/SeverityAnalysisPage.tsx';
import { DiseaseProgressionPage } from './pages/DiseaseProgressionPage.tsx';
import { WeatherMonitoringPage } from './pages/WeatherMonitoringPage.tsx';
import { IoTSensorsPage } from './pages/IoTSensorsPage.tsx';
import { DiseaseRiskPage } from './pages/DiseaseRiskPage.tsx';
import { OutbreakIntelligencePage } from './pages/OutbreakIntelligencePage.tsx';
import { SmartAdvisoryPage } from './pages/SmartAdvisoryPage.tsx';
import { ExpertDashboardPage } from './pages/ExpertDashboardPage.tsx';
import { AlertCentrePage } from './pages/AlertCentrePage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SettingsUsersPage } from './pages/SettingsUsersPage.tsx';

const AUTH_TOKEN_STORAGE_KEY = 'agroshield_auth_token';

export default function App() {
  const [authUser, setAuthUser] = useState<UserAccount | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [activePage, setActivePage] = useState<string>('overview');
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.FARMER);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(0);
  const [severityContext, setSeverityContext] = useState<{
    imageUrl: string;
    cropType: CropType;
    farmId: string;
    zoneId: string;
  } | null>(null);

  const refreshAlertBadge = () => {
    api
      .getAlerts()
      .then((list) => {
        setActiveAlertCount(list.filter((a: any) => !a.resolvedAt).length);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const savedToken =
      typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null;

    if (!savedToken) {
      setAuthChecking(false);
      return;
    }

    setApiAuthToken(savedToken);
    api
      .authMe()
      .then((res) => {
        setAuthUser(res.user);
        setActiveRole(res.user.role);
        setApiClientRole(res.user.role);
        refreshAlertBadge();
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        setApiAuthToken(null);
        setAuthUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  const handleRoleChange = (role: UserRole) => {
    setActiveRole(role);
    setApiClientRole(role);
  };

  const handleLoginSuccess = (payload: { token: string; expiresAt: string; user: UserAccount }) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, payload.token);
    }
    setApiAuthToken(payload.token);
    setAuthUser(payload.user);
    setActiveRole(payload.user.role);
    setApiClientRole(payload.user.role);
    setActivePage('overview');
    refreshAlertBadge();
  };

  const handleLogout = () => {
    api.authLogout().catch(() => {});
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    setApiAuthToken(null);
    setAuthUser(null);
    setActivePage('overview');
    setActiveRole(UserRole.FARMER);
    setApiClientRole(UserRole.FARMER);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewDashboard onNavigate={setActivePage} />;
      case 'digital_twin':
        return <FarmDigitalTwinPage onNavigate={setActivePage} />;
      case 'farms':
        return <FarmManagementPage />;
      case 'crop_health':
        return <CropHealthPage />;
      case 'scanner':
        return (
          <DiseaseScannerPage
            onOpenSeverityWithResult={(payload) => {
              setSeverityContext(payload);
              setActivePage('severity');
            }}
          />
        );
      case 'severity':
        return <SeverityAnalysisPage initialContext={severityContext} />;
      case 'progression':
        return <DiseaseProgressionPage onAlertsChanged={refreshAlertBadge} />;
      case 'weather':
        return <WeatherMonitoringPage />;
      case 'iot':
        return <IoTSensorsPage />;
      case 'risk':
        return <DiseaseRiskPage />;
      case 'outbreaks':
        return <OutbreakIntelligencePage activeRole={activeRole} onAlertsChanged={refreshAlertBadge} />;
      case 'advisory':
        return <SmartAdvisoryPage />;
      case 'expert':
        return <ExpertDashboardPage activeRole={activeRole} />;
      case 'alerts':
        return <AlertCentrePage onAlertsChanged={refreshAlertBadge} />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsUsersPage activeRole={activeRole} onChangeRole={handleRoleChange} />;
      default:
        return <OverviewDashboard onNavigate={setActivePage} />;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {authChecking ? (
          <motion.div
            key="auth-checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-[#F6F7F5] flex flex-col items-center justify-center gap-3 text-slate-600"
          >
            <div className="w-10 h-10 rounded-lg bg-[#0F2E1E] text-emerald-300 flex items-center justify-center">
              <Sprout className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
              <span>Verifying AgroShield session...</span>
            </div>
          </motion.div>
        ) : !authUser ? (
          <motion.div
            key="auth-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <LoginPage onLoginSuccess={handleLoginSuccess} />
          </motion.div>
        ) : (
          <motion.div
            key="auth-workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <AppLayout
              activePage={activePage}
              onSelectPage={setActivePage}
              activeRole={activeRole}
              onChangeRole={handleRoleChange}
              activeAlertCount={activeAlertCount}
              currentUser={authUser}
              onLogout={handleLogout}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {renderPage()}
                </motion.div>
              </AnimatePresence>
            </AppLayout>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

