import {
  CropType,
  GrowthStage,
  RiskAssessment,
  RiskCategory,
  RiskFactor,
} from '../types/agroshield.ts';

export interface RiskInputContext {
  farmId: string;
  zoneId: string;
  farmName?: string;
  zoneName?: string;
  cropType: CropType;
  growthStage: GrowthStage;
  temperatureC: number;
  humidityPct: number;
  rainfallMm: number;
  soilMoisturePct: number;
  soilPh: number;
  recentConfirmedObservations: number;
  recentSuspectedObservations: number;
  neighbouringInfectedZones: number;
  isDemo?: boolean;
}

const TARGET_DISEASE_BY_CROP: Record<CropType, string> = {
  [CropType.TOMATO]: 'Early / Late Blight (Alternaria / Phytophthora)',
  [CropType.POTATO]: 'Late Blight (Phytophthora infestans)',
  [CropType.RICE]: 'Rice Blast (Magnaporthe oryzae)',
  [CropType.MAIZE]: 'Northern Corn Leaf Blight (Exserohilum turcicum)',
  [CropType.CHILLI]: 'Chilli Anthracnose & Leaf Curl Complex',
};

export function categorizeRiskScore(score: number): RiskCategory {
  if (score >= 75) return RiskCategory.CRITICAL;
  if (score >= 55) return RiskCategory.HIGH;
  if (score >= 30) return RiskCategory.MODERATE;
  return RiskCategory.LOW;
}

export function determineInspectionPriority(
  category: RiskCategory,
  confirmedCount: number
): RiskAssessment['inspectionPriority'] {
  if (category === RiskCategory.CRITICAL || confirmedCount > 0) {
    return 'Immediate (6h)';
  }
  if (category === RiskCategory.HIGH) {
    return 'Urgent (24h)';
  }
  if (category === RiskCategory.MODERATE) {
    return 'Elevated (72h)';
  }
  return 'Routine (7d)';
}

