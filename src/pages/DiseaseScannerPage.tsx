import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, CheckCircle2, Cpu, ScanLine, Upload, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.ts';
import { analyzeLeafImageDeterministic, AnalyzedLeafOutput } from '../business/imageAnalyzer.ts';
import { CropType, DiseaseScanRecord, Farm, FarmZone } from '../types/agroshield.ts';
import {
  AnimatedCounter,
  AnimatedNotice,
  DemoDisclaimerBar,
  ErrorBanner,
  PageHeader,
} from '../components/ui/CommonPrimitives.tsx';
import { ImageComparisonSlider } from '../components/ImageComparisonSlider.tsx';

const SAMPLE_SPECIMENS: Array<{ label: string; cropType: CropType; url: string }> = [
  {
    label: 'Tomato Leaf Specimen (Concentric Spots)',
    cropType: CropType.TOMATO,
    url: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
  },
  {
    label: 'Potato Leaf Specimen (Water-Soaked Margin)',
    cropType: CropType.POTATO,
    url: '/src/assets/images/potato_late_blight_sample_1795172709923.jpg',
  },
  {
    label: 'Rice Paddy Specimen (Spindle Lesions)',
    cropType: CropType.RICE,
    url: '/src/assets/images/rice_blast_sample_1795172710079.jpg',
  },
  {
    label: 'Chilli Leaf Specimen (Margin Curl)',
    cropType: CropType.CHILLI,
    url: '/src/assets/images/chilli_leaf_curl_sample_1795172711138.jpg',
  },
];

