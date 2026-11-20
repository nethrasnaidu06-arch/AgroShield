import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ClipboardCheck, Edit3, History, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '../api/client.ts';
import {
  DiseaseObservation,
  ExpertReviewHistoryEntry,
  SeverityClass,
  TreatmentRecord,
  UserRole,
} from '../types/agroshield.ts';
import {
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  LoadingSkeleton,
  MetricCell,
  PageHeader,
  SeverityLabel,
} from '../components/ui/CommonPrimitives.tsx';

export function ExpertDashboardPage({ activeRole }: { activeRole: UserRole }) {
  const [observations, setObservations] = useState<DiseaseObservation[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([]);
  const [history, setHistory] = useState<ExpertReviewHistoryEntry[]>([]);
  const [subTab, setSubTab] = useState<'queue' | 'treatments' | 'history'>('queue');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selectedObs, setSelectedObs] = useState<DiseaseObservation | null>(null);
  const [correctedDisease, setCorrectedDisease] = useState('');
  const [correctedSeverity, setCorrectedSeverity] = useState<SeverityClass>(SeverityClass.MILD);
  const [expertNotes, setExpertNotes] = useState('');
  const [treatmentRecNote, setTreatmentRecNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canReview = activeRole === UserRole.EXPERT || activeRole === UserRole.ADMIN;

  const selectObservation = (o: DiseaseObservation) => {
    setSelectedObs(o);
    setCorrectedDisease(o.diseaseName);
    setCorrectedSeverity(o.severityClass);
    setExpertNotes(o.expertNotes || '');
    setTreatmentRecNote('');
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [obsRes, trtRes, histRes] = await Promise.all([
        api.getObservations(),
        api.getTreatments(),
        api.getExpertHistory(),
      ]);
      setObservations(obsRes);
      setTreatments(trtRes);
      setHistory(histRes);
      const firstPending = obsRes.find((o: DiseaseObservation) => o.expertReviewStatus === 'pending') || obsRes[0];
      if (firstPending) selectObservation(firstPending);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleReviewAction = async (decision: 'approved' | 'corrected' | 'rejected') => {
    if (!selectedObs) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.reviewObservation(selectedObs.id, {
        expertReviewStatus: decision,
        correctedDiseaseName: correctedDisease,
        correctedSeverity,
        expertNotes,
        treatmentRecommendationNote: treatmentRecNote.trim() || null,
        reviewedBy: activeRole === UserRole.ADMIN ? 'Platform Admin Review' : 'Dr. Kavitha Rao (Pathologist)',
      });
      setNotice(`Observation ${selectedObs.id} marked as ${decision} and logged to audit history.`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyTreatment = async (
    trt: TreatmentRecord,
    outcomeStatus: 'pending_evaluation' | 'improving' | 'no_change' | 'worsened'
  ) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateTreatmentOutcome(trt.id, {
        outcomeStatus,
        expertVerified: true,
        outcomeNotes: `${trt.outcomeNotes} [Verified by ${activeRole === UserRole.ADMIN ? 'Admin' : 'Dr. Kavitha Rao'}]`,
      });
      setNotice(`Treatment ${trt.productOrMethod} verified and outcome updated.`);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = observations.filter((o) => o.expertReviewStatus === 'pending').length;
  const approvedCount = observations.filter((o) => o.expertReviewStatus === 'approved').length;
  const correctedCount = observations.filter((o) => o.expertReviewStatus === 'corrected').length;
  const visibleList = filter === 'pending' ? observations.filter((o) => o.expertReviewStatus === 'pending') : observations;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expert Pathology Dashboard"
        subtitle="Review AI/field diagnoses, inspect uploaded leaf frames, verify treatment recommendations, and inspect the complete modification audit history."
        action={
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-stone-200 rounded-md">
            <button
              type="button"
              onClick={() => setSubTab('queue')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                subTab === 'queue' ? 'bg-emerald-900 text-white' : 'text-slate-600'
              }`}
            >
              Review Queue ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('treatments')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                subTab === 'treatments' ? 'bg-emerald-900 text-white' : 'text-slate-600'
              }`}
            >
              Treatment Review ({treatments.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                subTab === 'history' ? 'bg-emerald-900 text-white' : 'text-slate-600'
              }`}
            >
              Audit History ({history.length})
            </button>
          </div>
        }
      />

      {!canReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            RBAC Read-Only View: Current active role is <strong>{activeRole}</strong>. Switch to{' '}
            <strong>Agricultural Expert</strong> or <strong>Platform Admin</strong> in the sidebar to approve,
            correct, or verify records.
          </span>
        </div>
      )}

      <DemoDisclaimerBar text="Every approval, correction, or rejection writes an immutable entry to expert_review_history and immediately updates Digital Twin zone statuses." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={notice} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCell label="Pending Expert Review" value={pendingCount} tone="warning" />
        <MetricCell label="Approved Diagnoses" value={approvedCount} tone="healthy" />
        <MetricCell label="Corrected Diagnoses" value={correctedCount} tone="forest" />
        <MetricCell label="Audit Trail Entries" value={history.length} subtext="Complete modification log" />
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <AnimatePresence mode="wait">
          {subTab === 'queue' ? (
            <motion.div
              key="queue"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-1 p-1 bg-white border border-stone-200 rounded-md">
                <button
                  type="button"
                  onClick={() => setFilter('pending')}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    filter === 'pending' ? 'bg-emerald-900 text-white' : 'text-slate-600'
                  }`}
                >
                  Pending Only ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    filter === 'all' ? 'bg-emerald-900 text-white' : 'text-slate-600'
                  }`}
                >
                  All Observations ({observations.length})
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-4 space-y-2 max-h-[580px] overflow-y-auto agro-card-hover">
                  {visibleList.slice(0, 40).map((o, idx) => (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => selectObservation(o)}
                      style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}
                      className={`agro-row-enter w-full text-left p-3 rounded-md border transition-colors ${
                        selectedObs?.id === o.id ? 'bg-emerald-50 border-emerald-300' : 'border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900 truncate">{o.diseaseName}</span>
                        <SeverityLabel severity={o.severityClass} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {o.cropType} · {o.zoneName} · {o.farmName}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {o.observedAt.slice(0, 10)} · {o.sourceMode} · Review: {o.expertReviewStatus}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-5 space-y-4 agro-card-hover">
                  {selectedObs ? (
                    <motion.div
                      key={selectedObs.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="border-b border-stone-200 pb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500">
                        {selectedObs.farmName} · {selectedObs.zoneName} · {selectedObs.cropType}
                      </div>
                      <h2 className="text-base font-semibold text-slate-900 mt-0.5">{selectedObs.diseaseName}</h2>
                      <p className="text-xs text-slate-600 mt-1">{selectedObs.notes}</p>
                    </div>
                    <div className="text-right text-[11px] font-mono text-slate-500">
                      <div>Source: {selectedObs.sourceMode}</div>
                      {selectedObs.confidenceScore != null && (
                        <div>AI Score: {Math.round(selectedObs.confidenceScore * 100)}% (Unverified)</div>
                      )}
                    </div>
                  </div>

                  {selectedObs.imageUrl ? (
                    <img
                      src={selectedObs.imageUrl}
                      alt={selectedObs.diseaseName}
                      referrerPolicy="no-referrer"
                      className="w-full h-56 object-cover rounded-md border border-stone-200"
                    />
                  ) : (
                    <div className="h-32 rounded-md border border-dashed border-stone-300 flex items-center justify-center text-xs text-slate-500">
                      No image attached to this manual field observation.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Verified / Corrected Disease Name</label>
                      <input
                        disabled={!canReview}
                        value={correctedDisease}
                        onChange={(e) => setCorrectedDisease(e.target.value)}
                        className="w-full rounded border border-stone-200 px-3 py-2 disabled:bg-stone-50"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Verified Severity Grade</label>
                      <select
                        disabled={!canReview}
                        value={correctedSeverity}
                        onChange={(e) => setCorrectedSeverity(e.target.value as SeverityClass)}
                        className="w-full rounded border border-stone-200 px-3 py-2 bg-white disabled:bg-stone-50"
                      >
                        {Object.values(SeverityClass).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Pathologist Diagnostic Notes</label>
                      <textarea
                        disabled={!canReview}
                        rows={2}
                        value={expertNotes}
                        onChange={(e) => setExpertNotes(e.target.value)}
                        placeholder="Enter diagnostic rationale, symptom confirmation, or label correction details..."
                        className="w-full rounded border border-stone-200 px-3 py-2 disabled:bg-stone-50"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Verified Treatment Recommendation Review Note (Optional)
                      </label>
                      <input
                        disabled={!canReview}
                        value={treatmentRecNote}
                        onChange={(e) => setTreatmentRecNote(e.target.value)}
                        placeholder="e.g., Recommend sanitation & local extension-prescribed protectant spray; avoid unverified dosing."
                        className="w-full rounded border border-stone-200 px-3 py-2 disabled:bg-stone-50"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={!canReview || saving}
                      onClick={() => handleReviewAction('approved')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve Diagnosis
                    </button>
                    <button
                      type="button"
                      disabled={!canReview || saving}
                      onClick={() => handleReviewAction('corrected')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-amber-700 text-white rounded-md hover:bg-amber-600 disabled:opacity-40"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Save Correction
                    </button>
                      <button
                        type="button"
                        disabled={!canReview || saving}
                        onClick={() => handleReviewAction('rejected')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-stone-200 text-slate-700 rounded-md hover:bg-stone-50 disabled:opacity-40"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Mark False Positive (Healthy)
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <p className="text-xs text-slate-500">Select an observation from the left queue to inspect.</p>
                )}
              </div>
            </div>
          </motion.div>
        ) : subTab === 'treatments' ? (
          <motion.div
            key="treatments"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover"
          >
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-800" />
              Field Treatment Recommendations &amp; Verification
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-2 font-medium">Zone &amp; Crop</th>
                    <th className="py-2 font-medium">Intervention / Method</th>
                    <th className="py-2 font-medium">Label / Guidance</th>
                    <th className="py-2 font-medium">Outcome</th>
                    <th className="py-2 font-medium">Verification</th>
                    <th className="py-2 font-medium text-right">Expert Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {treatments.map((t: any, idx: number) => (
                    <tr
                      key={t.id}
                      style={{ animationDelay: `${Math.min(idx, 12) * 20}ms` }}
                      className="hover:bg-stone-50 transition-colors agro-row-enter"
                    >
                    <td className="py-2.5">
                      <div className="font-medium text-slate-900">{t.zoneName || t.zoneId}</div>
                      <div className="text-[11px] text-slate-500">{t.cropType} · {t.appliedAt?.slice(0, 10)}</div>
                    </td>
                    <td className="py-2.5 font-medium text-slate-800">{t.productOrMethod}</td>
                    <td className="py-2.5 text-slate-600">{t.dosage}</td>
                    <td className="py-2.5 text-slate-700">{t.outcomeStatus || 'pending_evaluation'}</td>
                    <td className="py-2.5">
                      {t.expertVerified ? (
                        <span className="text-emerald-800 font-medium">Expert Verified</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Unverified Log</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={!canReview || saving}
                          onClick={() => handleVerifyTreatment(t, 'improving')}
                          className="px-2 py-1 text-[11px] rounded bg-emerald-900 text-white hover:bg-emerald-800 disabled:opacity-40"
                        >
                          Verify (Improving)
                        </button>
                        <button
                          type="button"
                          disabled={!canReview || saving}
                          onClick={() => handleVerifyTreatment(t, 'no_change')}
                          className="px-2 py-1 text-[11px] rounded border border-stone-200 text-slate-700 hover:bg-stone-100 disabled:opacity-40"
                        >
                          Verify (No Change)
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white border border-stone-200 rounded-lg p-5 space-y-3 agro-card-hover"
          >
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-800" />
              Immutable Expert Review &amp; Modification History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-2 font-medium">Timestamp</th>
                    <th className="py-2 font-medium">Location &amp; Crop</th>
                    <th className="py-2 font-medium">Decision</th>
                    <th className="py-2 font-medium">Label / Severity Delta</th>
                    <th className="py-2 font-medium">Reviewer</th>
                    <th className="py-2 font-medium">Notes &amp; Treatment Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {history.map((h: any, idx: number) => (
                    <tr
                      key={h.id}
                      style={{ animationDelay: `${Math.min(idx, 12) * 20}ms` }}
                      className="hover:bg-stone-50 transition-colors agro-row-enter"
                    >
                      <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">
                        {h.reviewedAt?.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 text-slate-800">
                        <div className="font-medium">{h.district} · {h.zoneName}</div>
                        <div className="text-[11px] text-slate-500">{h.cropType}</div>
                      </td>
                      <td className="py-2.5 font-medium capitalize text-slate-900">{h.decision}</td>
                      <td className="py-2.5 text-slate-700">
                        <div>
                          {h.previousDisease} → <strong>{h.newDisease}</strong>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {h.previousSeverity} → {h.newSeverity}
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-700">
                        {h.reviewerName} <span className="text-slate-400">({h.reviewerRole})</span>
                      </td>
                      <td className="py-2.5 text-slate-600 max-w-xs">
                        <div>{h.comment}</div>
                        {h.treatmentRecommendationNote && (
                          <div className="text-emerald-800 mt-0.5">
                            <strong>Rx Note:</strong> {h.treatmentRecommendationNote}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </div>
  );
}
