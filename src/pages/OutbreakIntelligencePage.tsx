import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Lock, Radar, ShieldAlert, TrendingUp } from 'lucide-react';
import { api } from '../api/client.ts';
import { CropType, OutbreakCluster, UserRole } from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
} from '../components/ui/CommonPrimitives.tsx';

const INVESTIGATION_LABELS: Record<string, string> = {
  monitoring: 'Monitoring',
  under_investigation: 'Under Investigation',
  confirmed: 'Expert-Confirmed Outbreak',
  contained: 'Contained',
};

export function OutbreakIntelligencePage({
  activeRole,
  onAlertsChanged,
}: {
  activeRole?: UserRole;
  onAlertsChanged?: () => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [clusters, setClusters] = useState<OutbreakCluster[]>([]);
  const [daysWindow, setDaysWindow] = useState<number>(30);
  const [cropFilter, setCropFilter] = useState<string>('all');
  const [selectedCluster, setSelectedCluster] = useState<OutbreakCluster | null>(null);
  const [investigationStatus, setInvestigationStatus] = useState<string>('under_investigation');
  const [expertNotes, setExpertNotes] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canInvestigate = activeRole === UserRole.EXPERT || activeRole === UserRole.ADMIN;

  const loadOutbreaks = async (days: number, crop: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getOutbreaks(days, crop);
      setClusters(list);
      if (list.length > 0) {
        const next = (selectedCluster && list.find((c: OutbreakCluster) => c.clusterId === selectedCluster.clusterId)) || list[0];
        setSelectedCluster(next);
        setInvestigationStatus(next.investigationStatus);
        setExpertNotes(next.expertNotes || '');
      } else {
        setSelectedCluster(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutbreaks(daysWindow, cropFilter);
  }, [daysWindow, cropFilter]);

  useEffect(() => {
    if (loading || !mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [14.1, 76.2],
      zoom: 7,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, [loading]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    clusters.forEach((c) => {
      const isConfirmed = c.classification === 'expert_confirmed_outbreak';
      const color = isConfirmed ? '#DC2626' : c.increasingTrend || c.recentReportsCount >= 2 ? '#D97706' : '#059669';
      const radiusMeters = Math.min(28000, Math.max(8000, (c.recentReportsCount + 1) * 4500));

      const circle = L.circle([c.latitude, c.longitude], {
        radius: radiusMeters,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: isConfirmed ? 0.34 : 0.2,
      });

      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: Math.min(12, 6 + c.recentReportsCount),
        color: '#0F172A',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      });

      const popupHtml = `
        <div style="font-size:12px;line-height:1.4;min-width:190px;">
          <div style="font-weight:700;color:#0F172A;">${c.regionLabel}</div>
          <div style="color:#475569;margin-bottom:4px;">${c.dominantDisease}</div>
          <div>Status: <strong>${isConfirmed ? 'Expert-Confirmed Outbreak' : 'Potential Cluster'}</strong></div>
          <div>Window Reports: <strong>${c.recentReportsCount}</strong> (Prior: ${c.priorWindowReportsCount})</div>
          <div>Aggregated Farms: <strong>${c.farmCount}</strong> · Zones: ${c.totalZones}</div>
          <div style="color:#64748B;font-size:11px;margin-top:4px;">Privacy Protected · Regional Aggregation Only</div>
        </div>
      `;

      circle.bindPopup(popupHtml);
      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedCluster(c);
        setInvestigationStatus(c.investigationStatus);
        setExpertNotes(c.expertNotes || '');
      });

      circle.addTo(group);
      marker.addTo(group);

      if (isConfirmed || c.increasingTrend || c.recentReportsCount >= 2) {
        const ringClass = isConfirmed
          ? 'agro-map-pulse-ring'
          : 'agro-map-pulse-ring agro-map-pulse-ring-amber';
        const pulseIcon = L.divIcon({
          className: '',
          html: `<div class="agro-map-pulse-wrap"><div class="${ringClass}"></div></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([c.latitude, c.longitude], { icon: pulseIcon, interactive: false }).addTo(group);
      }
    });
  }, [clusters]);

  const handleSaveInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCluster) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.investigateOutbreak(selectedCluster.clusterId, {
        district: selectedCluster.district,
        cropType: selectedCluster.cropType,
        dominantDisease: selectedCluster.dominantDisease,
        investigationStatus,
        expertNotes,
      });
      setNotice(
        investigationStatus === 'confirmed'
          ? `Regional outbreak confirmed for ${selectedCluster.regionLabel} and dispatched to Alert Centre.`
          : `Investigation status updated to ${INVESTIGATION_LABELS[investigationStatus] || investigationStatus}.`
      );
      if (investigationStatus === 'confirmed') {
        onAlertsChanged?.();
      }
      await loadOutbreaks(daysWindow, cropFilter);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmedOutbreaks = clusters.filter((c) => c.classification === 'expert_confirmed_outbreak').length;
  const potentialClusters = clusters.filter(
    (c) => c.classification === 'potential_cluster' && (c.recentReportsCount >= 1 || c.avgRiskScore >= 55)
  ).length;
  const increasingBelts = clusters.filter((c) => c.increasingTrend).length;

  const chartData = useMemo(() => clusters.slice(0, 12), [clusters]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community Outbreak Intelligence"
        subtitle="Geospatial disease clustering across Karnataka districts, time-window spike detection, and privacy-preserving regional expert investigation."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={daysWindow}
              onChange={(e) => setDaysWindow(Number(e.target.value))}
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-900"
              aria-label="Time window filter"
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
            <select
              value={cropFilter}
              onChange={(e) => setCropFilter(e.target.value)}
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-900"
              aria-label="Crop belt filter"
            >
              <option value="all">All Crop Belts</option>
              {Object.values(CropType).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="bg-emerald-950 text-emerald-50 rounded-lg px-4 py-3 text-xs flex items-center gap-2.5">
        <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
        <span>
          <strong>Farmer Privacy Safeguard:</strong> Community Outbreak Intelligence aggregates reports strictly by
          District &amp; Crop Belt centroids. Individual farmer identities, plot boundaries, and contact metadata are
          never exposed in regional cluster feeds.
        </span>
      </div>

      <DemoDisclaimerBar text="Using the 20 synthetic Karnataka demo farms plus any live farm observations. Potential Clusters represent unconfirmed automated groupings until verified by an Agricultural Expert." />

      {!canInvestigate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Viewing regional clusters as <strong>{activeRole || 'farmer'}</strong>. Switch to{' '}
            <strong>Agricultural Expert</strong> or <strong>Platform Admin</strong> to confirm or update regional
            outbreak investigations.
          </span>
        </div>
      )}

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={notice} />

      {loading ? (
        <LoadingSkeleton rows={7} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCell label="Regional Crop Belts" value={clusters.length} subtext={`${daysWindow}-day surveillance window`} />
            <MetricCell label="Potential Clusters" value={potentialClusters} tone="warning" subtext="Awaiting expert verification" />
            <MetricCell label="Confirmed Outbreaks" value={confirmedOutbreaks} tone="danger" subtext="Expert-confirmed regional threat" />
            <MetricCell label="Increasing Report Belts" value={increasingBelts} tone="forest" subtext="Recent > prior time window" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg overflow-hidden agro-card-hover">
              <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900">Regional Outbreak Hotspot Map (Aggregated Centroids)</span>
                <div className="flex items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Confirmed Outbreak
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Potential Cluster
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Baseline
                  </span>
                </div>
              </div>
              <div ref={mapContainerRef} className="w-full h-[380px] z-0" />
            </div>

            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
              <div className="border-b border-stone-200 pb-3">
                <div className="text-xs text-slate-500">Expert Investigation Workflow</div>
                <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
                  {selectedCluster ? selectedCluster.regionLabel : 'Select a cluster'}
                </h2>
              </div>

              {selectedCluster ? (
                <form onSubmit={handleSaveInvestigation} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 bg-stone-50 border border-stone-200 rounded p-3">
                    <div>
                      <span className="text-slate-500 block">Classification</span>
                      <strong className={selectedCluster.classification === 'expert_confirmed_outbreak' ? 'text-red-700' : 'text-amber-700'}>
                        {selectedCluster.classification === 'expert_confirmed_outbreak'
                          ? 'Expert-Confirmed Outbreak'
                          : 'Potential Cluster'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Report Trend ({daysWindow}d)</span>
                      <strong className="text-slate-900">
                        {selectedCluster.recentReportsCount} vs {selectedCluster.priorWindowReportsCount} prior
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Dominant Pathogen/Issue</span>
                      <strong className="text-slate-900">{selectedCluster.dominantDisease}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Regional Scope</span>
                      <strong className="text-slate-900">
                        {selectedCluster.farmCount} farms · {selectedCluster.totalZones} zones
                      </strong>
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Investigation Status</label>
                    <select
                      disabled={!canInvestigate}
                      value={investigationStatus}
                      onChange={(e) => setInvestigationStatus(e.target.value)}
                      className="w-full rounded border border-stone-200 px-3 py-2 bg-white disabled:bg-stone-50"
                    >
                      <option value="monitoring">Monitoring (Potential Cluster)</option>
                      <option value="under_investigation">Under Field Investigation</option>
                      <option value="confirmed">Confirm Regional Outbreak (Emit Alert)</option>
                      <option value="contained">Contained / Post-Outbreak Surveillance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Regional Pathologist Assessment Notes</label>
                    <textarea
                      disabled={!canInvestigate}
                      rows={3}
                      value={expertNotes}
                      onChange={(e) => setExpertNotes(e.target.value)}
                      placeholder="Summarize cross-farm scouting findings or regional containment advice..."
                      className="w-full rounded border border-stone-200 px-3 py-2 disabled:bg-stone-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!canInvestigate || saving}
                    className="w-full py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-40"
                  >
                    {saving ? 'Updating Investigation...' : 'Save Regional Investigation Status'}
                  </button>
                </form>
              ) : (
                <p className="text-xs text-slate-500">No regional clusters matched your current crop filter.</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Window Comparison: Recent vs. Prior Reports &amp; Regional Risk
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="district" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-20} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="recentReportsCount" name={`Reports (${daysWindow}d)`} fill="#DC2626" animationDuration={650} />
                  <Bar dataKey="priorWindowReportsCount" name="Prior Window" fill="#94A3B8" animationDuration={650} />
                  <Bar dataKey="avgRiskScore" name="Avg Risk Score" fill="#166534" animationDuration={650} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-3">
              <Radar className="w-4 h-4 text-emerald-800" />
              Aggregated Regional Cluster Matrix
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-2 font-medium">Region &amp; Crop Belt</th>
                    <th className="py-2 font-medium">Classification</th>
                    <th className="py-2 font-medium">Dominant Disease</th>
                    <th className="py-2 font-medium text-right">Reports ({daysWindow}d)</th>
                    <th className="py-2 font-medium text-right">Trend</th>
                    <th className="py-2 font-medium text-right">Avg Risk</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {clusters.map((c, idx) => (
                    <tr
                      key={c.clusterId}
                      style={{ animationDelay: `${Math.min(idx, 12) * 25}ms` }}
                      className="hover:bg-stone-50 transition-colors agro-row-enter"
                    >
                      <td className="py-2.5 font-medium text-slate-900">
                        {c.district} · {c.cropType}
                        <div className="text-[11px] font-normal text-slate-500">
                          {c.farmCount} farms · {c.totalZones} zones
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`font-medium ${
                            c.classification === 'expert_confirmed_outbreak'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {c.classification === 'expert_confirmed_outbreak'
                            ? 'Expert-Confirmed Outbreak'
                            : 'Potential Cluster'}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {INVESTIGATION_LABELS[c.investigationStatus] || c.investigationStatus}
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-700">{c.dominantDisease}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-900">
                        {c.recentReportsCount}
                      </td>
                      <td className="py-2.5 text-right">
                        {c.increasingTrend ? (
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <TrendingUp className="w-3.5 h-3.5" /> Rising
                          </span>
                        ) : (
                          <span className="text-slate-500">Stable</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-900">{c.avgRiskScore}/100</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCluster(c);
                            setInvestigationStatus(c.investigationStatus);
                            setExpertNotes(c.expertNotes || '');
                          }}
                          className="text-emerald-800 hover:underline font-medium"
                        >
                          Inspect
                        </button>
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