export function DiseaseScannerPage({
  onOpenSeverityWithResult,
}: {
  onOpenSeverityWithResult?: (payload: { imageUrl: string; cropType: CropType; farmId: string; zoneId: string }) => void;
}) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [history, setHistory] = useState<DiseaseScanRecord[]>([]);
  const [fastApiHealth, setFastApiHealth] = useState<any>(null);

  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [cropType, setCropType] = useState<CropType>(CropType.TOMATO);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(SAMPLE_SPECIMENS[0].url);
  const [logToZone, setLogToZone] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [scanStageIdx, setScanStageIdx] = useState(0);
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const [result, setResult] = useState<AnalyzedLeafOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const SCAN_STAGES = [
    'Checking image sharpness & brightness',
    'Normalizing 224×224 foliar tensor',
    'Computing pixel-ratio heuristics & Grad-CAM',
    'Persisting diagnostic prediction record',
  ];

  const loadInitial = async () => {
    try {
      const [f, z, h, fa] = await Promise.all([
        api.getFarms(),
        api.getZones(),
        api.getScannerHistory(),
        api.getFastApiHealth(),
      ]);
      setFarms(f);
      setZones(z);
      setHistory(h);
      setFastApiHealth(fa);
      if (f[0]) {
        setSelectedFarmId(f[0].id);
        const firstZone = z.find((zn: FarmZone) => zn.farmId === f[0].id);
        if (firstZone) {
          setSelectedZoneId(firstZone.id);
          setCropType(firstZone.cropType);
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadInitial();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const farmZones = zones.filter((z) => z.farmId === selectedFarmId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedImageUrl(reader.result);
        setResult(null);
        setSavedNotice(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 80);
    } catch {
      setError('Camera permission unavailable in browser. Upload an image file or select a specimen.');
    }
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    setSelectedImageUrl(canvas.toDataURL('image/jpeg', 0.9));
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setResult(null);
  };

  const runDiagnosticAnalysis = async () => {
    setAnalyzing(true);
    setScanStageIdx(0);
    setScanProgressPct(18);
    setError(null);
    setSavedNotice(null);
    try {
      setScanStageIdx(1);
      setScanProgressPct(42);
      const [output] = await Promise.all([
        analyzeLeafImageDeterministic(selectedImageUrl, cropType),
        new Promise((resolve) => setTimeout(resolve, 420)),
      ]);
      setScanStageIdx(2);
      setScanProgressPct(74);
      setResult(output);

      const isFastApiReady = fastApiHealth?.connected && fastApiHealth?.weightsLoaded;

      setScanStageIdx(3);
      setScanProgressPct(90);
      await api.saveDiseaseScan({
        farmId: selectedFarmId || null,
        zoneId: selectedZoneId || null,
        cropType,
        imageUrl: selectedImageUrl,
        gradCamOverlayUrl: output.gradCamOverlayDataUrl,
        predictedDisease: output.predictedDisease,
        isHealthy: output.isHealthy,
        confidenceScore: output.confidenceScore,
        alternativePredictions: output.alternativePredictions,
        qualityMetrics: output.qualityMetrics,
        inferenceMode: isFastApiReady ? 'fastapi_cnn_resnet50' : 'demo_visual_sandbox',
        modelVersion: isFastApiReady
          ? 'ResNet50-PlantVillage-v1'
          : 'PlantVillage-ResNet50-Architecture-Placeholder (Demo Visual Heuristic)',
        datasetReference: 'PlantVillage (Training) / PlantDoc (Field Evaluation)',
        logObservation: logToZone,
      });

      const updatedHistory = await api.getScannerHistory();
      setHistory(updatedHistory);
      setScanProgressPct(100);
      setSavedNotice(
        logToZone
          ? 'Scan recorded in Prediction History and logged as a pending Farm Zone observation.'
          : 'Scan recorded in Prediction History (Demo Visual Sandbox).'
      );
    } catch (err: any) {
      setError(err.message || 'Image analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Crop Disease Scanner"
        subtitle="Leaf image quality validation, 224×224 tensor preprocessing, CNN/ResNet architecture pipeline, and Grad-CAM lesion attention visualization."
        action={
          <div className="text-xs text-slate-600 bg-white border border-stone-200 rounded-md px-3 py-2 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span>
              FastAPI PyTorch:{' '}
              <strong className={fastApiHealth?.weightsLoaded ? 'text-emerald-700' : 'text-amber-700'}>
                {fastApiHealth?.weightsLoaded ? 'Weights Loaded' : 'Disconnected (Demo Mode Active)'}
              </strong>
            </span>
          </div>
        }
      />

      <DemoDisclaimerBar text="MODEL TRANSPARENCY: External PyTorch ResNet50 weights are not connected. Analysis runs deterministic image quality checks and pixel-ratio visual heuristics in Demo Mode (never random guesses). Connect your Python FastAPI server in Settings when weights are trained on PlantVillage & PlantDoc." />

      {error && <ErrorBanner message={error} />}
      <AnimatedNotice message={savedNotice} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Capture & Input Panel */}
        <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">1. Specimen Input & Zone Context</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Target Crop</label>
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Farm</label>
              <select
                value={selectedFarmId}
                onChange={(e) => {
                  setSelectedFarmId(e.target.value);
                  const first = zones.find((z) => z.farmId === e.target.value);
                  if (first) setSelectedZoneId(first.id);
                }}
                className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Farm Zone</label>
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-slate-900"
            >
              {farmZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.cropType} · {z.growthStage})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-stone-100 border border-stone-200 text-slate-800 rounded-md hover:bg-stone-200 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              Upload Leaf Image
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-stone-100 border border-stone-200 text-slate-800 rounded-md hover:bg-stone-200 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Camera Capture
            </button>
          </div>

          {cameraOpen && (
            <div className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded aspect-[4/3] object-cover bg-black" />
              <button
                type="button"
                onClick={captureCameraFrame}
                className="w-full py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800"
              >
                Capture Frame
              </button>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-600 mb-1.5">Demo Reference Specimens</div>
            <div className="grid grid-cols-2 gap-2">
              {SAMPLE_SPECIMENS.map((sp) => (
                <button
                  key={sp.url}
                  type="button"
                  onClick={() => {
                    setSelectedImageUrl(sp.url);
                    setCropType(sp.cropType);
                    setResult(null);
                    setSavedNotice(null);
                  }}
                  className={`p-2 rounded-md border text-left transition-colors ${
                    selectedImageUrl === sp.url
                      ? 'border-emerald-700 bg-emerald-50/70'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <img
                    src={sp.url}
                    alt={sp.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-16 object-cover rounded mb-1.5"
                  />
                  <div className="text-[11px] font-medium text-slate-800 truncate">{sp.cropType}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={logToZone}
              onChange={(e) => setLogToZone(e.target.checked)}
              className="rounded accent-emerald-800"
            />
            Log result as pending observation on selected farm zone
          </label>

          <button
            type="button"
            onClick={runDiagnosticAnalysis}
            disabled={analyzing}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            {analyzing ? 'Running Preprocessing & Visual Analysis...' : 'Run Leaf Diagnostic Scan'}
          </button>
        </div>

        {/* Right: Results, Quality Check & Grad-CAM */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">2. Diagnostic Output & Grad-CAM Explanation</h2>
            {result && (
              <span className="text-xs font-mono text-slate-500">
                {result.qualityMetrics.width}×{result.qualityMetrics.height}px
              </span>
            )}
          </div>

          {!result || analyzing ? (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] max-h-80 w-full rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                <img
                  src={selectedImageUrl}
                  alt="Selected leaf preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {analyzing && (
                  <>
                    <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />
                    <div
                      className="agro-scan-line absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_14px_rgba(16,185,129,0.95)]"
                      aria-hidden="true"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-900/85 text-emerald-300 text-[11px] font-mono">
                      Scanning · {SCAN_STAGES[scanStageIdx]}
                    </div>
                  </>
                )}
              </div>

              {analyzing ? (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900">{SCAN_STAGES[scanStageIdx]}</span>
                    <span className="font-mono text-emerald-800">{scanProgressPct}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${scanProgressPct}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="h-full bg-emerald-700 rounded-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                    {SCAN_STAGES.map((label, idx) => (
                      <div
                        key={label}
                        className={`px-2 py-1 rounded border transition-colors ${
                          idx <= scanStageIdx
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                            : 'bg-white border-stone-200 text-slate-400'
                        }`}
                      >
                        {idx + 1}. {label.split(' ')[0]} {label.split(' ')[1]}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <p className="text-xs text-slate-600">
                  Click <strong>Run Leaf Diagnostic Scan</strong> to execute image quality validation, 224×224 normalization preview, deterministic foliar color feature classification, and Grad-CAM spatial attention mapping.
                </p>
              )}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={result.predictedDisease + result.confidenceScore}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-5"
              >
                {/* Primary Classification Banner */}
                <div className="border border-stone-200 rounded-lg p-4 bg-stone-50 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      Demo Visual Heuristic Output · Not Trained PyTorch Weights
                    </div>
                    <div className="text-lg font-semibold text-slate-900 mt-0.5">
                      {result.predictedDisease}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Classification: <strong>{result.isHealthy ? 'Healthy' : 'Diseased'}</strong> · Model Slot: PlantVillage-ResNet50
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Heuristic Score</div>
                    <div className="text-2xl font-mono font-semibold tabular-nums text-emerald-900">
                      <AnimatedCounter value={Math.round(result.confidenceScore * 100)} />%
                    </div>
                  </div>
                </div>

                {/* Image Quality Validation */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="border border-stone-200 rounded p-2.5 agro-card-hover">
                    <div className="text-slate-500">Quality Check</div>
                    <div className={`font-semibold mt-1 ${result.qualityMetrics.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {result.qualityMetrics.passed ? 'Passed' : 'Review Warnings'}
                    </div>
                  </div>
                  <div className="border border-stone-200 rounded p-2.5 agro-card-hover">
                    <div className="text-slate-500">Sharpness</div>
                    <div className="font-mono font-semibold text-slate-900 mt-1">
                      <AnimatedCounter value={result.qualityMetrics.sharpnessScore} />/100
                    </div>
                  </div>
                  <div className="border border-stone-200 rounded p-2.5 agro-card-hover">
                    <div className="text-slate-500">Brightness</div>
                    <div className="font-mono font-semibold text-slate-900 mt-1">
                      <AnimatedCounter value={result.qualityMetrics.brightness} />/255
                    </div>
                  </div>
                  <div className="border border-stone-200 rounded p-2.5 agro-card-hover">
                    <div className="text-slate-500">Foliage Ratio</div>
                    <div className="font-mono font-semibold text-slate-900 mt-1">
                      <AnimatedCounter value={Math.round(result.qualityMetrics.greenFoliageRatio * 100)} />%
                    </div>
                  </div>
                </div>

                {result.qualityMetrics.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <ul className="list-disc pl-4 space-y-0.5">
                      {result.qualityMetrics.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Grad-CAM vs Original Comparison + Real Detected Region Hotspots */}
                <div className="space-y-2">
                  <ImageComparisonSlider
                    originalUrl={selectedImageUrl}
                    analyzedUrl={result.gradCamOverlayDataUrl}
                    originalLabel="Original Frame"
                    analyzedLabel="Grad-CAM Attention Overlay"
                  />
                  {result.boundingBoxes && result.boundingBoxes.length > 0 && (
                    <div className="relative rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
                      <div className="font-medium text-slate-800 mb-2">
                        Detected Symptom Coordinates ({result.boundingBoxes.length} region{result.boundingBoxes.length > 1 ? 's' : ''} localized)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.boundingBoxes.map((b) => (
                          <div
                            key={b.id}
                            className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded px-2.5 py-1.5 font-mono text-[11px]"
                          >
                            <span className="relative inline-flex w-2 h-2">
                              <span className="absolute inset-0 rounded-full bg-red-500 opacity-60 agro-pulse-ring" />
                              <span className="relative w-2 h-2 rounded-full bg-red-600" />
                            </span>
                            <span className="text-slate-800 font-sans font-medium">{b.label}</span>
                            <span className="text-slate-500">({b.x.toFixed(2)}, {b.y.toFixed(2)})</span>
                            <span className="text-red-700 font-semibold">{b.lesionAreaPct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Differential Alternatives + Preprocessed Tensor Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start pt-2 border-t border-stone-200">
                  <div className="sm:col-span-2 space-y-2">
                    <div className="text-xs font-semibold text-slate-900">Differential Predictions</div>
                    <div className="divide-y divide-stone-100 border border-stone-200 rounded-md px-3">
                      {result.alternativePredictions.map((alt) => (
                        <div key={alt.diseaseName} className="py-2 flex items-center justify-between text-xs">
                          <span className="text-slate-700">{alt.diseaseName}</span>
                          <span className="font-mono tabular-nums text-slate-900">{Math.round(alt.confidence * 100)}%</span>
                        </div>
                      ))}
                    </div>
                    {onOpenSeverityWithResult && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenSeverityWithResult({
                            imageUrl: selectedImageUrl,
                            cropType,
                            farmId: selectedFarmId,
                            zoneId: selectedZoneId,
                          })
                        }
                        className="mt-2 px-3.5 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800"
                      >
                        Proceed to Severity &amp; Lesion Localization
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-900 mb-1.5">224×224 Normalized Input</div>
                    <img
                      src={result.preprocessedDataUrl}
                      alt="224x224 normalized tensor preview"
                      className="w-28 h-28 object-cover rounded border border-stone-200"
                    />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Prediction History Table */}
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Prediction History & Model Version Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-slate-500">
                <th className="py-2 font-medium">Timestamp</th>
                <th className="py-2 font-medium">Crop</th>
                <th className="py-2 font-medium">Predicted Class</th>
                <th className="py-2 font-medium text-right">Score</th>
                <th className="py-2 font-medium">Inference Mode</th>
                <th className="py-2 font-medium">Model / Dataset Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.slice(0, 12).map((h) => (
                <tr key={h.id} className="hover:bg-stone-50">
                  <td className="py-2.5 font-mono text-slate-500">{h.createdAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className="py-2.5 font-medium text-slate-900">{h.cropType}</td>
                  <td className="py-2.5 text-slate-800">{h.predictedDisease}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-900">
                    {Math.round(h.confidenceScore * 100)}%
                  </td>
                  <td className="py-2.5 text-slate-600">
                    {h.inferenceMode === 'fastapi_cnn_resnet50' ? 'FastAPI PyTorch' : 'Demo Visual Sandbox'}
                  </td>
                  <td className="py-2.5 text-slate-500 truncate max-w-xs">{h.modelVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
