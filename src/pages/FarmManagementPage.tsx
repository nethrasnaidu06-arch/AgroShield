import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Edit3, History, Plus, Sprout } from 'lucide-react';
import { api } from '../api/client.ts';
import { CropType, Farm, FarmZone, GrowthStage } from '../types/agroshield.ts';
import {
  AnimatedModal,
  DemoDisclaimerBar,
  ErrorBanner,
  HealthStatusLabel,
  LoadingSkeleton,
  PageHeader,
  RiskCategoryLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function FarmManagementPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [farmHistory, setFarmHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFarmModal, setShowFarmModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);

  const [farmForm, setFarmForm] = useState({
    name: '',
    ownerLabel: '',
    district: 'Mandya',
    taluk: 'Maddur',
    latitude: 12.58,
    longitude: 77.04,
    areaHectares: 4.5,
    soilType: 'Red Loamy',
    irrigationType: 'Drip Irrigation',
  });

  const [zoneForm, setZoneForm] = useState({
    farmId: '',
    zoneCode: 'Z5',
    name: '',
    cropType: CropType.TOMATO,
    variety: 'Arka Rakshak',
    plantingDate: '2026-10-15',
    growthStage: GrowthStage.VEGETATIVE,
    areaHectares: 1.2,
  });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, z] = await Promise.all([api.getFarms(), api.getZones()]);
      setFarms(f);
      setZones(z);
      if (!selectedFarm && f[0]) {
        selectFarmForDetail(f[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectFarmForDetail = async (farm: Farm) => {
    setSelectedFarm(farm);
    setZoneForm((prev) => ({ ...prev, farmId: farm.id }));
    try {
      const hist = await api.getFarmHistory(farm.id);
      setFarmHistory(hist);
    } catch {
      setFarmHistory(null);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingFarm) {
        await api.updateFarm(editingFarm.id, farmForm);
      } else {
        await api.createFarm(farmForm);
      }
      setShowFarmModal(false);
      setEditingFarm(null);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createZone(zoneForm);
      setShowZoneModal(false);
      await loadAll();
      if (selectedFarm) await selectFarmForDetail(selectedFarm);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Farm & Crop Zone Management"
        subtitle="Register farms, edit soil and irrigation profiles, assign geographical coordinates, divide farms into crop zones, and track farm history."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingFarm(null);
                setFarmForm({
                  name: '',
                  ownerLabel: '',
                  district: 'Mandya',
                  taluk: 'Maddur',
                  latitude: 12.58,
                  longitude: 77.04,
                  areaHectares: 4.5,
                  soilType: 'Red Loamy',
                  irrigationType: 'Drip Irrigation',
                });
                setShowFarmModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Farm
            </button>
          </div>
        }
      />

      <DemoDisclaimerBar text="Records marked '(Demo)' belong to the synthetic 20-farm Karnataka baseline dataset. Newly registered farms and crop zones are persisted directly in SQLite." />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <LoadingSkeleton rows={7} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Farms Directory */}
          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-4 space-y-3 agro-card-hover">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Registered Farms ({farms.length})</h2>
            </div>
            <div className="divide-y divide-stone-100 max-h-[600px] overflow-y-auto pr-1">
              {farms.map((farm, idx) => {
                const farmZones = zones.filter((z) => z.farmId === farm.id);
                const isSelected = selectedFarm?.id === farm.id;
                return (
                  <div
                    key={farm.id}
                    onClick={() => selectFarmForDetail(farm)}
                    style={{ animationDelay: `${Math.min(idx, 12) * 20}ms` }}
                    className={`agro-row-enter py-3 px-3 rounded-md cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">{farm.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {farm.district} · {farm.taluk} · <span className="font-mono">{farm.areaHectares} ha</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFarm(farm);
                          setFarmForm({
                            name: farm.name,
                            ownerLabel: farm.ownerLabel,
                            district: farm.district,
                            taluk: farm.taluk,
                            latitude: farm.latitude,
                            longitude: farm.longitude,
                            areaHectares: farm.areaHectares,
                            soilType: farm.soilType,
                            irrigationType: farm.irrigationType,
                          });
                          setShowFarmModal(true);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-800"
                        aria-label={`Edit ${farm.name}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-2">
                      <span>{farmZones.length} Zones</span>
                      <span aria-hidden="true">·</span>
                      <span>{farm.soilType}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Farm Zones & History */}
          <div className="lg:col-span-7 space-y-5">
            {selectedFarm && (
              <motion.div
                key={selectedFarm.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-stone-200">
                    <div>
                      <div className="text-xs text-slate-500">{selectedFarm.ownerLabel}</div>
                      <h2 className="text-lg font-semibold text-slate-900 mt-0.5">{selectedFarm.name}</h2>
                      <div className="text-xs text-slate-600 mt-1">
                        {selectedFarm.soilType} · {selectedFarm.irrigationType} ·{' '}
                        <span className="font-mono">{selectedFarm.latitude.toFixed(4)}, {selectedFarm.longitude.toFixed(4)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setZoneForm((prev) => ({
                          ...prev,
                          farmId: selectedFarm.id,
                          zoneCode: `Z${(farmHistory?.zones?.length || 0) + 1}`,
                          name: '',
                        }));
                        setShowZoneModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap"
                    >
                      <Sprout className="w-3.5 h-3.5" />
                      Add Crop Zone
                    </button>
                  </div>

                  <h3 className="text-xs font-semibold text-slate-900 mt-4 mb-2">
                    Farm Crop Zones ({farmHistory?.zones?.length || 0})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-slate-500">
                          <th className="py-2 font-medium">Zone</th>
                          <th className="py-2 font-medium">Crop & Variety</th>
                          <th className="py-2 font-medium">Planted</th>
                          <th className="py-2 font-medium">Stage</th>
                          <th className="py-2 font-medium">Health</th>
                          <th className="py-2 font-medium text-right">Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {(farmHistory?.zones || []).map((z: FarmZone, idx: number) => (
                          <tr
                            key={z.id}
                            style={{ animationDelay: `${idx * 25}ms` }}
                            className="hover:bg-stone-50 transition-colors agro-row-enter"
                          >
                            <td className="py-2.5 font-medium text-slate-900">{z.zoneCode} · {z.name}</td>
                            <td className="py-2.5 text-slate-700">{z.cropType} ({z.variety})</td>
                            <td className="py-2.5 font-mono text-slate-500">{z.plantingDate}</td>
                            <td className="py-2.5 text-slate-600">{z.growthStage}</td>
                            <td className="py-2.5"><HealthStatusLabel status={z.healthStatus} /></td>
                            <td className="py-2.5 text-right"><RiskCategoryLabel category={z.riskCategory} score={z.riskScore} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Farm Observation & Treatment History */}
                <div className="bg-white border border-stone-200 rounded-lg p-5 agro-card-hover">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-3">
                    <History className="w-4 h-4 text-emerald-800" />
                    Farm Pathology & Treatment History
                  </h3>
                  <div className="divide-y divide-stone-100 max-h-64 overflow-y-auto">
                    {(farmHistory?.observations || []).map((o: any, idx: number) => (
                      <div
                        key={o.id}
                        style={{ animationDelay: `${Math.min(idx, 10) * 20}ms` }}
                        className="py-2.5 text-xs flex items-start justify-between gap-4 agro-row-enter"
                      >
                        <div>
                          <div className="font-medium text-slate-900">
                            {o.diseaseName} · <span className="text-slate-500">{o.cropType}</span>
                          </div>
                          <div className="text-slate-600 mt-0.5">{o.notes}</div>
                        </div>
                        <span className="font-mono text-slate-400 shrink-0">{o.observedAt.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Register / Edit Farm */}
      <AnimatedModal open={showFarmModal} onClose={() => setShowFarmModal(false)}>
        <form onSubmit={handleSaveFarm} className="bg-white border border-stone-200 rounded-lg w-full p-6 space-y-4 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900">
            {editingFarm ? 'Edit Farm Details' : 'Register New Farm'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Farm Name *</label>
              <input
                required
                value={farmForm.name}
                onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })}
                placeholder="e.g., Cauvery Precision Plot A"
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">District *</label>
              <input
                required
                value={farmForm.district}
                onChange={(e) => setFarmForm({ ...farmForm, district: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Taluk</label>
              <input
                value={farmForm.taluk}
                onChange={(e) => setFarmForm({ ...farmForm, taluk: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Latitude *</label>
              <input
                type="number"
                step="0.0001"
                required
                value={farmForm.latitude}
                onChange={(e) => setFarmForm({ ...farmForm, latitude: Number(e.target.value) })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Longitude *</label>
              <input
                type="number"
                step="0.0001"
                required
                value={farmForm.longitude}
                onChange={(e) => setFarmForm({ ...farmForm, longitude: Number(e.target.value) })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Area (Hectares)</label>
              <input
                type="number"
                step="0.1"
                value={farmForm.areaHectares}
                onChange={(e) => setFarmForm({ ...farmForm, areaHectares: Number(e.target.value) })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Soil Type</label>
              <input
                value={farmForm.soilType}
                onChange={(e) => setFarmForm({ ...farmForm, soilType: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowFarmModal(false)}
              className="px-4 py-2 text-xs font-medium border border-stone-200 rounded-md text-slate-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800"
            >
              Save Farm
            </button>
          </div>
        </form>
      </AnimatedModal>

      {/* Modal: Divide / Add Crop Zone */}
      <AnimatedModal open={showZoneModal} onClose={() => setShowZoneModal(false)}>
        <form onSubmit={handleSaveZone} className="bg-white border border-stone-200 rounded-lg w-full p-6 space-y-4 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900">Divide Farm — Add Crop Zone</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Zone Code</label>
              <input
                required
                value={zoneForm.zoneCode}
                onChange={(e) => setZoneForm({ ...zoneForm, zoneCode: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Zone Name *</label>
              <input
                required
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="e.g., North Terrace Plot"
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Crop Type</label>
              <select
                value={zoneForm.cropType}
                onChange={(e) => setZoneForm({ ...zoneForm, cropType: e.target.value as CropType })}
                className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
              >
                {Object.values(CropType).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Variety</label>
              <input
                value={zoneForm.variety}
                onChange={(e) => setZoneForm({ ...zoneForm, variety: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Planting Date</label>
              <input
                type="date"
                required
                value={zoneForm.plantingDate}
                onChange={(e) => setZoneForm({ ...zoneForm, plantingDate: e.target.value })}
                className="w-full rounded border border-stone-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Growth Stage</label>
              <select
                value={zoneForm.growthStage}
                onChange={(e) => setZoneForm({ ...zoneForm, growthStage: e.target.value as GrowthStage })}
                className="w-full rounded border border-stone-200 px-3 py-2 bg-white"
              >
                {Object.values(GrowthStage).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowZoneModal(false)}
              className="px-4 py-2 text-xs font-medium border border-stone-200 rounded-md text-slate-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800"
            >
              Create Crop Zone
            </button>
          </div>
        </form>
      </AnimatedModal>
    </div>
  );
}
