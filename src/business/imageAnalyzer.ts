import {
  AlternativePrediction,
  CropType,
  ImageQualityMetrics,
  SeverityBoundingBox,
  SeverityClass,
} from '../types/agroshield.ts';

export interface AnalyzedLeafOutput {
  qualityMetrics: ImageQualityMetrics;
  preprocessedDataUrl: string;
  gradCamOverlayDataUrl: string;
  annotatedSeverityDataUrl: string;
  segmentationMaskDataUrl: string;
  predictedDisease: string;
  isHealthy: boolean;
  confidenceScore: number;
  alternativePredictions: AlternativePrediction[];
  affectedAreaPct: number;
  severityClass: SeverityClass;
  boundingBoxes: SeverityBoundingBox[];
  visualSummary: {
    healthyGreenPct: number;
    chloroticYellowPct: number;
    necroticBrownPct: number;
  };
}

function classifyByVisualFeatures(
  cropType: CropType,
  necroticPct: number,
  chloroticPct: number
): {
  predictedDisease: string;
  isHealthy: boolean;
  confidenceScore: number;
  alternatives: AlternativePrediction[];
} {
  const totalSymptomPct = necroticPct + chloroticPct;

  if (totalSymptomPct < 2.2) {
    return {
      predictedDisease: `${cropType} Healthy Foliage`,
      isHealthy: true,
      confidenceScore: 0.91,
      alternatives: [
        { diseaseName: `${cropType} Early Nutrient Stress`, confidence: 0.06 },
        { diseaseName: `${cropType} Mild Foliar Spot`, confidence: 0.03 },
      ],
    };
  }

  switch (cropType) {
    case CropType.TOMATO:
      if (necroticPct >= chloroticPct * 0.8) {
        return {
          predictedDisease: 'Tomato Early Blight (Alternaria solani)',
          isHealthy: false,
          confidenceScore: Number(Math.min(0.92, 0.72 + totalSymptomPct * 0.008).toFixed(2)),
          alternatives: [
            { diseaseName: 'Tomato Late Blight (Phytophthora infestans)', confidence: 0.14 },
            { diseaseName: 'Tomato Septoria Leaf Spot', confidence: 0.08 },
          ],
        };
      }
      return {
        predictedDisease: 'Tomato Yellow Leaf Curl / Chlorosis',
        isHealthy: false,
        confidenceScore: Number(Math.min(0.88, 0.68 + chloroticPct * 0.009).toFixed(2)),
        alternatives: [
          { diseaseName: 'Tomato Early Blight', confidence: 0.16 },
          { diseaseName: 'Tomato Healthy Foliage', confidence: 0.06 },
        ],
      };

    case CropType.POTATO:
      return {
        predictedDisease: 'Potato Late Blight (Phytophthora infestans)',
        isHealthy: false,
        confidenceScore: Number(Math.min(0.91, 0.74 + totalSymptomPct * 0.007).toFixed(2)),
        alternatives: [
          { diseaseName: 'Potato Early Blight (Alternaria solani)', confidence: 0.13 },
          { diseaseName: 'Potato Healthy Foliage', confidence: 0.04 },
        ],
      };

    case CropType.RICE:
      return {
        predictedDisease: 'Rice Leaf Blast (Magnaporthe oryzae)',
        isHealthy: false,
        confidenceScore: Number(Math.min(0.89, 0.71 + totalSymptomPct * 0.008).toFixed(2)),
        alternatives: [
          { diseaseName: 'Rice Brown Spot (Bipolaris oryzae)', confidence: 0.15 },
          { diseaseName: 'Rice Bacterial Leaf Blight', confidence: 0.07 },
        ],
      };

    case CropType.MAIZE:
      return {
        predictedDisease: 'Northern Corn Leaf Blight (Exserohilum turcicum)',
        isHealthy: false,
        confidenceScore: Number(Math.min(0.88, 0.70 + totalSymptomPct * 0.008).toFixed(2)),
        alternatives: [
          { diseaseName: 'Maize Common Rust (Puccinia sorghi)', confidence: 0.14 },
          { diseaseName: 'Maize Healthy Foliage', confidence: 0.06 },
        ],
      };

    case CropType.CHILLI:
      if (chloroticPct > necroticPct) {
        return {
          predictedDisease: 'Chilli Leaf Curl Complex (Begomovirus Vector)',
          isHealthy: false,
          confidenceScore: Number(Math.min(0.87, 0.69 + chloroticPct * 0.009).toFixed(2)),
          alternatives: [
            { diseaseName: 'Chilli Cercospora Leaf Spot', confidence: 0.15 },
            { diseaseName: 'Chilli Healthy Foliage', confidence: 0.07 },
          ],
        };
      }
      return {
        predictedDisease: 'Chilli Anthracnose / Leaf Spot',
        isHealthy: false,
        confidenceScore: Number(Math.min(0.86, 0.70 + necroticPct * 0.008).toFixed(2)),
        alternatives: [
          { diseaseName: 'Chilli Leaf Curl Complex', confidence: 0.14 },
          { diseaseName: 'Chilli Bacterial Spot', confidence: 0.08 },
        ],
      };
  }
}

