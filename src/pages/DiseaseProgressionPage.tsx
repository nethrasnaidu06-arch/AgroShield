import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BellPlus, CalendarClock, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../api/client.ts';
import { FarmZone, SeverityClass, TreatmentRecord } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  HealthStatusLabel,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  SeverityLabel,
} from '../components/ui/CommonPrimitives.tsx';
import { ImageComparisonSlider } from '../components/ImageComparisonSlider.tsx';

interface TimelineEntry {
  id: string;
  timestamp: string;
  farmId: string;
  zoneId: string;
  cropType: string;
  diseaseName: string;
  affectedAreaPct: number;
  severityClass: SeverityClass;
  imageUrl: string | null;
  originalImageUrl: string | null;
  measurementType: 'measured_severity' | 'visual_assessment';
  sourceLabel: string;
  notes: string;
  isDemo: boolean;
}

interface ProgressionResponse {
  zones: FarmZone[];
  activeZone: FarmZone | null;
  timeline: TimelineEntry[];
  comparisonSummary: {
    totalRecords: number;
    measuredCount: number;
    visualEstimateCount: number;
    deltaPct: number;
    trendStatus: 'improving' | 'worsening' | 'stable' | 'insufficient_history';
    earliestImage: TimelineEntry | null;
    latestImage: TimelineEntry | null;
  };
  treatments: TreatmentRecord[];
  reminders: any[];
}

const TREND_LABELS: Record<string, { label: string; tone: 'healthy' | 'danger' | 'warning' | 'neutral' }> = {
  improving: { label: 'Improving (Lesion Reduction)', tone: 'healthy' },
  worsening: { label: 'Worsening (Lesion Expansion)', tone: 'danger' },
  stable: { label: 'Stable (+/- 2% Band)', tone: 'warning' },
  insufficient_history: { label: 'Insufficient History (<2)', tone: 'neutral' },
};

const OUTCOME_LABELS: Record<string, string> = {
  pending_evaluation: 'Pending Evaluation',
  improving: 'Improving',
  no_change: 'No Change',
  worsened: 'Worsened',
};

