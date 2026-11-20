import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, ClipboardList, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.ts';
import { AdvisoryArticle, CropType, FarmZone } from '../types/agroshield.ts';
import {
  DemoDisclaimerBar,
  ErrorBanner,
  HealthStatusLabel,
  LoadingSkeleton,
  PageHeader,
  RiskCategoryLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function SmartAdvisoryPage() {
  const [articles, setArticles] = useState<AdvisoryArticle[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [zoneDetail, setZoneDetail] = useState<any | null>(null);
  const [subTab, setSubTab] = useState<'knowledge_base' | 'farmer_action'>('knowledge_base');
  const [cropFilter, setCropFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadingZone, setLoadingZone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAdvisory(), api.getZones()])
      .then(([arts, zns]) => {
        setArticles(arts);
        setZones(zns);
        const target = zns.find((z: FarmZone) => z.healthStatus !== 'healthy') || zns[0];
        if (target) {
          setSelectedZoneId(target.id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedZoneId || subTab !== 'farmer_action') return;
    setLoadingZone(true);
    api
      .getZoneDetail(selectedZoneId)
      .then(setZoneDetail)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingZone(false));
  }, [selectedZoneId, subTab]);

  const visible = cropFilter === 'all' ? articles : articles.filter((a) => a.cropType === cropFilter);

  const matchedZoneArticle = zoneDetail?.zone
    ? articles.find((a) => a.cropType === zoneDetail.zone.cropType) || null
    : null;

  const latestObs = zoneDetail?.observations?.[0] || null;
  const latestRisk = zoneDetail?.latestRisk || null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Agricultural Advisory"
        subtitle="Structured crop pathology knowledge base and farmer action view separating automated/demo risk suggestions from expert-verified management guidance."
        action={
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-stone-200 rounded-md">
            <button
              type="button"
              onClick={() => setSubTab('knowledge_base')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                subTab === 'knowledge_base' ? 'bg-emerald-900 text-white' : 'text-slate-600'
              }`}
            >
              Pathology Knowledge Base
            </button>
            <button
              type="button"
              onClick={() => setSubTab('farmer_action')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                subTab === 'farmer_action' ? 'bg-emerald-900 text-white' : 'text-slate-600'
              }`}
            >
              Farmer Action View
            </button>
          </div>
        }
      />

      <DemoDisclaimerBar text="AgroShield never fabricates pesticide dosages or expert approvals. Chemical interventions strictly reference verified label compliance and licensed local agronomist prescriptions." />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <AnimatePresence mode="wait">
          {subTab === 'knowledge_base' ? (
            <motion.div
              key="knowledge_base"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-stone-200 rounded-md">
                <button
                  type="button"
                  onClick={() => setCropFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded ${
                    cropFilter === 'all' ? 'bg-emerald-900 text-white' : 'text-slate-600'
                  }`}
                >
                  All Crops ({articles.length})
                </button>
                {Object.values(CropType).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCropFilter(c)}
                    className={`px-2.5 py-1 text-xs font-medium rounded ${
                      cropFilter === c ? 'bg-emerald-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {visible.map((art, idx) => (
                <article
                  key={art.id}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className="bg-white border border-stone-200 rounded-lg p-6 space-y-5 agro-card-hover agro-row-enter"
                >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-3">
                <div>
                  <div className="text-xs text-emerald-800 font-medium">
                    {art.cropType} · <span className="italic">{art.pathogen}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 mt-0.5 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-800" />
                    {art.diseaseName}
                  </h2>
                </div>
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Expert Reviewed: {art.expertReviewedBy} · {art.lastReviewedAt}</span>
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{art.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-stone-50 border border-stone-200 rounded p-3.5 space-y-1.5">
                  <div className="font-semibold text-slate-900">Favorable Environmental Window</div>
                  <p className="text-slate-700">{art.favorableConditions}</p>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded p-3.5 space-y-1.5">
                  <div className="font-semibold text-slate-900">Key Risk Factors</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                    {(art.riskFactors || []).map((rf, i) => (
                      <li key={i}>{rf}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Diagnostic Symptoms</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {art.symptoms.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Preventive &amp; Cultural Management</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {art.preventiveMeasures.map((m, i) => (
                      <li key={`prev-${i}`}>{m}</li>
                    ))}
                    {(art.culturalManagement || []).map((cm, i) => (
                      <li key={`cult-${i}`} className="text-slate-800">{cm}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Biological &amp; Verified Treatment</h3>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700">
                    {(art.biologicalManagement || art.organicTreatments).map((b, i) => (
                      <li key={`bio-${i}`}>{b}</li>
                    ))}
                    {art.chemicalGuidance.map((c, i) => (
                      <li key={`chem-${i}`} className="text-slate-800 font-medium">{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {art.verifiedTreatmentInfo && (
                <div className="text-xs text-slate-800 bg-emerald-50/70 border border-emerald-200 rounded px-3.5 py-2.5">
                  <strong>Verified Treatment Governance:</strong> {art.verifiedTreatmentInfo}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <strong>Safety &amp; Pre-Harvest Interval:</strong> {art.safetyNotes}
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded px-3 py-2 text-slate-600">
                  <strong className="text-slate-800 flex items-center gap-1 mb-1">
                    <ExternalLink className="w-3 h-3" /> Agricultural References
                  </strong>
                  <ul className="space-y-0.5">
                    {(art.references || []).map((ref, i) => (
                      <li key={i}>{ref}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
            </motion.div>
          ) : (
            <motion.div
              key="farmer_action"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              <div className="bg-white border border-stone-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 agro-card-hover">
                <div className="text-xs text-slate-600">
                  Select a registered crop zone to review side-by-side <strong>AI/Risk Suggestions</strong> vs.{' '}
                  <strong>Verified Expert Action Guidance</strong>.
                </div>
                <select
                  value={selectedZoneId}
                  onChange={(e) => setSelectedZoneId(e.target.value)}
                  className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900 max-w-sm"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.district} · {z.farmName?.split(' — ')[0]} · {z.name} ({z.cropType})
                    </option>
                  ))}
                </select>
              </div>

              {loadingZone || !zoneDetail ? (
                <LoadingSkeleton rows={5} />
              ) : (
                <div className="space-y-5">
                  <div className="bg-white border border-stone-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4 agro-card-hover">
                    <div>
                      <div className="text-xs text-slate-500">{zoneDetail.zone.farmName}</div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {zoneDetail.zone.zoneCode} ({zoneDetail.zone.name}) · {zoneDetail.zone.cropType}
                      </h2>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <HealthStatusLabel status={zoneDetail.zone.healthStatus} />
                      <RiskCategoryLabel category={zoneDetail.zone.riskCategory} score={zoneDetail.zone.riskScore} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-700" />
                      Automated Risk / AI Suggestion (Decision Support)
                    </h3>
                    <span className="text-[11px] font-mono text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      {latestObs?.expertReviewStatus === 'approved' ? 'Expert Confirmed' : 'Requires Verification'}
                    </span>
                  </div>

                  {latestRisk ? (
                    <div className="space-y-3 text-xs">
                      <div className="text-slate-700">
                        Target Threat: <strong>{latestRisk.targetDisease}</strong> · Inspection Window:{' '}
                        <strong>{latestRisk.inspectionPriority}</strong>
                      </div>
                      <ul className="list-disc pl-4 space-y-1.5 text-slate-700">
                        {(latestRisk.recommendedActions || []).map((act: string, idx: number) => (
                          <li key={idx}>{act}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No risk assessment generated for this zone yet.</p>
                  )}

                  {latestObs && (
                    <div className="bg-stone-50 border border-stone-200 rounded p-3 text-xs space-y-1">
                      <div className="font-medium text-slate-900">
                        Latest Zone Observation: {latestObs.diseaseName} ({latestObs.severityClass})
                      </div>
                      <div className="text-slate-600">
                        Review Status: <strong>{latestObs.expertReviewStatus}</strong>
                        {latestObs.reviewedBy ? ` · Reviewed by ${latestObs.reviewedBy}` : ' · Pending expert sign-off'}
                      </div>
                      {latestObs.expertNotes && (
                        <div className="text-emerald-900 pt-1">
                          <strong>Expert Note:</strong> {latestObs.expertNotes}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                    <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover">
                      <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                          <ClipboardList className="w-4 h-4 text-emerald-800" />
                          Verified Immediate Actions &amp; Follow-Up Protocol
                        </h3>
                        <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Extension Protocol
                        </span>
                      </div>

                      {matchedZoneArticle ? (
                        <div className="space-y-3 text-xs">
                          <div>
                            <div className="font-semibold text-slate-900 mb-1">Immediate Field Actions</div>
                            <ul className="list-disc pl-4 space-y-1 text-slate-700">
                              {(matchedZoneArticle.immediateActions || matchedZoneArticle.preventiveMeasures).map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 mb-1">Prevention &amp; Cultural Safeguards</div>
                            <ul className="list-disc pl-4 space-y-1 text-slate-700">
                              {(matchedZoneArticle.culturalManagement || matchedZoneArticle.preventiveMeasures).map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-emerald-950">
                            <strong>Follow-Up Inspection Plan:</strong> Capture repeat leaf frames in{' '}
                            <strong>{latestRisk?.inspectionPriority || '72h'}</strong> under Disease Progression Monitoring to
                            verify lesion arrest before applying repeat sprays.
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No verified crop protocol matched.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
