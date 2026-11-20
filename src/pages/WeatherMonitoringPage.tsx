import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CloudRain, RefreshCw, Sun, Wind } from 'lucide-react';
import { api } from '../api/client.ts';
import { Farm, WeatherRecord } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
} from '../components/ui/CommonPrimitives.tsx';

export function WeatherMonitoringPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [records, setRecords] = useState<WeatherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const loadWeather = async (farmId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const f = farms.length ? farms : await api.getFarms();
      if (!farms.length) setFarms(f);
      const targetId = farmId || selectedFarmId || f[0]?.id;
      if (targetId && !selectedFarmId) setSelectedFarmId(targetId);
      const wx = await api.getWeather(targetId);
      setRecords(wx);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
  }, []);

  const handleSyncLive = async () => {
    if (!selectedFarmId) return;
    setSyncing(true);
    setError(null);
    setSyncNotice(null);
    try {
      const liveRecord = await api.syncLiveWeather(selectedFarmId);
      setSyncNotice(
        `Synced live Open-Meteo telemetry for ${liveRecord.district}: ${liveRecord.temperatureC}°C, ${liveRecord.humidityPct}% RH, ${liveRecord.rainfallMm} mm.`
      );
      await loadWeather(selectedFarmId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const latest = records[0];
  const chartData = [...records]
    .reverse()
    .map((r) => ({
      date: r.recordedAt.slice(5, 10),
      temp: r.temperatureC,
      humidity: r.humidityPct,
      rain: r.rainfallMm,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weather Monitoring"
        subtitle="Live Open-Meteo API connectivity paired with historical Karnataka district temperature, relative humidity, rainfall, and wind records."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFarmId}
              onChange={(e) => {
                setSelectedFarmId(e.target.value);
                loadWeather(e.target.value);
              }}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              onClick={handleSyncLive}
              disabled={syncing || !selectedFarmId}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing Open-Meteo...' : 'Sync Live Weather'}
            </button>
          </div>
        }
      />

      <DemoDisclaimerBar text="HYBRID TELEMETRY: Historical 16-day baselines are synthetic Karnataka demo records (320+ entries). Clicking 'Sync Live Weather' fetches real-time conditions from the Open-Meteo Forecast API for the farm's coordinates." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice
        message={syncNotice}
        icon={<CloudRain className="w-4 h-4 text-emerald-700 shrink-0 agro-weather-float" />}
      />

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          <div className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 agro-card-hover">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800">
                {latest && latest.rainfallMm > 0 ? (
                  <CloudRain className="w-5 h-5 agro-weather-float" />
                ) : latest && latest.windSpeedKmh >= 18 ? (
                  <Wind className="w-5 h-5 agro-weather-float" />
                ) : (
                  <Sun className="w-5 h-5 agro-weather-float" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {latest ? `${latest.district} Microclimate · ${latest.conditionLabel}` : 'Station Telemetry Standby'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {latest
                    ? `Latest observation ${latest.recordedAt.slice(0, 16).replace('T', ' ')} (${latest.source === 'open_meteo_live' ? 'Live Open-Meteo' : 'Baseline Dataset'})`
                    : 'Select a farm to inspect telemetry'}
                </div>
              </div>
            </div>
            {latest && (
              <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                {latest.temperatureC}°C · {latest.humidityPct}% RH
              </span>
            )}
          </div>

          <motion.div
            key={latest?.id || selectedFarmId}
            initial={{ opacity: 0.7, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <MetricCell
              label="Current Temperature"
              value={latest ? `${latest.temperatureC} °C` : '—'}
              subtext={latest?.source === 'open_meteo_live' ? 'Live Open-Meteo' : 'Demo Baseline'}
            />
            <MetricCell
              label="Relative Humidity"
              value={latest ? `${latest.humidityPct} %` : '—'}
              subtext={latest && latest.humidityPct >= 78 ? 'Blight-favorable moisture' : 'Normal range'}
              tone={latest && latest.humidityPct >= 78 ? 'warning' : 'healthy'}
              progressPct={latest ? latest.humidityPct : undefined}
            />
            <MetricCell
              label="Rainfall"
              value={latest ? `${latest.rainfallMm} mm` : '—'}
              subtext={latest?.conditionLabel || 'No reading'}
            />
            <MetricCell
              label="Wind Speed"
              value={latest ? `${latest.windSpeedKmh} km/h` : '—'}
              subtext="Spore dispersal vector"
            />
          </motion.div>

          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Temperature (°C) & Relative Humidity (%) History
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="humidity" name="Humidity %" stroke="#059669" fill="#D1FAE5" strokeWidth={2} animationDuration={650} />
                  <Area type="monotone" dataKey="temp" name="Temp °C" stroke="#D97706" fill="#FEF3C7" strokeWidth={2} animationDuration={650} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Weather Telemetry Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-2 font-medium">Recorded</th>
                    <th className="py-2 font-medium">District</th>
                    <th className="py-2 font-medium">Condition</th>
                    <th className="py-2 font-medium text-right">Temp</th>
                    <th className="py-2 font-medium text-right">Humidity</th>
                    <th className="py-2 font-medium text-right">Rainfall</th>
                    <th className="py-2 font-medium text-right">Wind</th>
                    <th className="py-2 font-medium text-right">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {records.map((r, idx) => (
                    <tr
                      key={r.id}
                      style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
                      className="hover:bg-stone-50 transition-colors agro-row-enter"
                    >
                      <td className="py-2 font-mono text-slate-500">{r.recordedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td className="py-2 font-medium text-slate-900">{r.district}</td>
                      <td className="py-2 text-slate-700">{r.conditionLabel}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{r.temperatureC} °C</td>
                      <td className="py-2 text-right font-mono tabular-nums">{r.humidityPct} %</td>
                      <td className="py-2 text-right font-mono tabular-nums">{r.rainfallMm} mm</td>
                      <td className="py-2 text-right font-mono tabular-nums">{r.windSpeedKmh} km/h</td>
                      <td className="py-2 text-right font-medium">
                        {r.source === 'open_meteo_live' ? (
                          <span className="text-emerald-700">Live Open-Meteo</span>
                        ) : (
                          <span className="text-slate-500">Demo Synthetic</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