export function DiseaseProgressionPage({ onAlertsChanged }: { onAlertsChanged?: () => void }) {
  const [data, setData] = useState<ProgressionResponse | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [baselineId, setBaselineId] = useState<string>('');
  const [followupId, setFollowupId] = useState<string>('');
  const [reminderNote, setReminderNote] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [updatingTreatmentId, setUpdatingTreatmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProgression = async (zoneId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res: ProgressionResponse = await api.getProgression(zoneId || undefined);
      setData(res);
      if (res.activeZone) {
        setSelectedZoneId(res.activeZone.id);
      }
      const imgItems = res.timeline.filter((t) => Boolean(t.originalImageUrl || t.imageUrl));
      if (imgItems.length >= 2) {
        setBaselineId(imgItems[0].id);
        setFollowupId(imgItems[imgItems.length - 1].id);
      } else if (imgItems.length === 1) {
        setBaselineId(imgItems[0].id);
        setFollowupId(imgItems[0].id);
      } else {
        setBaselineId('');
        setFollowupId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load disease progression timeline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProgression();
  }, []);

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setNotice(null);
    loadProgression(zoneId);
  };

  const imageEntries = useMemo(() => {
    if (!data) return [];
    return data.timeline.filter((t) => Boolean(t.originalImageUrl || t.imageUrl));
  }, [data]);

  const baselineEntry = useMemo(
    () => imageEntries.find((e) => e.id === baselineId) || data?.comparisonSummary?.earliestImage || null,
    [imageEntries, baselineId, data]
  );

  const followupEntry = useMemo(
    () => imageEntries.find((e) => e.id === followupId) || data?.comparisonSummary?.latestImage || null,
    [imageEntries, followupId, data]
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.timeline.map((item) => ({
      date: item.timestamp.slice(0, 10),
      measuredAreaPct: item.measurementType === 'measured_severity' ? item.affectedAreaPct : null,
      visualEstimatePct: item.measurementType === 'visual_assessment' ? item.affectedAreaPct : null,
      diseaseName: item.diseaseName,
      severityClass: item.severityClass,
    }));
  }, [data]);

  const handleScheduleReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.activeZone) return;
    setSavingReminder(true);
    setError(null);
    setNotice(null);
    try {
      await api.createProgressionReminder({
        farmId: data.activeZone.farmId,
        zoneId: data.activeZone.id,
        dueNote:
          reminderNote.trim() ||
          `Follow-up leaf scan & lesion comparison scheduled for ${data.activeZone.name} (${data.activeZone.cropType}).`,
      });
      setReminderNote('');
      setNotice('Follow-up inspection reminder logged and dispatched to the Alert Centre.');
      onAlertsChanged?.();
      await loadProgression(data.activeZone.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingReminder(false);
    }
  };

  const handleUpdateTreatmentOutcome = async (
    treatmentId: string,
    outcomeStatus: 'pending_evaluation' | 'improving' | 'no_change' | 'worsened'
  ) => {
    setUpdatingTreatmentId(treatmentId);
    setError(null);
    setNotice(null);
    try {
      await api.updateTreatmentOutcome(treatmentId, { outcomeStatus });
      setNotice(`Treatment outcome updated to "${OUTCOME_LABELS[outcomeStatus]}".`);
      if (data?.activeZone) {
        await loadProgression(data.activeZone.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingTreatmentId(null);
    }
  };

  const summary = data?.comparisonSummary;
  const activeZone = data?.activeZone;
  const trendMeta = summary ? TREND_LABELS[summary.trendStatus] : TREND_LABELS.insufficient_history;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disease Progression Monitoring"
        subtitle="Longitudinal same-zone, same-crop leaf image comparison, measured severity vs. visual estimate tracking, and treatment outcome verification."
        action={
          <select
            value={selectedZoneId}
            onChange={(e) => handleZoneChange(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900 max-w-xs"
            aria-label="Select farm zone for disease progression"
          >
            {(data?.zones || []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.district} · {z.farmName?.split(' — ')[0]} · {z.name} ({z.cropType})
              </option>
            ))}
          </select>
        }
      />

      <DemoDisclaimerBar text="Progression pairs strictly compare observations matching the identical Farm Zone and Crop Type. Measured Pixel Segmentation records (from Severity Analysis) are separated from Approximate Visual Field Estimates." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={notice} />

      {loading || !data ? (
        <LoadingSkeleton rows={7} />
      ) : (
        <>
          {activeZone && (
            <motion.div
              key={activeZone.id}
              initial={{ opacity: 0.6, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs agro-card-hover"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-slate-900">{activeZone.farmName}</span>
                <span className="text-slate-400">·</span>
                <span className="font-medium text-emerald-900">
                  {activeZone.zoneCode} ({activeZone.name})
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-700">
                  Crop: <strong>{activeZone.cropType}</strong> ({activeZone.growthStage})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <HealthStatusLabel status={activeZone.healthStatus} />
                <span className="font-mono text-slate-500">
                  {activeZone.isDemo ? 'DEMO DATASET' : 'LIVE ZONE'}
                </span>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCell
              label="Progression Trend"
              value={trendMeta.label.split(' ')[0]}
              tone={trendMeta.tone}
              subtext={trendMeta.label}
            />
            <MetricCell
              label="Affected Area Delta"
              value={`${summary && summary.deltaPct > 0 ? '+' : ''}${summary?.deltaPct ?? 0}%`}
              tone={
                (summary?.deltaPct ?? 0) <= -2
                  ? 'healthy'
                  : (summary?.deltaPct ?? 0) >= 2
                  ? 'danger'
                  : 'neutral'
              }
              subtext="Earliest vs. latest comparable capture"
            />
            <MetricCell
              label="Measured Pixel Scans"
              value={summary?.measuredCount ?? 0}
              tone="forest"
              subtext="Quantitative lesion segmentation"
            />
            <MetricCell
              label="Visual Field Estimates"
              value={summary?.visualEstimateCount ?? 0}
              tone="warning"
              subtext="Approximate scouting assessments"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Temporal Leaf Image Alignment &amp; Comparison
                </h2>
                <span className="text-[11px] font-mono text-slate-500">
                  Same-Zone Match ({activeZone?.cropType})
                </span>
              </div>

              {imageEntries.length >= 1 && baselineEntry && followupEntry ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-slate-600 font-medium block">Baseline Capture</span>
                      <select
                        value={baselineEntry.id}
                        onChange={(e) => setBaselineId(e.target.value)}
                        className="w-full rounded border border-stone-200 px-2.5 py-1.5 bg-white text-slate-900"
                      >
                        {imageEntries.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.timestamp.slice(0, 10)} · {item.affectedAreaPct}% (
                            {item.measurementType === 'measured_severity' ? 'Measured' : 'Visual'})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-600 font-medium block">Follow-Up Capture</span>
                      <select
                        value={followupEntry.id}
                        onChange={(e) => setFollowupId(e.target.value)}
                        className="w-full rounded border border-stone-200 px-2.5 py-1.5 bg-white text-slate-900"
                      >
                        {imageEntries.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.timestamp.slice(0, 10)} · {item.affectedAreaPct}% (
                            {item.measurementType === 'measured_severity' ? 'Measured' : 'Visual'})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <ImageComparisonSlider
                    originalUrl={baselineEntry.originalImageUrl || baselineEntry.imageUrl || ''}
                    analyzedUrl={followupEntry.imageUrl || followupEntry.originalImageUrl || ''}
                    originalLabel={`${baselineEntry.timestamp.slice(0, 10)} · ${baselineEntry.affectedAreaPct}%`}
                    analyzedLabel={`${followupEntry.timestamp.slice(0, 10)} · ${followupEntry.affectedAreaPct}%`}
                    enableAlignmentControls={true}
                  />

                  <div className="bg-stone-50 border border-stone-200 rounded p-3 text-xs text-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <strong>Pair Change:</strong>{' '}
                      {Number((followupEntry.affectedAreaPct - baselineEntry.affectedAreaPct).toFixed(1)) > 0
                        ? `+${(followupEntry.affectedAreaPct - baselineEntry.affectedAreaPct).toFixed(1)}% expansion`
                        : Number((followupEntry.affectedAreaPct - baselineEntry.affectedAreaPct).toFixed(1)) < 0
                        ? `${(followupEntry.affectedAreaPct - baselineEntry.affectedAreaPct).toFixed(1)}% recovery`
                        : '0.0% unchanged'}
                    </div>
                    <div className="text-slate-500">
                      {baselineEntry.measurementType === followupEntry.measurementType
                        ? baselineEntry.measurementType === 'measured_severity'
                          ? 'Comparable Measured Scans'
                          : 'Comparable Visual Estimates'
                        : 'Mixed Basis (Measured vs Visual)'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="border border-dashed border-stone-300 rounded-lg p-8 text-center text-xs text-slate-500">
                  No leaf images recorded for this zone yet. Capture baseline and follow-up scans via the AI Disease
                  Scanner or Severity Analysis modules to unlock temporal image alignment.
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Severity &amp; Affected-Area Curve
                </h2>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  {(summary?.deltaPct ?? 0) <= 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-red-700" />
                  )}
                  Measured vs. Visual Series
                </span>
              </div>

              {chartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line
                        type="monotone"
                        dataKey="measuredAreaPct"
                        name="Measured Pixel Area %"
                        stroke="#14532D"
                        strokeWidth={2.5}
                        connectNulls
                        dot={{ r: 4, fill: '#14532D' }}
                        animationDuration={650}
                      />
                      <Line
                        type="monotone"
                        dataKey="visualEstimatePct"
                        name="Approx. Visual Estimate %"
                        stroke="#D97706"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        connectNulls
                        dot={{ r: 4, fill: '#D97706' }}
                        animationDuration={650}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500 border border-stone-100 rounded">
                  No progression points recorded for this zone yet.
                </div>
              )}

              <div className="pt-2 border-t border-stone-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-emerald-800" />
                  Schedule Follow-Up Inspection Reminder
                </h3>
                <form onSubmit={handleScheduleReminder} className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                    placeholder="e.g., Re-scan upper canopy after 72h copper spray check"
                    className="flex-1 rounded border border-stone-200 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={savingReminder || !activeZone}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-900 text-white rounded hover:bg-emerald-800 disabled:opacity-40 whitespace-nowrap"
                  >
                    <BellPlus className="w-3.5 h-3.5" />
                    {savingReminder ? 'Scheduling...' : 'Add Reminder'}
                  </button>
                </form>
                {data.reminders.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 max-h-28 overflow-y-auto">
                    {data.reminders.slice(0, 4).map((r) => (
                      <div key={r.id} className="text-[11px] text-slate-700 bg-stone-50 border border-stone-200 rounded px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="truncate">{r.message}</span>
                        <span className="font-mono text-slate-400 shrink-0">{r.createdAt?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover">
              <h2 className="text-sm font-semibold text-slate-900">
                Chronological Zone Records ({data.timeline.length})
              </h2>
              <div className="divide-y divide-stone-100 max-h-[340px] overflow-y-auto">
                {data.timeline.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">No historical observations or severity scans logged for this zone.</p>
                ) : (
                  data.timeline.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{ animationDelay: `${Math.min(idx, 12) * 20}ms` }}
                      className="py-3 text-xs flex items-start justify-between gap-4 agro-row-enter"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{item.diseaseName}</span>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              item.measurementType === 'measured_severity'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {item.sourceLabel}
                          </span>
                        </div>
                        <p className="text-slate-600">{item.notes}</p>
                        <div className="text-[11px] font-mono text-slate-400">{item.timestamp.slice(0, 16).replace('T', ' ')}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <SeverityLabel severity={item.severityClass} />
                        <div className="font-mono text-slate-700 font-medium mt-1">{item.affectedAreaPct}% area</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover">
              <h2 className="text-sm font-semibold text-slate-900">
                Treatment Outcome Tracking ({data.treatments.length})
              </h2>
              <div className="space-y-3 max-h-[340px] overflow-y-auto">
                {data.treatments.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No treatments recorded for this zone yet. Log interventions from the Farm Digital Twin drawer or Advisory module.
                  </p>
                ) : (
                  data.treatments.map((t, idx) => (
                    <div
                      key={t.id}
                      style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}
                      className="border border-stone-200 rounded-md p-3 space-y-2 text-xs agro-row-enter"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{t.productOrMethod}</div>
                          <div className="text-slate-500 mt-0.5">
                            {t.dosage} · Applied by {t.appliedBy}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {t.appliedAt?.slice(0, 10)}
                        </span>
                      </div>
                      <div className="text-slate-600">{t.outcomeNotes}</div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100">
                        <span className="text-[11px] font-medium text-slate-700">
                          Outcome: <strong>{OUTCOME_LABELS[t.outcomeStatus || 'pending_evaluation']}</strong>
                          {t.expertVerified && <span className="text-emerald-700"> · Expert Verified</span>}
                        </span>
                        <div className="inline-flex gap-1">
                          {(['improving', 'no_change', 'worsened'] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={updatingTreatmentId === t.id}
                              onClick={() => handleUpdateTreatmentOutcome(t.id, status)}
                              className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                                t.outcomeStatus === status
                                  ? 'bg-emerald-900 text-white border-emerald-900'
                                  : 'bg-white text-slate-600 border-stone-200 hover:bg-stone-50'
                              }`}
                            >
                              {OUTCOME_LABELS[status]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
