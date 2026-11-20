import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, MapPin, AlertTriangle, CheckCircle2, Droplets, Thermometer, Shield } from 'lucide-react';
import { api } from '../api/client.ts';
import { HealthStatusLabel, RiskCategoryLabel, LoadingSkeleton, ErrorBanner } from './ui/CommonPrimitives.tsx';

interface ZoneDetailDrawerProps {
  zoneId: string | null;
  onClose: () => void;
  onNavigateModule: (moduleId: string) => void;
  onZoneUpdated?: () => void;
}

export function ZoneDetailDrawer({
  zoneId,
  onClose,
  onNavigateModule,
  onZoneUpdated,
}: ZoneDetailDrawerProps) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [obsNotes, setObsNotes] = useState('');
  const [obsStatus, setObsStatus] = useState<'healthy' | 'suspected' | 'confirmed'>('suspected');
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getZoneDetail(id);
      setDetail(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load zone intelligence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (zoneId) {
      loadDetail(zoneId);
    } else {
      setDetail(null);
    }
  }, [zoneId]);

  const handleQuickObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.zone) return;
    setSubmitting(true);
    try {
      await api.createObservation({
        farmId: detail.zone.farmId,
        zoneId: detail.zone.id,
        diseaseName:
          obsStatus === 'healthy'
            ? `${detail.zone.cropType} Healthy Canopy`
            : `${detail.zone.cropType} Field Symptom Log`,
        observationStatus: obsStatus,
        severityClass: obsStatus === 'healthy' ? 'Healthy' : 'Mild',
        notes: obsNotes || 'Logged directly from Digital Twin zone inspection.',
      });
      setObsNotes('');
      await loadDetail(detail.zone.id);
      onZoneUpdated?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {zoneId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white h-full border-l border-stone-200 shadow-2xl flex flex-col overflow-hidden"
          >
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4 bg-stone-50">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">
              Farm Digital Twin · Zone Intelligence {detail?.zone?.isDemo ? '· DEMO DATA' : ''}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 truncate">
              {detail?.zone ? `${detail.zone.name} — ${detail.zone.farmName}` : 'Loading Zone...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close zone intelligence drawer"
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-stone-200/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && <LoadingSkeleton rows={6} />}
          {error && <ErrorBanner message={error} onRetry={() => loadDetail(zoneId)} />}

          {detail && !loading && (
            <>
              {/* Key Status Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-stone-200 rounded-lg p-3">
                  <div className="text-xs text-slate-500">Health Status</div>
                  <div className="mt-1">
                    <HealthStatusLabel status={detail.zone.healthStatus} />
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3">
                  <div className="text-xs text-slate-500">Env. Disease Risk</div>
                  <div className="mt-1">
                    <RiskCategoryLabel category={detail.zone.riskCategory} score={detail.zone.riskScore} />
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3">
                  <div className="text-xs text-slate-500">Crop & Stage</div>
                  <div className="text-sm font-medium text-slate-900 mt-1 truncate">
                    {detail.zone.cropType} · {detail.zone.growthStage}
                  </div>
                </div>
                <div className="border border-stone-200 rounded-lg p-3">
                  <div className="text-xs text-slate-500">Coordinates</div>
                  <div className="text-xs font-mono tabular-nums text-slate-800 mt-1.5">
                    {detail.zone.latitude.toFixed(4)}, {detail.zone.longitude.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Latest Weather & Soil Telemetry */}
              <div className="border border-stone-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Recent Weather & Soil Telemetry</h3>
                  <span className="text-xs text-slate-500">{detail.zone.variety} · Planted {detail.zone.plantingDate}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-stone-50 rounded p-2.5">
                    <div className="text-slate-500 flex items-center gap-1"><Thermometer className="w-3.5 h-3.5" /> Air Temp</div>
                    <div className="font-mono font-semibold text-slate-900 text-sm mt-1">
                      {detail.weather[0]?.temperature_c ?? '—'} °C
                    </div>
                  </div>
                  <div className="bg-stone-50 rounded p-2.5">
                    <div className="text-slate-500 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> Humidity</div>
                    <div className="font-mono font-semibold text-slate-900 text-sm mt-1">
                      {detail.weather[0]?.humidity_pct ?? '—'} %
                    </div>
                  </div>
                  <div className="bg-stone-50 rounded p-2.5">
                    <div className="text-slate-500">Soil Moisture</div>
                    <div className="font-mono font-semibold text-slate-900 text-sm mt-1">
                      {detail.soil[0]?.soil_moisture_pct ?? '—'} %
                    </div>
                  </div>
                  <div className="bg-stone-50 rounded p-2.5">
                    <div className="text-slate-500">Soil pH</div>
                    <div className="font-mono font-semibold text-slate-900 text-sm mt-1">
                      {detail.soil[0]?.soil_ph ?? '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Explainable Risk Factors */}
              {detail.latestRisk && (
                <div className="border border-stone-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Multimodal Risk Factors ({detail.latestRisk.targetDisease})
                    </h3>
                    <span className="text-xs text-slate-500">
                      {detail.latestRisk.environmentalVsConfirmed === 'confirmed_disease_present'
                        ? 'Confirmed Pathogen Active'
                        : 'Environmental Risk Only'}
                    </span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {detail.latestRisk.contributingFactors.map((f: any, idx: number) => (
                      <div key={idx} className="py-2 flex items-start justify-between gap-4 text-xs">
                        <div>
                          <div className="font-medium text-slate-900">{f.factor}</div>
                          <div className="text-slate-600 mt-0.5">{f.rationale}</div>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <div className="font-semibold text-slate-900">+{f.contributionPoints} pts</div>
                          <div className="text-slate-500">{f.observedValue}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Neighbouring Zone Spatial Analysis */}
              <div className="border border-stone-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-800" />
                    Neighbouring Zone Spatial Analysis
                  </h3>
                  <span className="text-xs text-slate-500">Within 2.5 km radius</span>
                </div>
                {detail.neighbours.length === 0 ? (
                  <p className="text-xs text-slate-500">No neighbouring crop zones mapped within 2.5 km.</p>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {detail.neighbours.map((n: any) => (
                      <div key={n.zone.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {n.zone.name} · <span className="font-mono text-slate-500">{n.distanceMeters}m away</span>
                          </div>
                          <div className="text-slate-600 mt-0.5">{n.note}</div>
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          <HealthStatusLabel status={n.zone.healthStatus} />
                          {n.requiresPriorityInspection && (
                            <div className="text-[11px] font-medium text-amber-700 flex items-center justify-end gap-1">
                              <AlertTriangle className="w-3 h-3" /> Priority Scouting
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observation History */}
              <div className="border border-stone-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Disease Observation History</h3>
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateModule('scanner');
                    }}
                    className="text-xs font-medium text-emerald-800 hover:underline"
                  >
                    Open Disease Scanner
                  </button>
                </div>
                {detail.observations.length === 0 ? (
                  <p className="text-xs text-slate-500">No observations recorded for this zone yet.</p>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {detail.observations.map((o: any) => (
                      <div key={o.id} className="py-2.5 text-xs flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-slate-900">
                            {o.diseaseName} · <span className="text-slate-500">{o.severityClass}</span>
                          </div>
                          <div className="text-slate-600 mt-0.5">{o.notes}</div>
                          <div className="text-slate-400 mt-0.5 font-mono">
                            {o.observedAt.slice(0, 10)} · Expert: {o.expertReviewStatus}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-slate-700 shrink-0">
                          {o.affectedAreaPct}% area
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Advisory Recommendations */}
              {detail.advisory.length > 0 && (
                <div className="border border-stone-200 rounded-lg p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-800" />
                    Preventive Guidance ({detail.zone.cropType})
                  </h3>
                  {detail.advisory.slice(0, 1).map((adv: any) => (
                    <div key={adv.id} className="text-xs text-slate-700 space-y-1.5">
                      <div className="font-medium text-slate-900">{adv.diseaseName} ({adv.pathogen})</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {adv.preventiveMeasures.slice(0, 3).map((m: string, idx: number) => (
                          <li key={idx}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Inspection Log Form */}
              <form onSubmit={handleQuickObservation} className="border border-stone-200 rounded-lg p-4 space-y-3 bg-stone-50">
                <h3 className="text-sm font-semibold text-slate-900">Log Zone Inspection Update</h3>
                <div className="flex flex-wrap gap-2">
                  {(['healthy', 'suspected', 'confirmed'] as const).map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setObsStatus(st)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        obsStatus === st
                          ? 'bg-emerald-900 text-white border-emerald-900'
                          : 'bg-white text-slate-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {st === 'healthy' ? 'Mark Healthy' : st === 'suspected' ? 'Flag Suspected' : 'Confirm Infection'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={obsNotes}
                  onChange={(e) => setObsNotes(e.target.value)}
                  rows={2}
                  placeholder="Enter scouting notes, leaf symptom position, or treatment verification..."
                  className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {submitting ? 'Saving...' : 'Save Inspection Log'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
