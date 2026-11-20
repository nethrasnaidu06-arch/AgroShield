import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../api/client.ts';
import { RiskAssessment, RiskCategory } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  RiskCategoryLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function DiseaseRiskPage() {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selected, setSelected] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRisks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRiskAssessments();
      setAssessments(res);
      if (res[0]) setSelected(res[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRisks();
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setNotice(null);
    try {
      const res = await api.recalculateRisks();
      setNotice(
        `Recalculated multimodal disease risk across ${res.recalculatedZones} crop zones (${res.highEnvironmentalWarnings} critical environmental-only alerts flagged).`
      );
      await loadRisks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const criticalCount = assessments.filter((a) => a.riskCategory === RiskCategory.CRITICAL).length;
  const highCount = assessments.filter((a) => a.riskCategory === RiskCategory.HIGH).length;
  const envOnlyHigh = assessments.filter(
    (a) =>
      (a.riskCategory === RiskCategory.CRITICAL || a.riskCategory === RiskCategory.HIGH) &&
      a.environmentalVsConfirmed === 'environmental_risk'
  ).length;

  const farmComparison = Array.from(
    assessments.reduce((acc, a) => {
      const name = (a.farmName || a.farmId).split(' — ')[0];
      if (!acc.has(name)) acc.set(name, { farm: name, sum: 0, count: 0 });
      const entry = acc.get(name)!;
      entry.sum += a.riskScore;
      entry.count += 1;
      return acc;
    }, new Map<string, { farm: string; sum: number; count: number }>())
  )
    .map(([, v]) => ({ farm: v.farm, avgRisk: Math.round(v.sum / v.count) }))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disease Risk Prediction Engine"
        subtitle="Explainable multimodal risk assessment combining crop type, growth stage, temperature, humidity, rainfall, soil moisture, and neighbouring disease observations."
        action={
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Evaluating 72 Zones...' : 'Recalculate Multimodal Risk'}
          </button>
        }
      />

      <DemoDisclaimerBar text="EXPLAINABLE RULE ENGINE (v1.0): Scores 0–100 are derived transparently from biological pathogen thresholds and telemetry. Environmental risk is strictly separated from confirmed field infection. Scikit-learn ML calibration slot is prepared for multi-season datasets." />

      {error && <ErrorBanner message={error} onRetry={loadRisks} />}
      <AnimatedNotice message={notice} />

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCell label="Zones Evaluated" value={assessments.length} subtext="Multimodal inputs" />
            <MetricCell label="Critical Risk (≥75)" value={criticalCount} tone="danger" subtext="Immediate (6h) scouting" />
            <MetricCell label="High Risk (55–74)" value={highCount} tone="warning" subtext="Urgent (24h) inspection" />
            <MetricCell
              label="Environmental Early Warnings"
              value={envOnlyHigh}
              tone="forest"
              subtext="High risk WITHOUT confirmed disease"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Ranked Risk Matrix */}
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover">
              <h2 className="text-sm font-semibold text-slate-900">Zone Risk Ranking & Inspection Priority</h2>
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-slate-500">
                      <th className="py-2 font-medium">Zone & Farm</th>
                      <th className="py-2 font-medium">Crop</th>
                      <th className="py-2 font-medium">Basis</th>
                      <th className="py-2 font-medium">Priority</th>
                      <th className="py-2 font-medium text-right">Risk Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {assessments.map((a, idx) => (
                      <tr
                        key={a.id}
                        onClick={() => setSelected(a)}
                        style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
                        className={`agro-row-enter cursor-pointer transition-colors ${
                          selected?.id === a.id ? 'bg-emerald-50' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="py-2.5">
                          <div className="font-medium text-slate-900">{a.zoneName}</div>
                          <div className="text-[11px] text-slate-500">{a.farmName}</div>
                        </td>
                        <td className="py-2.5 text-slate-700">{a.cropType}</td>
                        <td className="py-2.5">
                          {a.environmentalVsConfirmed === 'confirmed_disease_present' ? (
                            <span className="text-red-700 font-medium">Confirmed Pathogen</span>
                          ) : (
                            <span className="text-amber-700 font-medium">Environmental Risk</span>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-700">{a.inspectionPriority}</td>
                        <td className="py-2.5 text-right">
                          <RiskCategoryLabel category={a.riskCategory} score={a.riskScore} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Explainable Driver Inspector */}
            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="border-b border-stone-200 pb-3">
                    <div className="text-xs text-slate-500">{selected.targetDisease}</div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <h3 className="text-base font-semibold text-slate-900">{selected.zoneName}</h3>
                      <RiskCategoryLabel category={selected.riskCategory} score={selected.riskScore} />
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Classification:{' '}
                      <strong>
                        {selected.environmentalVsConfirmed === 'confirmed_disease_present'
                          ? 'Confirmed Disease Present'
                          : 'Environmental Risk Only (Not Yet Infected)'}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-800" />
                      Contributing Risk Drivers
                    </div>
                    <div className="divide-y divide-stone-100 border border-stone-200 rounded-md px-3">
                      {selected.contributingFactors.map((f, idx) => (
                        <div key={idx} className="py-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900">{f.factor}</span>
                            <span className="font-mono font-semibold text-emerald-900">+{f.contributionPoints} pts</span>
                          </div>
                          <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden my-1.5">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, Math.max(8, f.contributionPoints * 2.5))}%` }}
                              transition={{ duration: 0.45, delay: idx * 0.05 }}
                              className="h-full bg-emerald-700 rounded-full"
                            />
                          </div>
                          <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                            Observed: {f.observedValue} · Threshold: {f.threshold}
                          </div>
                          <div className="text-slate-600 mt-1">{f.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-900 mb-1.5">Recommended Actions</div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
                      {selected.recommendedActions.map((act, idx) => (
                        <li key={idx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ) : (
                <p className="text-xs text-slate-500">Select a zone from the matrix to inspect risk drivers.</p>
              )}
            </div>
          </div>

          {/* Farm-wise Risk Comparison Chart */}
          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Farm-Wise Average Disease Risk Comparison</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={farmComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="farm" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Bar dataKey="avgRisk" name="Average Risk Score" fill="#166534" radius={[4, 4, 0, 0]} animationDuration={650} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