export function evaluateZoneDiseaseRisk(
  input: RiskInputContext,
  assessmentId: string
): RiskAssessment {
  const factors: RiskFactor[] = [];
  let score = 8; // Baseline agronomic background exposure

  // 1. Crop-specific Humidity & Temperature Matrix
  if (input.cropType === CropType.POTATO) {
    if (input.humidityPct >= 82 && input.temperatureC >= 12 && input.temperatureC <= 24) {
      const pts = 30;
      score += pts;
      factors.push({
        factor: 'Blight-Favorable Cool-Humid Window',
        observedValue: `${input.temperatureC.toFixed(1)}°C · ${input.humidityPct.toFixed(0)}% RH`,
        threshold: '12–24°C and RH ≥ 82%',
        contributionPoints: pts,
        rationale: 'Optimal microclimate for Phytophthora infestans sporangia germination.',
      });
    } else if (input.humidityPct >= 72) {
      const pts = 16;
      score += pts;
      factors.push({
        factor: 'Elevated Canopy Humidity',
        observedValue: `${input.humidityPct.toFixed(0)}% RH`,
        threshold: 'RH ≥ 72%',
        contributionPoints: pts,
        rationale: 'Sustained leaf moisture extends pathogen survival window.',
      });
    }
  } else if (input.cropType === CropType.TOMATO) {
    if (input.humidityPct >= 78 && input.temperatureC >= 18 && input.temperatureC <= 30) {
      const pts = 28;
      score += pts;
      factors.push({
        factor: 'Warm-Humid Fungal Sporulation Window',
        observedValue: `${input.temperatureC.toFixed(1)}°C · ${input.humidityPct.toFixed(0)}% RH`,
        threshold: '18–30°C and RH ≥ 78%',
        contributionPoints: pts,
        rationale: 'High relative humidity accelerates Alternaria and Phytophthora lesion expansion.',
      });
    } else if (input.humidityPct >= 68) {
      const pts = 14;
      score += pts;
      factors.push({
        factor: 'Moderate Canopy Humidity',
        observedValue: `${input.humidityPct.toFixed(0)}% RH`,
        threshold: 'RH ≥ 68%',
        contributionPoints: pts,
        rationale: 'Morning dew retention supports early foliar infection cycles.',
      });
    }
  } else if (input.cropType === CropType.RICE) {
    if (input.humidityPct >= 80 && input.temperatureC >= 21 && input.temperatureC <= 31) {
      const pts = 29;
      score += pts;
      factors.push({
        factor: 'Rice Blast Conidia Release Window',
        observedValue: `${input.temperatureC.toFixed(1)}°C · ${input.humidityPct.toFixed(0)}% RH`,
        threshold: '21–31°C and RH ≥ 80%',
        contributionPoints: pts,
        rationale: 'Prolonged paddy canopy humidity favors Magnaporthe oryzae spore attachment.',
      });
    } else if (input.humidityPct >= 70) {
      const pts = 15;
      score += pts;
      factors.push({
        factor: 'Paddy Microclimate Humidity',
        observedValue: `${input.humidityPct.toFixed(0)}% RH`,
        threshold: 'RH ≥ 70%',
        contributionPoints: pts,
        rationale: 'Moderate nighttime dew persistence across flooded or dense rows.',
      });
    }
  } else if (input.cropType === CropType.MAIZE) {
    if (input.humidityPct >= 75 && input.temperatureC >= 18 && input.temperatureC <= 28) {
      const pts = 25;
      score += pts;
      factors.push({
        factor: 'Turcicum Leaf Blight Thermal-Moisture Match',
        observedValue: `${input.temperatureC.toFixed(1)}°C · ${input.humidityPct.toFixed(0)}% RH`,
        threshold: '18–28°C and RH ≥ 75%',
        contributionPoints: pts,
        rationale: 'Moderate temperatures with high moisture support Exserohilum lesion spread.',
      });
    }
  } else if (input.cropType === CropType.CHILLI) {
    if (input.temperatureC >= 30 && input.soilMoisturePct < 34) {
      const pts = 26;
      score += pts;
      factors.push({
        factor: 'Heat & Moisture Stress Vector Pressure',
        observedValue: `${input.temperatureC.toFixed(1)}°C · ${input.soilMoisturePct.toFixed(0)}% Soil Moisture`,
        threshold: 'Temp ≥ 30°C and Soil Moisture < 34%',
        contributionPoints: pts,
        rationale: 'Dry heat increases thrips/whitefly activity driving Chilli Leaf Curl transmission.',
      });
    } else if (input.humidityPct >= 78) {
      const pts = 24;
      score += pts;
      factors.push({
        factor: 'Anthracnose Fruit Rot Moisture Trigger',
        observedValue: `${input.humidityPct.toFixed(0)}% RH`,
        threshold: 'RH ≥ 78%',
        contributionPoints: pts,
        rationale: 'High canopy humidity increases Colletotrichum splash dispersal risk.',
      });
    }
  }

  // 2. Rainfall & Splash Dispersal
  if (input.rainfallMm >= 12) {
    const pts = 18;
    score += pts;
    factors.push({
      factor: 'Heavy Rainfall Splash Dispersal',
      observedValue: `${input.rainfallMm.toFixed(1)} mm/24h`,
      threshold: '≥ 12 mm/24h',
      contributionPoints: pts,
      rationale: 'Rain splash transfers soil-borne spores onto lower foliage and washes protectants.',
    });
  } else if (input.rainfallMm >= 4) {
    const pts = 9;
    score += pts;
    factors.push({
      factor: 'Recent Precipitation Wetting',
      observedValue: `${input.rainfallMm.toFixed(1)} mm/24h`,
      threshold: '≥ 4 mm/24h',
      contributionPoints: pts,
      rationale: 'Increases free surface water duration on leaf blades.',
    });
  }

  // 3. Soil Moisture & pH Stress
  if (input.soilMoisturePct >= 74) {
    const pts = 12;
    score += pts;
    factors.push({
      factor: 'Root-Zone Saturation',
      observedValue: `${input.soilMoisturePct.toFixed(0)}% VWC`,
      threshold: '≥ 74% VWC',
      contributionPoints: pts,
      rationale: 'Excess root moisture weakens host defense and elevates root/collar rot susceptibility.',
    });
  } else if (input.soilMoisturePct <= 24) {
    const pts = 10;
    score += pts;
    factors.push({
      factor: 'Moisture Deficit Stress',
      observedValue: `${input.soilMoisturePct.toFixed(0)}% VWC`,
      threshold: '≤ 24% VWC',
      contributionPoints: pts,
      rationale: 'Drought stress impairs stomatal regulation and increases pest vector vulnerability.',
    });
  }

  if (input.soilPh < 5.5 || input.soilPh > 7.8) {
    const pts = 7;
    score += pts;
    factors.push({
      factor: 'Suboptimal Soil pH',
      observedValue: `pH ${input.soilPh.toFixed(1)}`,
      threshold: 'Optimal 5.8–7.4',
      contributionPoints: pts,
      rationale: 'Nutrient lock-up outside neutral pH reduces systemic plant resilience.',
    });
  }

  // 4. Growth Stage Susceptibility
  if (
    input.growthStage === GrowthStage.FLOWERING ||
    input.growthStage === GrowthStage.FRUITING
  ) {
    const pts = 10;
    score += pts;
    factors.push({
      factor: 'Sensitive Reproductive Canopy Stage',
      observedValue: input.growthStage,
      threshold: 'Flowering / Fruiting density peak',
      contributionPoints: pts,
      rationale: 'Dense canopy traps humidity and lowers airflow across lower leaves.',
    });
  }

  // 5. Historical & Neighbouring Inoculum Pressure
  if (input.recentConfirmedObservations > 0) {
    const pts = Math.min(24, input.recentConfirmedObservations * 14);
    score += pts;
    factors.push({
      factor: 'Confirmed Active Inoculum in Zone',
      observedValue: `${input.recentConfirmedObservations} confirmed log(s)`,
      threshold: '0 active logs',
      contributionPoints: pts,
      rationale: 'Confirmed pathogen presence within this zone creates immediate secondary spread risk.',
    });
  } else if (input.recentSuspectedObservations > 0) {
    const pts = 12;
    score += pts;
    factors.push({
      factor: 'Unverified Suspected Symptoms',
      observedValue: `${input.recentSuspectedObservations} suspected log(s)`,
      threshold: '0 suspected logs',
      contributionPoints: pts,
      rationale: 'Pending expert confirmation of reported foliar anomalies.',
    });
  }

  if (input.neighbouringInfectedZones > 0) {
    const pts = Math.min(14, input.neighbouringInfectedZones * 8);
    score += pts;
    factors.push({
      factor: 'Adjacent Zone Outbreak Proximity',
      observedValue: `${input.neighbouringInfectedZones} infected neighbour(s)`,
      threshold: '0 adjacent infected zones',
      contributionPoints: pts,
      rationale: 'Wind-borne or vector spread risk from adjacent plots; zone requires preventive scouting.',
    });
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const category = categorizeRiskScore(clampedScore);
  const priority = determineInspectionPriority(category, input.recentConfirmedObservations);

  const recommendedActions: string[] = [];
  if (input.recentConfirmedObservations > 0) {
    recommendedActions.push('Isolate symptomatic plants and verify treatment schedule with Agronomist.');
  } else {
    recommendedActions.push('Conduct targeted lower-canopy visual scouting across 15 random plants.');
  }
  if (input.humidityPct >= 78 || input.rainfallMm >= 8) {
    recommendedActions.push('Avoid overhead irrigation; improve drainage and furrow ventilation.');
  }
  if (category === RiskCategory.HIGH || category === RiskCategory.CRITICAL) {
    recommendedActions.push('Capture high-resolution leaf images in Disease Scanner for severity baseline.');
    recommendedActions.push('Review Smart Advisory preventive bio-fungicide or protectant schedule.');
  } else {
    recommendedActions.push('Maintain routine weekly monitoring and verify IoT sensor calibration.');
  }

  return {
    id: assessmentId,
    farmId: input.farmId,
    zoneId: input.zoneId,
    farmName: input.farmName,
    zoneName: input.zoneName,
    cropType: input.cropType,
    targetDisease: TARGET_DISEASE_BY_CROP[input.cropType],
    riskScore: clampedScore,
    riskCategory: category,
    environmentalVsConfirmed:
      input.recentConfirmedObservations > 0
        ? 'confirmed_disease_present'
        : 'environmental_risk',
    contributingFactors: factors,
    inspectionPriority: priority,
    recommendedActions,
    engineVersion: 'AgroShield-RuleEngine-v1.0 (Explainable Multimodal)',
    assessedAt: new Date().toISOString(),
    isDemo: input.isDemo ?? true,
  };
}