export function determineSeverityClass(affectedPct: number): SeverityClass {
  if (affectedPct < 1.0) return SeverityClass.HEALTHY;
  if (affectedPct <= 15.0) return SeverityClass.MILD;
  if (affectedPct <= 35.0) return SeverityClass.MODERATE;
  return SeverityClass.SEVERE;
}

export async function analyzeLeafImageDeterministic(
  imageSrc: string,
  cropType: CropType
): Promise<AnalyzedLeafOutput> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for canvas preprocessing.'));
    img.src = imageSrc;
  });

  const origW = img.naturalWidth || img.width || 640;
  const origH = img.naturalHeight || img.height || 480;

  // Work on normalized 224x224 grid for deterministic tensor-like analysis
  const size = 224;
  const prepCanvas = document.createElement('canvas');
  prepCanvas.width = size;
  prepCanvas.height = size;
  const prepCtx = prepCanvas.getContext('2d')!;
  prepCtx.drawImage(img, 0, 0, size, size);
  const preprocessedDataUrl = prepCanvas.toDataURL('image/jpeg', 0.9);

  const imgData = prepCtx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Buffers for Grad-CAM style heatmap & Lesion Segmentation Mask
  const camCanvas = document.createElement('canvas');
  camCanvas.width = size;
  camCanvas.height = size;
  const camCtx = camCanvas.getContext('2d')!;
  camCtx.drawImage(img, 0, 0, size, size);
  const camData = camCtx.getImageData(0, 0, size, size);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = size;
  maskCanvas.height = size;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskData = maskCtx.createImageData(size, size);

  let luminanceSum = 0;
  let edgeEnergySum = 0;
  let leafPixelCount = 0;
  let healthyGreenCount = 0;
  let chloroticCount = 0;
  let necroticCount = 0;

  // 14x14 grid (each cell 16x16 px) to localize lesion clusters deterministically
  const gridDim = 14;
  const cellSize = size / gridDim;
  const cellLesionCounts = new Array(gridDim * gridDim).fill(0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      luminanceSum += lum;

      if (x > 0 && y > 0) {
        const leftIdx = (y * size + (x - 1)) * 4;
        const topIdx = ((y - 1) * size + x) * 4;
        const lumLeft = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
        const lumTop = 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
        edgeEnergySum += Math.abs(lum - lumLeft) + Math.abs(lum - lumTop);
      }

      // Color heuristics for leaf tissue vs background
      const isHealthyGreen = g > r * 1.06 && g > b * 1.12 && g > 48;
      const isChloroticYellow = r > 125 && g > 118 && b < 115 && Math.abs(r - g) < 48 && g > b * 1.2;
      const isNecroticLesion =
        (r > b * 1.15 && r > g * 0.98 && lum >= 22 && lum <= 135 && r - b > 14) ||
        (lum < 72 && r >= g && g >= b && r - b > 8);

      const gx = Math.min(gridDim - 1, Math.floor(x / cellSize));
      const gy = Math.min(gridDim - 1, Math.floor(y / cellSize));
      const cellIdx = gy * gridDim + gx;

      if (isHealthyGreen || isChloroticYellow || isNecroticLesion) {
        leafPixelCount += 1;
      }

      if (isNecroticLesion) {
        necroticCount += 1;
        cellLesionCounts[cellIdx] += 1;

        // Paint high-activation crimson/amber into Grad-CAM overlay
        camData.data[idx] = Math.min(255, Math.round(r * 0.35 + 235 * 0.65));
        camData.data[idx + 1] = Math.round(g * 0.35 + 48 * 0.65);
        camData.data[idx + 2] = Math.round(b * 0.35 + 32 * 0.65);

        // Segmentation mask: bright red for necrotic lesion
        maskData.data[idx] = 220;
        maskData.data[idx + 1] = 38;
        maskData.data[idx + 2] = 38;
        maskData.data[idx + 3] = 255;
      } else if (isChloroticYellow) {
        chloroticCount += 1;
        cellLesionCounts[cellIdx] += 0.6;

        // Paint warm yellow-orange activation into Grad-CAM overlay
        camData.data[idx] = Math.min(255, Math.round(r * 0.45 + 245 * 0.55));
        camData.data[idx + 1] = Math.min(255, Math.round(g * 0.45 + 165 * 0.55));
        camData.data[idx + 2] = Math.round(b * 0.45 + 20 * 0.55);

        // Segmentation mask: amber for chlorotic halo
        maskData.data[idx] = 217;
        maskData.data[idx + 1] = 119;
        maskData.data[idx + 2] = 6;
        maskData.data[idx + 3] = 255;
      } else if (isHealthyGreen) {
        healthyGreenCount += 1;
        // Cool green-blue low activation in Grad-CAM
        camData.data[idx] = Math.round(r * 0.72);
        camData.data[idx + 1] = Math.min(255, Math.round(g * 0.75 + 40));
        camData.data[idx + 2] = Math.min(255, Math.round(b * 0.7 + 75));

        // Healthy tissue mask: emerald green
        maskData.data[idx] = 22;
        maskData.data[idx + 1] = 163;
        maskData.data[idx + 2] = 74;
        maskData.data[idx + 3] = 255;
      } else {
        // Background muted in segmentation mask
        maskData.data[idx] = 24;
        maskData.data[idx + 1] = 28;
        maskData.data[idx + 2] = 26;
        maskData.data[idx + 3] = 255;
      }
    }
  }

  camCtx.putImageData(camData, 0, 0);
  maskCtx.putImageData(maskData, 0, 0);

  const totalPixels = size * size;
  const brightness = Math.round(luminanceSum / totalPixels);
  const meanEdge = edgeEnergySum / totalPixels;
  const sharpnessScore = Math.min(100, Math.round(meanEdge * 2.6));
  const foliageDenominator = Math.max(leafPixelCount, totalPixels * 0.28);
  const greenFoliageRatio = Number(Math.min(1, leafPixelCount / totalPixels).toFixed(2));

  const warnings: string[] = [];
  if (origW < 300 || origH < 300) warnings.push('Low image resolution (< 300px); closer macro framing advised.');
  if (brightness < 45) warnings.push('Underexposed / low light frame; capture in indirect daylight.');
  if (brightness > 225) warnings.push('Overexposed highlights may obscure chlorotic margins.');
  if (sharpnessScore < 22) warnings.push('Low edge sharpness detected; hold camera steady for focus.');
  if (greenFoliageRatio < 0.18) warnings.push('Low foliar leaf coverage detected in frame.');

  const necroticPct = Number(Math.min(85, (necroticCount / foliageDenominator) * 100).toFixed(1));
  const chloroticPct = Number(Math.min(85, (chloroticCount / foliageDenominator) * 100).toFixed(1));
  const healthyPct = Number(Math.max(0, 100 - necroticPct - chloroticPct).toFixed(1));

  const affectedAreaPct = Number(Math.min(92, necroticPct + chloroticPct * 0.65).toFixed(1));
  const severityClass = determineSeverityClass(affectedAreaPct);

  // Extract top lesion bounding boxes from 14x14 grid clusters
  const boxes: SeverityBoundingBox[] = [];
  const visited = new Set<number>();
  const cellThreshold = (cellSize * cellSize) * 0.22;

  for (let gy = 0; gy < gridDim; gy++) {
    for (let gx = 0; gx < gridDim; gx++) {
      const idx = gy * gridDim + gx;
      if (visited.has(idx) || cellLesionCounts[idx] < cellThreshold) continue;

      // Simple BFS to merge contiguous symptomatic cells into a bounding region
      const queue = [idx];
      visited.add(idx);
      let minX = gx;
      let maxX = gx;
      let minY = gy;
      let maxY = gy;
      let lesionSum = 0;

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const cx = curr % gridDim;
        const cy = Math.floor(curr / gridDim);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        lesionSum += cellLesionCounts[curr];

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < gridDim && ny >= 0 && ny < gridDim) {
            const nIdx = ny * gridDim + nx;
            if (!visited.has(nIdx) && cellLesionCounts[nIdx] >= cellThreshold * 0.6) {
              visited.add(nIdx);
              queue.push(nIdx);
            }
          }
        }
      }

      const boxAreaPct = Number(((lesionSum / foliageDenominator) * 100).toFixed(1));
      if (boxAreaPct >= 1.2) {
        boxes.push({
          id: `box-${boxes.length + 1}`,
          label: boxAreaPct > 8 ? 'Primary Lesion Cluster' : 'Secondary Foliar Spot',
          x: Number((minX / gridDim).toFixed(3)),
          y: Number((minY / gridDim).toFixed(3)),
          width: Number(((maxX - minX + 1) / gridDim).toFixed(3)),
          height: Number(((maxY - minY + 1) / gridDim).toFixed(3)),
          lesionAreaPct: boxAreaPct,
          detectorConfidence: null, // Explicitly null in Demo Mode (not trained YOLO weights)
        });
      }
    }
  }

  const topBoxes = boxes.sort((a, b) => b.lesionAreaPct - a.lesionAreaPct).slice(0, 5);

  // Render Annotated Bounding Box Canvas
  const annCanvas = document.createElement('canvas');
  annCanvas.width = 448;
  annCanvas.height = 336;
  const annCtx = annCanvas.getContext('2d')!;
  annCtx.drawImage(img, 0, 0, annCanvas.width, annCanvas.height);

  topBoxes.forEach((box, idx) => {
    const bx = box.x * annCanvas.width;
    const by = box.y * annCanvas.height;
    const bw = box.width * annCanvas.width;
    const bh = box.height * annCanvas.height;

    annCtx.strokeStyle = idx === 0 ? '#DC2626' : '#D97706';
    annCtx.lineWidth = 2.5;
    annCtx.strokeRect(bx, by, bw, bh);

    const tag = `${box.label} (${box.lesionAreaPct}%)`;
    annCtx.font = '600 11px "JetBrains Mono", monospace';
    const textW = annCtx.measureText(tag).width + 10;
    annCtx.fillStyle = idx === 0 ? '#DC2626' : '#D97706';
    annCtx.fillRect(bx, Math.max(0, by - 18), textW, 18);
    annCtx.fillStyle = '#FFFFFF';
    annCtx.fillText(tag, bx + 5, Math.max(13, by - 5));
  });

  const cls = classifyByVisualFeatures(cropType, necroticPct, chloroticPct);

  return {
    qualityMetrics: {
      width: origW,
      height: origH,
      brightness,
      sharpnessScore,
      greenFoliageRatio,
      passed: warnings.length <= 1 && sharpnessScore >= 18,
      warnings,
    },
    preprocessedDataUrl,
    gradCamOverlayDataUrl: camCanvas.toDataURL('image/jpeg', 0.88),
    annotatedSeverityDataUrl: annCanvas.toDataURL('image/jpeg', 0.9),
    segmentationMaskDataUrl: maskCanvas.toDataURL('image/png'),
    predictedDisease: cls.predictedDisease,
    isHealthy: cls.isHealthy,
    confidenceScore: cls.confidenceScore,
    alternativePredictions: cls.alternatives,
    affectedAreaPct,
    severityClass,
    boundingBoxes: topBoxes,
    visualSummary: {
      healthyGreenPct: healthyPct,
      chloroticYellowPct: chloroticPct,
      necroticBrownPct: necroticPct,
    },
  };
}
