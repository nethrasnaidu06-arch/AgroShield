import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cpu, Plus, Send, Sliders } from 'lucide-react';
import { api } from '../api/client.ts';
import { Farm, FarmZone, IoTSensor, SensorReading } from '../types/agroshield.ts';
import {
  AnimatedModal,
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  StatusPulseDot,
} from '../components/ui/CommonPrimitives.tsx';

export function IoTSensorsPage() {
  const [sensors, setSensors] = useState<IoTSensor[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingestNotice, setIngestNotice] = useState<string | null>(null);

  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({
    deviceUid: 'ESP32-AGRO-NEW01',
    name: 'New ESP32 Field Probe',
    farmId: '',
    zoneId: '',
    hardwareModel: 'ESP32-S3 + RS485 Soil Probe',
  });

  const [simPayload, setSimPayload] = useState({
    deviceUid: '',
    soilMoisturePct: 81.5,
    soilTempC: 24.2,
    airTempC: 26.8,
    humidityPct: 88.0,
    soilPh: 6.4,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sn, f, z, th] = await Promise.all([
        api.getSensors(),
        api.getFarms(),
        api.getZones(),
        api.getThresholds(),
      ]);
      setSensors(sn);
      setFarms(f);
      setZones(z);
      setThresholds(th);

      const activeId = selectedSensorId || sn[0]?.id;
      if (activeId) {
        setSelectedSensorId(activeId);
        const r = await api.getSensorReadings(activeId);
        setReadings(r);
        const sObj = sn.find((x: IoTSensor) => x.id === activeId);
        if (sObj) setSimPayload((p) => ({ ...p, deviceUid: sObj.deviceUid }));
      }
      if (f[0]) {
        const firstZone = z.find((zn: FarmZone) => zn.farmId === f[0].id);
        setRegForm((p) => ({ ...p, farmId: f[0].id, zoneId: firstZone?.id || '' }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectSensor = async (sensor: IoTSensor) => {
    setSelectedSensorId(sensor.id);
    setSimPayload((p) => ({ ...p, deviceUid: sensor.deviceUid }));
    const r = await api.getSensorReadings(sensor.id);
    setReadings(r);
  };

  const handleRegisterSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.registerSensor(regForm);
      setShowRegister(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestEsp32Ingest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIngestNotice(null);
    try {
      const res = await api.ingestEsp32Reading({
        ...simPayload,
        batteryPct: 92,
        signalRssi: -63,
        isSimulatedPayload: true,
      });
      setIngestNotice(
        res.triggeredAlerts?.length
          ? `ESP32 packet ingested (${res.readingId}). Abnormal condition alert(s) triggered: ${res.triggeredAlerts.join(' | ')}`
          : `ESP32 packet ingested (${res.readingId}). All parameters within thresholds.`
      );
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const chartData = [...readings]
    .reverse()
    .map((r) => ({
      time: r.recordedAt.slice(5, 16).replace('T', ' '),
      soilMoisture: r.soilMoisturePct,
      humidity: r.humidityPct,
      soilTemp: r.soilTempC,
      soilPh: r.soilPh,
    }));

  const activeThreshold = thresholds[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="IoT Sensor Monitoring & ESP32 Ingestion"
        subtitle="Soil moisture, soil temperature, soil pH, air temperature, and canopy humidity monitoring with ESP32 hardware ingestion API."
        action={
          <button
            onClick={() => setShowRegister(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Register ESP32 Node
          </button>
        }
      />

      <DemoDisclaimerBar text="DEMO IOT FLEET + REAL INGESTION API: 28 sensor nodes and 560+ historical readings are synthetic demo data. Real ESP32 firmware can POST JSON directly to /api/iot/ingest; test it below with the ESP32 Payload Simulator." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={ingestNotice} />

      {loading ? (
        <LoadingSkeleton rows={7} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCell label="Registered Nodes" value={sensors.length} subtext="ESP32-S3 + RS485" />
            <MetricCell
              label="Online Nodes"
              value={sensors.filter((s) => s.status === 'online').length}
              tone="healthy"
            />
            <MetricCell
              label="Offline / Degraded"
              value={sensors.filter((s) => s.status !== 'online').length}
              tone="danger"
              subtext="Alert triggers active"
            />
            <MetricCell label="Ingest Endpoint" value="/api/iot/ingest" subtext="HTTP POST JSON" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sensor Registry */}
            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-4 space-y-3 agro-card-hover">
              <h2 className="text-sm font-semibold text-slate-900">Sensor-to-Zone Mapping</h2>
              <div className="divide-y divide-stone-100 max-h-[430px] overflow-y-auto pr-1">
                {sensors.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSensor(s)}
                    style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
                    className={`agro-row-enter w-full text-left py-2.5 px-3 rounded-md transition-colors ${
                      selectedSensorId === s.id ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 font-mono font-semibold text-slate-900">
                        <StatusPulseDot
                          variant={s.status === 'online' ? 'online' : s.status === 'offline' ? 'danger' : 'warning'}
                        />
                        {s.deviceUid}
                      </span>
                      <span
                        className={`font-medium capitalize ${
                          s.status === 'online'
                            ? 'text-emerald-700'
                            : s.status === 'offline'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-0.5 truncate">{s.zoneName} · {s.farmName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      Battery {s.batteryPct}% · RSSI {s.signalRssi} dBm
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chart + ESP32 Ingestion Simulator */}
            <div className="lg:col-span-7 space-y-5">
              <motion.div
                key={readings[0]?.id || selectedSensorId}
                initial={{ opacity: 0.75, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
                className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Soil Moisture (%) & Canopy Humidity (%) Telemetry
                  </h3>
                  {readings[0] && (
                    <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Latest: {readings[0].soilMoisturePct}% SM · {readings[0].humidityPct}% RH
                    </span>
                  )}
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="soilMoisture" name="Soil Moisture %" stroke="#16A34A" strokeWidth={2} animationDuration={600} />
                      <Line type="monotone" dataKey="humidity" name="Air Humidity %" stroke="#0284C7" strokeWidth={2} animationDuration={600} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Live ESP32 Ingestion Simulator */}
              <form onSubmit={handleTestEsp32Ingest} className="bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-emerald-800" />
                    ESP32 Telemetry Ingestion Test (POST /api/iot/ingest)
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1">Device UID</label>
                    <input
                      required
                      value={simPayload.deviceUid}
                      onChange={(e) => setSimPayload({ ...simPayload, deviceUid: e.target.value })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Soil Moisture (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simPayload.soilMoisturePct}
                      onChange={(e) => setSimPayload({ ...simPayload, soilMoisturePct: Number(e.target.value) })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Soil Temp (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simPayload.soilTempC}
                      onChange={(e) => setSimPayload({ ...simPayload, soilTempC: Number(e.target.value) })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Air Temp (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simPayload.airTempC}
                      onChange={(e) => setSimPayload({ ...simPayload, airTempC: Number(e.target.value) })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Humidity (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simPayload.humidityPct}
                      onChange={(e) => setSimPayload({ ...simPayload, humidityPct: Number(e.target.value) })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Soil pH</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simPayload.soilPh}
                      onChange={(e) => setSimPayload({ ...simPayload, soilPh: Number(e.target.value) })}
                      className="w-full rounded border border-stone-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Values exceeding farm thresholds automatically create Alert Centre warnings.
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send Test Packet
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Threshold Configuration */}
          {activeThreshold && (
            <div className="bg-white border border-stone-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-3">
                <Sliders className="w-4 h-4 text-emerald-800" />
                Configured Farm Alert Thresholds
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-slate-500">
                      <th className="py-2 font-medium">Farm</th>
                      <th className="py-2 font-medium">Primary Crop</th>
                      <th className="py-2 font-medium text-right">Soil Moisture Range</th>
                      <th className="py-2 font-medium text-right">Max Humidity</th>
                      <th className="py-2 font-medium text-right">Soil pH Range</th>
                      <th className="py-2 font-medium text-right">Max Air Temp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {thresholds.slice(0, 8).map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 font-medium text-slate-900">{t.farm_name}</td>
                        <td className="py-2 text-slate-700">{t.crop_type}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{t.min_soil_moisture}% – {t.max_soil_moisture}%</td>
                        <td className="py-2 text-right font-mono tabular-nums">{t.max_humidity}%</td>
                        <td className="py-2 text-right font-mono tabular-nums">{t.min_soil_ph} – {t.max_soil_ph}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{t.max_air_temp} °C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatedModal open={showRegister} onClose={() => setShowRegister(false)} maxWidthClass="max-w-md">
        <form onSubmit={handleRegisterSensor} className="bg-white border border-stone-200 rounded-lg w-full p-6 space-y-4 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900">Register ESP32 IoT Sensor Node</h2>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Device UID *</label>
              <input
                required
                value={regForm.deviceUid}
                onChange={(e) => setRegForm({ ...regForm, deviceUid: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Node Label *</label>
              <input
                required
                value={regForm.name}
                onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Farm</label>
              <select
                value={regForm.farmId}
                onChange={(e) => {
                  const fz = zones.find((z) => z.farmId === e.target.value);
                  setRegForm({ ...regForm, farmId: e.target.value, zoneId: fz?.id || '' });
                }}
                className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Zone</label>
              <select
                value={regForm.zoneId}
                onChange={(e) => setRegForm({ ...regForm, zoneId: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
              >
                {zones
                  .filter((z) => z.farmId === regForm.farmId)
                  .map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowRegister(false)} className="px-4 py-2 text-xs border border-stone-200 rounded-md hover:bg-stone-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800">
              Register Node
            </button>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
