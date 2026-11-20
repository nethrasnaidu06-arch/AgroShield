import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '../api/client.ts';
import { OverviewSummary } from '../types/agroshield.ts';
import {
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  StatusPulseDot,
} from '../components/ui/CommonPrimitives.tsx';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function OverviewDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<OverviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOverview();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to load dashboard summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview Dashboard"
          subtitle="Statewide crop health, environmental telemetry, and disease risk monitoring across Karnataka demo plots."
        />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview Dashboard"
          subtitle="Statewide crop health, environmental telemetry, and disease risk monitoring."
        />
        <ErrorBanner message={error || 'No overview data available.'} onRetry={loadOverview} />
      </div>
    );
  }

  const totalZ = Math.max(1, data.totalZones);
  const healthyPct = Math.round((data.healthyZones / totalZ) * 100);
  const riskSusPct = Math.round(((data.atRiskZones + data.suspectedZones) / totalZ) * 100);
  const infectedPct = Math.max(0, 100 - healthyPct - riskSusPct);
  const onlineSensorPct = Math.round((data.onlineSensors / Math.max(1, data.totalSensors)) * 100);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <PageHeader
        title="Overview Dashboard"
        subtitle="Multi-farm crop health surveillance, environmental disease risk, and sensor telemetry across 20 Karnataka districts."
        action={
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-stone-200 text-slate-700 rounded-md hover:bg-stone-50 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Summary
          </button>
        }
      />

      <motion.div variants={itemVariants}>
        <DemoDisclaimerBar text="DEMO DATA NOTICE: All 20 Karnataka farms, 72 crop zones, sensor nodes, and baseline pathology logs shown below are synthetic demonstration records unless supplemented by live Open-Meteo weather sync or ESP32 ingestion." />
      </motion.div>

      {/* Editorial Karnataka Agricultural Banner */}
      <motion.div
        variants={itemVariants}
        className="relative rounded-lg overflow-hidden border border-stone-200 bg-emerald-950 h-44 sm:h-52 agro-card-hover"
      >
        <img
          src="/src/assets/images/agroshield_field_banner_1795172710827.jpg"
          alt="Terraced green agricultural plots in Karnataka under morning sunlight"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-80 transition-transform duration-700 hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-950/60 to-transparent flex flex-col justify-end p-6">
          <div className="text-xs font-medium text-emerald-200">
            Karnataka Precision Surveillance Grid · 5 Target Crops
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-white mt-1 max-w-xl">
            Early Disease Prediction &amp; Geospatial Farm Twin
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('digital_twin')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-500 whitespace-nowrap"
            >
              Open Farm Digital Twin
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('risk')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white/15 text-white border border-white/25 rounded-md hover:bg-white/25 whitespace-nowrap"
            >
              Inspect Risk Engine
            </button>
          </div>
        </div>
      </motion.div>

      {/* Primary KPI Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCell label="Total Farms" value={data.totalFarms} subtext="20 districts (Demo)" tone="forest" />
        <MetricCell label="Total Crop Zones" value={data.totalZones} subtext="Geospatial polygons" />
        <MetricCell
          label="Healthy Zones"
          value={data.healthyZones}
          subtext={`${healthyPct}% verified clear`}
          tone="healthy"
          progressPct={healthyPct}
        />
        <MetricCell
          label="Confirmed Infected"
          value={data.infectedZones}
          subtext="Active containment"
          tone="danger"
          progressPct={infectedPct}
        />
        <MetricCell
          label="At-Risk / Suspected"
          value={data.atRiskZones + data.suspectedZones}
          subtext={`${data.atRiskZones} env · ${data.suspectedZones} suspected`}
          tone="warning"
          progressPct={riskSusPct}
        />
        <MetricCell
          label="Disease Observations"
          value={data.totalObservations}
          subtext={`${data.pendingExpertReviews} pending expert review`}
        />
      </motion.div>

      {/* Animated Health Composition Progress Bar */}
      <motion.div variants={itemVariants} className="bg-white border border-stone-200 rounded-lg p-4 agro-card-hover">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
          <span className="font-semibold text-slate-900">Statewide Canopy Health Distribution</span>
          <div className="flex flex-wrap items-center gap-4 text-slate-600 font-mono text-[11px]">
            <span className="text-emerald-700 font-medium">Healthy {healthyPct}%</span>
            <span className="text-amber-700 font-medium">At-Risk / Suspected {riskSusPct}%</span>
            <span className="text-red-700 font-medium">Infected {infectedPct}%</span>
          </div>
        </div>
        <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden flex">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${healthyPct}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="bg-emerald-600 h-full"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${riskSusPct}%` }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="bg-amber-500 h-full"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${infectedPct}%` }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="bg-red-600 h-full"
          />
        </div>
      </motion.div>

      {/* Environmental Snapshot Strip */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCell
          label="Avg Ambient Temperature"
          value={`${data.avgTemperatureC} °C`}
          subtext="Across active farms"
          animateValue={false}
        />
        <MetricCell
          label="Avg Canopy Humidity"
          value={`${data.avgHumidityPct} %`}
          subtext={data.avgHumidityPct >= 75 ? 'Elevated fungal sporulation range' : 'Moderate humidity'}
          tone={data.avgHumidityPct >= 75 ? 'warning' : 'neutral'}
          progressPct={data.avgHumidityPct}
          animateValue={false}
        />
        <MetricCell
          label="Avg Soil Moisture"
          value={`${data.avgSoilMoisturePct} %`}
          subtext="Root-zone volumetric water"
          progressPct={data.avgSoilMoisturePct}
          animateValue={false}
        />
        <MetricCell
          label="IoT Sensor Fleet"
          value={`${data.onlineSensors} / ${data.totalSensors}`}
          subtext={`${data.activeAlerts} active alerts`}
          tone={data.activeAlerts > 0 ? 'warning' : 'healthy'}
          progressPct={onlineSensorPct}
          animateValue={false}
        />
      </motion.div>

      {/* Charts Row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Crop Health &amp; Environmental Risk Trend</h3>
              <p className="text-xs text-slate-500">14-day synthetic historical zone progression &amp; average risk score</p>
            </div>
            <button
              onClick={() => onNavigate('risk')}
              className="text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
            >
              Risk Details
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cropHealthTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E7E5E4',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="healthy" name="Healthy Zones" stroke="#16A34A" fill="#DCFCE7" strokeWidth={2} animationDuration={700} />
                <Area type="monotone" dataKey="atRisk" name="At-Risk Zones" stroke="#D97706" fill="#FEF3C7" strokeWidth={2} animationDuration={750} />
                <Area type="monotone" dataKey="infected" name="Infected Zones" stroke="#DC2626" fill="#FEE2E2" strokeWidth={2} animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Farm-Wise Zone Health Distribution</h3>
              <p className="text-xs text-slate-500">First 12 Karnataka demo farms by zone health status</p>
            </div>
            <button
              onClick={() => onNavigate('farms')}
              className="text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
            >
              All 20 Farms
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.farmDiseaseDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis dataKey="district" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-20} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E7E5E4',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="healthy" stackId="a" name="Healthy" fill="#16A34A" animationDuration={650} />
                <Bar dataKey="atRisk" stackId="a" name="At Risk" fill="#F59E0B" animationDuration={700} />
                <Bar dataKey="suspected" stackId="a" name="Suspected" fill="#EA580C" animationDuration={750} />
                <Bar dataKey="infected" stackId="a" name="Infected" fill="#DC2626" animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Bottom Split: Crop Breakdown + Recent Alerts */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Crop Coverage &amp; Risk Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-2 font-medium">Crop Type</th>
                  <th className="py-2 font-medium text-right">Zones</th>
                  <th className="py-2 font-medium text-right">Infected</th>
                  <th className="py-2 font-medium text-right">Avg Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.cropBreakdown.map((c, idx) => (
                  <tr
                    key={c.cropType}
                    className="hover:bg-stone-50 transition-colors agro-row-enter"
                    style={{ animationDelay: `${idx * 35}ms` }}
                  >
                    <td className="py-2.5 font-medium text-slate-900">{c.cropType}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">{c.zones}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-red-700">{c.infected}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-900">{c.avgRisk}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Recent Platform Alerts</h3>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
            >
              View Alert Centre
            </button>
          </div>
          <div className="divide-y divide-stone-100">
            {data.recentAlerts.slice(0, 6).map((alert, idx) => (
              <div
                key={alert.id}
                className="py-2.5 flex items-start justify-between gap-4 text-xs hover:bg-stone-50/70 rounded px-1.5 -mx-1.5 transition-colors agro-row-enter"
                style={{ animationDelay: `${idx * 35}ms` }}
              >
                <div className="min-w-0 flex items-start gap-2">
                  <span className="mt-1">
                    <StatusPulseDot
                      variant={
                        alert.severity === 'critical'
                          ? 'danger'
                          : alert.severity === 'high' || alert.severity === 'warning'
                          ? 'warning'
                          : 'neutral'
                      }
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{alert.title}</div>
                    <div className="text-slate-500 mt-0.5 truncate">
                      {alert.farmName} · <span className="capitalize">{alert.category}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`font-medium capitalize ${
                      alert.severity === 'critical'
                        ? 'text-red-700'
                        : alert.severity === 'high'
                        ? 'text-orange-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                    {alert.createdAt.slice(0, 10)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
