import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Microscope, Upload } from 'lucide-react';
import { api } from '../api/client.ts';
import { analyzeLeafImageDeterministic, AnalyzedLeafOutput } from '../business/imageAnalyzer.ts';
import { CropType, FarmZone, SeverityAnalysisRecord } from '../types/agroshield.ts';
import {
  AnimatedCounter,
  DemoDisclaimerBar,
  ErrorBanner,
  PageHeader,
  SeverityLabel,
} from '../components/ui/CommonPrimitives.tsx';
import { ImageComparisonSlider } from '../components/ImageComparisonSlider.tsx';

export function SeverityAnalysisPage({
  initialContext,
}: {
  initialContext?: { imageUrl: string; cropType: CropType; farmId: string; zoneId: string } | null;
}) {
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [history, setHistory] = useState<SeverityAnalysisRecord[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>(initialContext?.zoneId || '');
  const [cropType, setCropType] = useState<CropType>(initialContext?.cropType || CropType.TOMATO);
  const [imageUrl, setImageUrl] = useState<string>(
    initialContext?.imageUrl || '/src/assets/images/tomato_blight_sample_1795172710319.jpg'
  );
  const [overlayView, setOverlayView] = useState<'boxes' | 'mask'>('boxes');
  const [analysis, setAnalysis] = useState<AnalyzedLeafOutput | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [z, hist] = await Promise.all([api.getZones(), api.getSeverityHistory()]);
      setZones(z);
      setHistory(hist);
      if (!selectedZoneId && z[0]) {
        setSelectedZoneId(z[0].id);
        setCropType(z[0].cropType);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const runSeveritySegmentation = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const [out] = await Promise.all([
        analyzeLeafImageDeterministic(imageUrl, cropType),
        new Promise((resolve) => setTimeout(resolve, 380)),
      ]);
      setAnalysis(out);
      const targetZone = zones.find((z) => z.id === selectedZoneId);
      await api.saveSeverityAnalysis({
        farmId: targetZone?.farmId || null,
        zoneId: selectedZoneId || null,
        cropType,
        diseaseName: out.predictedDisease,
        classificationConfidence: out.confidenceScore,
        affectedAreaPct: out.affectedAreaPct,
        severityClass: out.severityClass,
        boundingBoxes: out.boundingBoxes,
        originalImageUrl: imageUrl,
        annotatedImageUrl: out.annotatedSeverityDataUrl,
        segmentationMaskUrl: out.segmentationMaskDataUrl,
        processingEngine: 'demo_opencv_canvas_heuristic',
        modelVersion: 'YOLOv8-Architecture-Placeholder (OpenCV-Style Pixel Contour Demo)',
        notes: 'Classification confidence kept strictly separate from affected leaf area percentage.',
      });
      setHistory(await api.getSeverityHistory());
    } catch (err: any) {
      setError(err.message || 'Severity segmentation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
        setAnalysis(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const trendData = [...history]
    .reverse()
    .slice(-10)
    .map((h) => ({
      date: h.analyzedAt.slice(5, 10),
      affectedPct: h.affectedAreaPct,
      confidencePct: Math.round(h.classificationConfidence * 100),
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disease Severity & Lesion Localization"
        subtitle="Symptom bounding-box localization, OpenCV-style foliar lesion segmentation, affected leaf area estimation, and severity grading."
      />

      <DemoDisclaimerBar text="LOCALIZATION ARCHITECTURE NOTICE: Trained YOLOv8 weights are not loaded. Bounding boxes and affected-area percentages shown here are computed deterministically via canvas HSV/color-cluster segmentation in Demo Mode, and never claim trained YOLO accuracy." />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls & Tissue Breakdown */}
        <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Localization Parameters</h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Zone Assignment</label>
            <select
              value={selectedZoneId}
              onChange={(e) => {
                setSelectedZoneId(e.target.value);
                const z = zones.find((zn) => zn.id === e.target.value);
                if (z) setCropType(z.cropType);
              }}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — {z.district}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Crop Pathology Context</label>
            <select
              value={cropType}
              onChange={(e) => setCropType(e.target.value as CropType)}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
            >
              {Object.values(CropType).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-stone-100 border border-stone-200 text-slate-800 rounded-md hover:bg-stone-200 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Load Leaf Photo
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => {
                setImageUrl('/src/assets/images/potato_late_blight_sample_1795172709923.jpg');
                setCropType(CropType.POTATO);
                setAnalysis(null);
              }}
              className="px-3 py-2 text-xs font-medium border border-stone-200 rounded-md text-slate-700 hover:bg-stone-50"
            >
              Potato Demo Specimen
            </button>
          </div>

          <button
            type="button"
            onClick={runSeveritySegmentation}
            disabled={analyzing}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
          >
            <Microscope className="w-4 h-4" />
            {analyzing ? 'Segmenting Lesions...' : 'Run Severity Localization'}
          </button>

          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="pt-4 border-t border-stone-200 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-stone-50 border border-stone-200 rounded p-3">
                  <div className="text-[11px] text-slate-500">Affected Leaf Area</div>
                  <div className="text-xl font-mono font-semibold tabular-nums text-red-700 mt-0.5">
                    <AnimatedCounter value={analysis.affectedAreaPct} />%
                  </div>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded p-3">
                  <div className="text-[11px] text-slate-500">Severity Grade</div>
                  <div className="mt-1">
                    <SeverityLabel severity={analysis.severityClass} />
                  </div>
                </div>
              </div>

              <div className="text-xs space-y-2 border border-stone-200 rounded p-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Classification Confidence (Separate)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {Math.round(analysis.confidenceScore * 100)}%
                  </span>
                </div>
                {[
                  { label: 'Healthy Green Tissue', val: analysis.visualSummary.healthyGreenPct, textCls: 'text-emerald-700', barCls: 'bg-emerald-600' },
                  { label: 'Chlorotic Halo Tissue', val: analysis.visualSummary.chloroticYellowPct, textCls: 'text-amber-700', barCls: 'bg-amber-500' },
                  { label: 'Necrotic Lesion Tissue', val: analysis.visualSummary.necroticBrownPct, textCls: 'text-red-700', barCls: 'bg-red-600' },
                ].map((row) => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{row.label}</span>
                      <span className={`font-mono ${row.textCls}`}>{row.val}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, row.val)}%` }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full rounded-full ${row.barCls}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Annotated Image Comparison */}
        <div className="lg:col-span-8 bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Original vs. Localized Lesion Inspection
            </h2>
            {analysis && (
              <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-md border border-stone-200">
                <button
                  onClick={() => setOverlayView('boxes')}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    overlayView === 'boxes' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Bounding Boxes
                </button>
                <button
                  onClick={() => setOverlayView('mask')}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    overlayView === 'mask' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Segmentation Mask
                </button>
              </div>
            )}
          </div>

          {!analysis || analyzing ? (
            <div className="relative aspect-[4/3] max-h-96 w-full rounded-lg overflow-hidden border border-stone-200">
              <img src={imageUrl} alt="Leaf ready for severity segmentation" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              {analyzing && (
                <>
                  <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />
                  <div
                    className="agro-scan-line absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.95)]"
                    aria-hidden="true"
                  />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-900/85 text-amber-300 text-[11px] font-mono">
                    Segmenting Foliar Lesion Contours...
                  </div>
                </>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26 }}
              className="space-y-4"
            >
              <ImageComparisonSlider
                originalUrl={imageUrl}
                analyzedUrl={
                  overlayView === 'boxes' ? analysis.annotatedSeverityDataUrl : analysis.segmentationMaskDataUrl
                }
                originalLabel="Original Specimen"
                analyzedLabel={overlayView === 'boxes' ? 'Localized Lesion Boxes' : 'HSV Lesion Mask'}
              />

              {/* Real Bounding-Box Spatial Marker Strip (shown only when actual regions detected) */}
              {analysis.boundingBoxes.length > 0 && (
                <div className="relative aspect-[16/7] w-full rounded-lg overflow-hidden border border-stone-200 bg-stone-900">
                  <img
                    src={imageUrl}
                    alt="Detected disease hotspot overlay"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-80"
                  />
                  {analysis.boundingBoxes.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        left: `${b.x * 100}%`,
                        top: `${b.y * 100}%`,
                        width: `${Math.max(8, b.width * 100)}%`,
                        height: `${Math.max(8, b.height * 100)}%`,
                      }}
                      title={`${b.label} (${b.lesionAreaPct}% area)`}
                      className="absolute border-2 border-red-400/90 bg-red-500/15 rounded-xs flex items-center justify-center"
                    >
                      <span className="relative inline-flex w-3 h-3">
                        <span className="absolute inset-0 rounded-full bg-red-400 agro-pulse-ring" />
                        <span className="relative w-3 h-3 rounded-full bg-red-600 border border-white" />
                      </span>
                    </div>
                  ))}
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-slate-900/80 text-white text-[11px] font-mono">
                    Localized Symptom Centroids ({analysis.boundingBoxes.length})
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {analysis && analysis.boundingBoxes.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-semibold text-slate-900 mb-2">Detected Symptom Regions</div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-slate-500">
                    <th className="py-1.5 font-medium">Region Label</th>
                    <th className="py-1.5 font-medium">Normalized Box (x, y, w, h)</th>
                    <th className="py-1.5 font-medium text-right">Lesion Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {analysis.boundingBoxes.map((b, idx) => (
                    <tr key={b.id} className="hover:bg-stone-50 agro-row-enter" style={{ animationDelay: `${idx * 35}ms` }}>
                      <td className="py-2 font-medium text-slate-800">{b.label}</td>
                      <td className="py-2 font-mono text-slate-600">
                        ({b.x}, {b.y}, {b.width}, {b.height})
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-red-700">{b.lesionAreaPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Historical Severity Tracking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Historical Affected-Area Progression</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="%" />
                <Tooltip />
                <Line type="monotone" dataKey="affectedPct" name="Affected Area %" stroke="#DC2626" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Saved Severity Records</h3>
          <div className="overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-slate-500">
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 font-medium">Disease</th>
                  <th className="py-1.5 font-medium text-right">Affected Area</th>
                  <th className="py-1.5 font-medium text-right">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {history.slice(0, 8).map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 font-mono text-slate-500">{h.analyzedAt.slice(0, 10)}</td>
                    <td className="py-2 font-medium text-slate-900 truncate max-w-[180px]">{h.diseaseName}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-800">{h.affectedAreaPct}%</td>
                    <td className="py-2 text-right"><SeverityLabel severity={h.severityClass} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
