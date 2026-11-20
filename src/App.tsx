import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { api, setApiClientRole } from './api/client.ts';
import { AppLayout } from './layouts/AppLayout.tsx';
import { CropType, UserRole } from './types/agroshield.ts';
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

export default function App() {
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
    refreshAlertBadge();
  }, []);

  const handleRoleChange = (role: UserRole) => {
    setActiveRole(role);
    setApiClientRole(role);
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
      <AppLayout
        activePage={activePage}
        onSelectPage={setActivePage}
        activeRole={activeRole}
        onChangeRole={handleRoleChange}
        activeAlertCount={activeAlertCount}
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
    </MotionConfig>
  );
}
