import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Layers, MapPin } from 'lucide-react';
import { api } from '../api/client.ts';
import { Farm, FarmZone, IoTSensor, ZoneHealthStatus } from '../types/agroshield.ts';
import {
  DemoDisclaimerBar,
  ErrorBanner,
  HealthStatusLabel,
  LoadingSkeleton,
  PageHeader,
  RiskCategoryLabel,
} from '../components/ui/CommonPrimitives.tsx';
import { ZoneDetailDrawer } from '../components/ZoneDetailDrawer.tsx';

const HEALTH_COLORS: Record<ZoneHealthStatus, string> = {
  [ZoneHealthStatus.HEALTHY]: '#16A34A',
  [ZoneHealthStatus.SUSPECTED]: '#D97706',
  [ZoneHealthStatus.INFECTED]: '#DC2626',
  [ZoneHealthStatus.AT_RISK]: '#EA580C',
  [ZoneHealthStatus.INSUFFICIENT_DATA]: '#64748B',
};

function getRiskColor(score: number): string {
  if (score >= 75) return '#DC2626';
  if (score >= 55) return '#EA580C';
  if (score >= 30) return '#D97706';
  return '#16A34A';
}

export function FarmDigitalTwinPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [farms, setFarms] = useState<Farm[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [sensors, setSensors] = useState<IoTSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [baseLayer, setBaseLayer] = useState<'street' | 'satellite'>('street');
  const [overlayMode, setOverlayMode] = useState<'health' | 'risk'>('health');
  const [showSensors, setShowSensors] = useState(true);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('all');
  const [timelineStep, setTimelineStep] = useState<number>(3); // 0=21d ago, 1=14d ago, 2=7d ago, 3=Current
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, z, s] = await Promise.all([api.getFarms(), api.getZones(), api.getSensors()]);
      setFarms(f);
      setZones(z);
      setSensors(s);
    } catch (err: any) {
      setError(err.message || 'Failed to load geospatial digital twin records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Derive simulated historical snapshot for timeline scrubber
  const displayedZones = useMemo(() => {
    return zones.map((z, idx) => {
      if (timelineStep === 3) return z;
      // Earlier historical snapshots progressively show fewer confirmed infections
      const shiftedStatus =
        timelineStep === 0 && z.healthStatus === ZoneHealthStatus.INFECTED
          ? ZoneHealthStatus.AT_RISK
          : timelineStep === 1 && z.healthStatus === ZoneHealthStatus.INFECTED && idx % 2 === 0
          ? ZoneHealthStatus.SUSPECTED
          : z.healthStatus;
      const shiftedRisk = Math.max(12, z.riskScore - (3 - timelineStep) * 7);
      return { ...z, healthStatus: shiftedStatus, riskScore: shiftedRisk };
    });
  }, [zones, timelineStep]);

  const filteredZones = useMemo(() => {
    if (selectedFarmId === 'all') return displayedZones;
    return displayedZones.filter((z) => z.farmId === selectedFarmId);
  }, [displayedZones, selectedFarmId]);

  // Neighbouring inspection priorities: zones near an infected zone on the same farm that are NOT infected
  const inspectionPriorities = useMemo(() => {
    const infectedByFarm = new Set(
      displayedZones.filter((z) => z.healthStatus === ZoneHealthStatus.INFECTED).map((z) => z.farmId)
    );
    return displayedZones
      .filter((z) => infectedByFarm.has(z.farmId) && z.healthStatus !== ZoneHealthStatus.INFECTED)
      .slice(0, 8);
  }, [displayedZones]);

  // Initialize Leaflet map once container is mounted
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [14.2, 76.4],
      zoom: 7,
      zoomControl: true,
    });

    const tile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    tileLayerRef.current = tile;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
      tileLayerRef.current = null;
    };
  }, [loading]);

  // Update Tile Layer on baseLayer switch
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const url =
      baseLayer === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attr =
      baseLayer === 'satellite'
        ? 'Tiles &copy; Esri'
        : '&copy; OpenStreetMap contributors';
    tileLayerRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);
  }, [baseLayer]);

  // Render Polygons, Farm Boundaries & Sensors
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // Farm Boundaries
    const targetFarms = selectedFarmId === 'all' ? farms : farms.filter((f) => f.id === selectedFarmId);
    targetFarms.forEach((farm) => {
      try {
        const geo = JSON.parse(farm.boundaryGeoJson);
        const coords = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
        L.polygon(coords, {
          color: '#14532D',
          weight: 1.5,
          dashArray: '4 4',
          fillOpacity: 0.04,
        })
          .bindTooltip(`${farm.name} (${farm.areaHectares} ha)`)
          .addTo(group);

        // Farm pin marker at state zoom
        if (selectedFarmId === 'all') {
          const farmZones = filteredZones.filter((z) => z.farmId === farm.id);
          const hasInfected = farmZones.some((z) => z.healthStatus === ZoneHealthStatus.INFECTED);
          const maxRisk = Math.max(0, ...farmZones.map((z) => z.riskScore));
          const pinColor =
            overlayMode === 'risk'
              ? getRiskColor(maxRisk)
              : hasInfected
              ? '#DC2626'
              : farmZones.some((z) => z.healthStatus === ZoneHealthStatus.SUSPECTED)
              ? '#D97706'
              : '#16A34A';

          const marker = L.circleMarker([farm.latitude, farm.longitude], {
            radius: 9,
            color: '#FFFFFF',
            weight: 2,
            fillColor: pinColor,
            fillOpacity: 0.9,
          });
          marker.bindPopup(
            `<div style="min-width:190px">
              <div style="font-weight:600;font-size:13px;color:#0F172A">${farm.name}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px">${farm.district} · ${farmZones.length} Zones · Max Risk ${maxRisk}/100</div>
              <div style="font-size:11px;color:#059669;margin-top:6px">Zoom in or select farm to inspect zones</div>
            </div>`
          );
          marker.on('click', () => {
            setSelectedFarmId(farm.id);
          });
          marker.addTo(group);

          if (hasInfected || maxRisk >= 75) {
            const pulseIcon = L.divIcon({
              className: '',
              html: '<div class="agro-map-pulse-wrap"><div class="agro-map-pulse-ring"></div></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });
            L.marker([farm.latitude, farm.longitude], { icon: pulseIcon, interactive: false }).addTo(group);
          }
        }
      } catch {
        // skip invalid geojson
      }
    });

    // Individual Crop Zone Polygons
    filteredZones.forEach((z) => {
      try {
        const geo = JSON.parse(z.polygonGeoJson);
        const coords = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
        const color =
          overlayMode === 'risk' ? getRiskColor(z.riskScore) : HEALTH_COLORS[z.healthStatus] || '#64748B';

        const poly = L.polygon(coords, {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.42,
        });
        poly.bindTooltip(
          `${z.name} · ${z.cropType} · Risk ${z.riskScore}/100`,
          { sticky: true }
        );
        poly.on('click', () => {
          setActiveZoneId(z.id);
        });
        poly.addTo(group);

        if (selectedFarmId !== 'all' && z.healthStatus === ZoneHealthStatus.INFECTED) {
          const zPulse = L.divIcon({
            className: '',
            html: '<div class="agro-map-pulse-wrap"><div class="agro-map-pulse-ring"></div></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          L.marker([z.latitude, z.longitude], { icon: zPulse, interactive: false }).addTo(group);
        }
      } catch {
        // skip invalid geojson
      }
    });

    // IoT Sensor Overlay
    if (showSensors) {
      const targetSensors =
        selectedFarmId === 'all' ? sensors : sensors.filter((s) => s.farmId === selectedFarmId);
      targetSensors.forEach((s) => {
        const z = zones.find((zn) => zn.id === s.zoneId);
        if (!z) return;
        const sMarker = L.circleMarker([z.latitude + 0.0005, z.longitude + 0.0005], {
          radius: 4.5,
          color: '#0F172A',
          weight: 1.5,
          fillColor: s.status === 'online' ? '#10B981' : s.status === 'offline' ? '#DC2626' : '#F59E0B',
          fillOpacity: 1,
        });
        sMarker.bindTooltip(`Sensor ${s.deviceUid} (${s.status})`);
        sMarker.on('click', () => setActiveZoneId(z.id));
        sMarker.addTo(group);
      });
    }

    // Pan/zoom when single farm selected
    if (selectedFarmId !== 'all' && targetFarms[0]) {
      map.setView([targetFarms[0].latitude, targetFarms[0].longitude], 15, { animate: true });
    } else {
      map.setView([14.2, 76.4], 7, { animate: true });
    }
  }, [farms, filteredZones, sensors, zones, overlayMode, showSensors, selectedFarmId]);

  const timelineLabels = ['21 Days Ago (Demo)', '14 Days Ago (Demo)', '7 Days Ago (Demo)', 'Current State'];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Farm Digital Twin"
        subtitle="Interactive geospatial twin of Karnataka farms, crop zone polygons, disease distribution, risk overlays, and neighbouring scouting analysis."
        action={
          <div className="flex items-center gap-2">
            <select
              value={selectedFarmId}
              onChange={(e) => setSelectedFarmId(e.target.value)}
              aria-label="Filter Digital Twin by farm"
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              <option value="all">All 20 Karnataka Farms (Overview)</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <DemoDisclaimerBar text="SYNTHETIC GEOSPATIAL MAP DATA: Farm boundaries and crop zone polygons are synthetic coordinates positioned across Karnataka districts for demonstration. Click any farm marker or zone polygon to open full crop health intelligence." />

      {error && <ErrorBanner message={error} onRetry={loadData} />}
      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          {/* Map Controls Toolbar */}
          <div className="bg-white border border-stone-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-md border border-stone-200">
                <button
                  onClick={() => setOverlayMode('health')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    overlayMode === 'health' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Health Status Layer
                </button>
                <button
                  onClick={() => setOverlayMode('risk')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    overlayMode === 'risk' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Disease Risk Overlay
                </button>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-md border border-stone-200">
                <button
                  onClick={() => setBaseLayer('street')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    baseLayer === 'street' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Map View
                </button>
                <button
                  onClick={() => setBaseLayer('satellite')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    baseLayer === 'satellite' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Satellite Imagery
                </button>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSensors}
                  onChange={(e) => setShowSensors(e.target.checked)}
                  className="rounded accent-emerald-800"
                />
                Show IoT Nodes
              </label>
            </div>

            {/* Historical Timeline Scrubber */}
            <div className="flex items-center gap-3 min-w-[240px]">
              <span className="text-xs text-slate-500 whitespace-nowrap">Timeline:</span>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={timelineStep}
                onChange={(e) => setTimelineStep(Number(e.target.value))}
                className="w-28 accent-emerald-800 cursor-pointer"
                aria-label="Digital twin historical timeline"
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={timelineStep}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.16 }}
                  className="text-xs font-mono font-medium text-slate-800 whitespace-nowrap inline-block min-w-[145px]"
                >
                  {timelineLabels[timelineStep]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Interactive Leaflet Map + Legend */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="lg:col-span-3 bg-white border border-stone-200 rounded-lg overflow-hidden agro-card-hover">
              <div ref={mapContainerRef} className="w-full h-[500px] z-10" />
            </div>

            <div className="bg-white border border-stone-200 rounded-lg p-4 space-y-5 flex flex-col justify-between agro-card-hover">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Layers className="w-4 h-4 text-emerald-800" />
                  <span>Zone Status Legend</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  {[
                    { label: 'Healthy Zones', color: '#16A34A', count: filteredZones.filter((z) => z.healthStatus === ZoneHealthStatus.HEALTHY).length },
                    { label: 'Suspected Zones', color: '#D97706', count: filteredZones.filter((z) => z.healthStatus === ZoneHealthStatus.SUSPECTED).length },
                    { label: 'Confirmed Infected', color: '#DC2626', count: filteredZones.filter((z) => z.healthStatus === ZoneHealthStatus.INFECTED).length },
                    { label: 'High-Risk (Env)', color: '#EA580C', count: filteredZones.filter((z) => z.healthStatus === ZoneHealthStatus.AT_RISK).length },
                    { label: 'Insufficient Data', color: '#64748B', count: filteredZones.filter((z) => z.healthStatus === ZoneHealthStatus.INSUFFICIENT_DATA).length },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-700">
                        <span className="w-3 h-3 rounded-xs shrink-0 transition-transform duration-200" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">{item.count}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-stone-200">
                  <div className="text-xs font-semibold text-slate-900 mb-2">Quick Zone Jump</div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {filteredZones.slice(0, 14).map((z, idx) => (
                      <button
                        key={z.id}
                        onClick={() => setActiveZoneId(z.id)}
                        style={{ animationDelay: `${Math.min(idx, 10) * 24}ms` }}
                        className="agro-row-enter w-full text-left px-2.5 py-2 rounded border border-stone-200 hover:bg-stone-50 transition-colors flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{z.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{z.district} · {z.zoneCode}</div>
                        </div>
                        <RiskCategoryLabel category={z.riskCategory} score={z.riskScore} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 pt-3 border-t border-stone-100">
                Click any polygon on the map or list item above to open crop health, telemetry, and neighbouring zone scouting priority.
              </div>
            </div>
          </div>

          {/* Neighbouring Zone Inspection Prioritization Table */}
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Neighbouring Zone Inspection Priorities
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Zones adjacent to confirmed infected plots are flagged for proactive scouting without automatically declaring them infected.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-2 font-medium">Zone</th>
                    <th className="py-2 font-medium">Farm & District</th>
                    <th className="py-2 font-medium">Crop</th>
                    <th className="py-2 font-medium">Current Status</th>
                    <th className="py-2 font-medium">Risk Score</th>
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {inspectionPriorities.map((z, idx) => (
                    <tr
                      key={z.id}
                      style={{ animationDelay: `${idx * 30}ms` }}
                      className="hover:bg-stone-50 transition-colors agro-row-enter"
                    >
                      <td className="py-2.5 font-medium text-slate-900">{z.name}</td>
                      <td className="py-2.5 text-slate-600">{z.farmName}</td>
                      <td className="py-2.5 text-slate-700">{z.cropType}</td>
                      <td className="py-2.5"><HealthStatusLabel status={z.healthStatus} /></td>
                      <td className="py-2.5"><RiskCategoryLabel category={z.riskCategory} score={z.riskScore} /></td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => setActiveZoneId(z.id)}
                          className="inline-flex items-center gap-1 text-emerald-800 font-medium hover:underline"
                        >
                          <MapPin className="w-3.5 h-3.5" /> Inspect Zone
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

      <ZoneDetailDrawer
        zoneId={activeZoneId}
        onClose={() => setActiveZoneId(null)}
        onNavigateModule={onNavigate}
        onZoneUpdated={loadData}
      />
    </div>
  );
}
