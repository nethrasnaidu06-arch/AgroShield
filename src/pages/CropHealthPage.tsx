import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '../api/client.ts';
import { CropType, DiseaseObservation, FarmZone, SeverityClass } from '../types/agroshield.ts';
import {
  AnimatedModal,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  SeverityLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function CropHealthPage() {
  const [observations, setObservations] = useState<DiseaseObservation[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [cropFilter, setCropFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showLogModal, setShowLogModal] = useState(false);

  const [form, setForm] = useState({
    zoneId: '',
    diseaseName: '',
    observationStatus: 'suspected',
    severityClass: SeverityClass.MILD,
    affectedAreaPct: 8,
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [obs, zn] = await Promise.all([api.getObservations(), api.getZones()]);
      setObservations(obs);
      setZones(zn);
      if (zn[0]) setForm((p) => ({ ...p, zoneId: zn[0].id }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return observations.filter((o) => {
      if (cropFilter !== 'all' && o.cropType !== cropFilter) return false;
      if (statusFilter !== 'all' && o.observationStatus !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.diseaseName.toLowerCase().includes(q) ||
          (o.farmName || '').toLowerCase().includes(q) ||
          (o.zoneName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [observations, cropFilter, statusFilter, search]);

  const handleLogObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetZone = zones.find((z) => z.id === form.zoneId);
    if (!targetZone) return;
    try {
      await api.createObservation({
        farmId: targetZone.farmId,
        zoneId: targetZone.id,
        diseaseName: form.diseaseName || `${targetZone.cropType} Foliar Symptom`,
        observationStatus: form.observationStatus,
        severityClass: form.severityClass,
        affectedAreaPct: form.affectedAreaPct,
        notes: form.notes,
      });
      setShowLogModal(false);
      setForm((p) => ({ ...p, diseaseName: '', notes: '' }));
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crop Health Monitoring"
        subtitle="Longitudinal field observations, farm-wise crop surveillance, and pathology verification log across 72 zones."
        action={
          <button
            onClick={() => setShowLogModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Observation
          </button>
        }
      />

      <DemoDisclaimerBar text="Displaying 100+ synthetic demo disease observations alongside newly submitted field logs." />

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {/* Filter Bar */}
      <div className="bg-white border border-stone-200 rounded-lg p-4 flex flex-wrap items-center gap-3 agro-card-hover">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search farm, zone, or disease..."
            className="w-full rounded-md border border-stone-200 pl-8 pr-3 py-1.5 text-xs text-slate-900"
          />
        </div>
        <select
          value={cropFilter}
          onChange={(e) => setCropFilter(e.target.value)}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-800"
        >
          <option value="all">All 5 Crops</option>
          {Object.values(CropType).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-800"
        >
          <option value="all">All Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="suspected">Suspected</option>
          <option value="confirmed">Confirmed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
          <div className="text-xs text-slate-500 mb-3">
            Showing <strong className="font-mono text-slate-900">{filtered.length}</strong> of {observations.length} observations
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-2 font-medium">Observed</th>
                  <th className="py-2 font-medium">Farm & Zone</th>
                  <th className="py-2 font-medium">Crop</th>
                  <th className="py-2 font-medium">Diagnosis / Condition</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Severity</th>
                  <th className="py-2 font-medium text-right">Area %</th>
                  <th className="py-2 font-medium text-right">Expert Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.slice(0, 50).map((o, idx) => (
                  <tr
                    key={o.id}
                    style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
                    className="hover:bg-stone-50 transition-colors agro-row-enter"
                  >
                    <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">{o.observedAt.slice(0, 10)}</td>
                    <td className="py-2.5">
                      <div className="font-medium text-slate-900">{o.zoneName}</div>
                      <div className="text-[11px] text-slate-500">{o.farmName}</div>
                    </td>
                    <td className="py-2.5 text-slate-800">{o.cropType}</td>
                    <td className="py-2.5 font-medium text-slate-900">{o.diseaseName}</td>
                    <td className="py-2.5 capitalize text-slate-700">{o.observationStatus}</td>
                    <td className="py-2.5"><SeverityLabel severity={o.severityClass} /></td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-800">{o.affectedAreaPct}%</td>
                    <td className="py-2.5 text-right capitalize text-slate-600">{o.expertReviewStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatedModal open={showLogModal} onClose={() => setShowLogModal(false)} maxWidthClass="max-w-md">
        <form onSubmit={handleLogObservation} className="bg-white border border-stone-200 rounded-lg w-full p-6 space-y-4 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900">Log Field Crop Health Observation</h2>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Target Zone</label>
              <select
                value={form.zoneId}
                onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name} — {z.farmName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Observed Symptom / Disease</label>
              <input
                required
                value={form.diseaseName}
                onChange={(e) => setForm({ ...form, diseaseName: e.target.value })}
                placeholder="e.g., Early Blight Spots on Lower Leaves"
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Observation Status</label>
                <select
                  value={form.observationStatus}
                  onChange={(e) => setForm({ ...form, observationStatus: e.target.value })}
                  className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
                >
                  <option value="healthy">Healthy</option>
                  <option value="suspected">Suspected</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Severity Grade</label>
                <select
                  value={form.severityClass}
                  onChange={(e) => setForm({ ...form, severityClass: e.target.value as SeverityClass })}
                  className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
                >
                  {Object.values(SeverityClass).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLogModal(false)} className="px-4 py-2 text-xs border border-stone-200 rounded-md hover:bg-stone-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800">
              Save Observation
            </button>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
