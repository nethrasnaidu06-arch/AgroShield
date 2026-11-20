import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Printer } from 'lucide-react';
import { api } from '../api/client.ts';
import { DiseaseObservation, FarmZone, TreatmentRecord } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  HealthStatusLabel,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  RiskCategoryLabel,
  SeverityLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function ReportsPage() {
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [observations, setObservations] = useState<DiseaseObservation[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [datasetFilter, setDatasetFilter] = useState<'all' | 'real' | 'demo'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const triggerNotice = (msg: string) => {
    setExportNotice(msg);
    setTimeout(() => setExportNotice(null), 4000);
  };

  useEffect(() => {
    Promise.all([api.getZones(), api.getObservations(), api.getTreatments()])
      .then(([zn, obs, trt]) => {
        setZones(zn);
        setObservations(obs);
        setTreatments(trt);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredZones = useMemo(() => {
    if (datasetFilter === 'real') return zones.filter((z) => !z.isDemo);
    if (datasetFilter === 'demo') return zones.filter((z) => z.isDemo);
    return zones;
  }, [zones, datasetFilter]);

  const filteredObservations = useMemo(() => {
    if (datasetFilter === 'real') return observations.filter((o) => !o.isDemo);
    if (datasetFilter === 'demo') return observations.filter((o) => o.isDemo);
    return observations;
  }, [observations, datasetFilter]);

  const filteredTreatments = useMemo(() => {
    if (datasetFilter === 'real') return treatments.filter((t) => !t.isDemo);
    if (datasetFilter === 'demo') return treatments.filter((t) => t.isDemo);
    return treatments;
  }, [treatments, datasetFilter]);

  const isDemoQueryParam = datasetFilter === 'real' ? '&isDemo=0' : datasetFilter === 'demo' ? '&isDemo=1' : '';
  const healthyCount = filteredZones.filter((z) => z.healthStatus === 'healthy').length;
  const distinctFarms = new Set(filteredZones.map((z) => z.farmId)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Printable PDF Audits"
        subtitle="Downloadable CSV / JSON exports and print-ready PDF field audits with explicit separation between live farm records and synthetic demo data."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value as 'all' | 'real' | 'demo')}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
              aria-label="Filter report dataset source"
            >
              <option value="all">All Records (Live + Demo)</option>
              <option value="real">Real / Live Farm Records Only</option>
              <option value="demo">Synthetic Demo Dataset Only</option>
            </select>
            <a
              href={`/api/reports/export?format=csv${isDemoQueryParam}`}
              onClick={() => triggerNotice('Preparing CSV compliance audit export...')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </a>
            <a
              href={`/api/reports/export?format=json${isDemoQueryParam}`}
              onClick={() => triggerNotice('Preparing structured JSON audit payload...')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-stone-200 text-slate-800 rounded-md hover:bg-stone-50 whitespace-nowrap transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </a>
            <button
              type="button"
              onClick={() => {
                triggerNotice('Opening print-formatted PDF audit layout...');
                window.print();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-stone-200 text-slate-800 rounded-md hover:bg-stone-50 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        }
      />

      <DemoDisclaimerBar text="Every exported row explicitly stamps Dataset Source (REAL_LIVE vs DEMO) so compliance audits and agronomists never confuse synthetic test plots with real farmer submissions." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={exportNotice} />

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <motion.div
          key={datasetFilter}
          initial={{ opacity: 0.7, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="bg-white border border-stone-200 rounded-lg p-4 text-xs flex flex-wrap items-center justify-between gap-2 agro-card-hover">
            <div>
              <strong className="text-slate-900">AgroShield Audit Scope:</strong>{' '}
              {datasetFilter === 'real'
                ? 'Live / Operator-Submitted Farm Records Only'
                : datasetFilter === 'demo'
                ? 'Synthetic Karnataka Demo Farms Only'
                : 'Combined Surveillance Audit (Demo + Live)'}
            </div>
            <div className="font-mono text-slate-500">Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCell label="Farms in Scope" value={distinctFarms} />
            <MetricCell label="Zones Audited" value={filteredZones.length} />
            <MetricCell
              label="Healthy Share"
              value={`${filteredZones.length ? Math.round((healthyCount / filteredZones.length) * 100) : 0}%`}
              tone="healthy"
            />
            <MetricCell label="Observations Logged" value={filteredObservations.length} />
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Zone Health &amp; Risk Audit Matrix</h2>
            {filteredZones.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No zones match this filter yet. Register a real farm in Farm Management to populate Live-only reports.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-slate-500">
                      <th className="py-2 font-medium">District</th>
                      <th className="py-2 font-medium">Farm &amp; Zone</th>
                      <th className="py-2 font-medium">Crop &amp; Stage</th>
                      <th className="py-2 font-medium">Health Status</th>
                      <th className="py-2 font-medium">Risk Assessment</th>
                      <th className="py-2 font-medium">Source</th>
                      <th className="py-2 font-medium text-right">Last Inspected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredZones.map((z, idx) => (
                      <tr
                        key={z.id}
                        style={{ animationDelay: `${Math.min(idx, 12) * 16}ms` }}
                        className="hover:bg-stone-50 transition-colors agro-row-enter"
                      >
                        <td className="py-2 text-slate-700">{z.district}</td>
                        <td className="py-2 font-medium text-slate-900">
                          {z.farmName?.split(' — ')[0]} · {z.name}
                        </td>
                        <td className="py-2 text-slate-600">{z.cropType} ({z.growthStage})</td>
                        <td className="py-2"><HealthStatusLabel status={z.healthStatus} /></td>
                        <td className="py-2"><RiskCategoryLabel category={z.riskCategory} score={z.riskScore} /></td>
                        <td className="py-2 font-mono text-[11px] text-slate-500">{z.isDemo ? 'DEMO' : 'LIVE'}</td>
                        <td className="py-2 text-right font-mono text-slate-500">
                          {z.lastInspectedAt ? z.lastInspectedAt.slice(0, 10) : 'Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Disease Observations &amp; Verification</h3>
              <div className="divide-y divide-stone-100 text-xs">
                {filteredObservations.slice(0, 12).map((o, idx) => (
                  <div
                    key={o.id}
                    style={{ animationDelay: `${idx * 20}ms` }}
                    className="py-2 flex items-center justify-between gap-3 agro-row-enter"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{o.diseaseName}</div>
                      <div className="text-[11px] text-slate-500">
                        {o.farmName?.split(' — ')[0]} · {o.zoneName} · Review: {o.expertReviewStatus}
                      </div>
                    </div>
                    <SeverityLabel severity={o.severityClass} />
                  </div>
                ))}
                {filteredObservations.length === 0 && (
                  <p className="text-slate-500 py-3">No observations in selected scope.</p>
                )}
              </div>
            </div>

            <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Treatment Log &amp; Outcome Audit</h3>
              <div className="divide-y divide-stone-100 text-xs">
                {filteredTreatments.slice(0, 12).map((t: any, idx: number) => (
                  <div
                    key={t.id}
                    style={{ animationDelay: `${idx * 20}ms` }}
                    className="py-2 flex items-center justify-between gap-3 agro-row-enter"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{t.productOrMethod}</div>
                      <div className="text-[11px] text-slate-500">
                        {t.zoneName || t.zoneId} · {t.appliedAt?.slice(0, 10)} · {t.isDemo ? 'DEMO' : 'LIVE'}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-700">{t.outcomeStatus || 'pending_evaluation'}</span>
                  </div>
                ))}
                {filteredTreatments.length === 0 && (
                  <p className="text-slate-500 py-3">No treatments in selected scope.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
