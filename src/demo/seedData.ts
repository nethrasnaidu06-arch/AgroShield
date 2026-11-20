import {
  AdvisoryArticle,
  AlertCategory,
  AlertItem,
  AlertSeverity,
  CropType,
  DiseaseObservation,
  DiseaseScanRecord,
  ExpertReviewHistoryEntry,
  Farm,
  FarmZone,
  GrowthStage,
  IoTSensor,
  RiskAssessment,
  SensorReading,
  SensorThreshold,
  SeverityAnalysisRecord,
  SeverityClass,
  SoilRecord,
  TreatmentRecord,
  UserAccount,
  UserRole,
  WeatherRecord,
  ZoneHealthStatus,
} from '../types/agroshield.ts';
import { evaluateZoneDiseaseRisk } from '../business/riskEngine.ts';

// Deterministic PRNG so synthetic Karnataka demo data is stable and reproducible
function createRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const KARNATAKA_DISTRICTS: Array<{
  district: string;
  taluk: string;
  lat: number;
  lng: number;
  soil: string;
  irrigation: string;
  primaryCrop: CropType;
}> = [
  { district: 'Mandya', taluk: 'Maddur', lat: 12.584, lng: 77.044, soil: 'Red Sandy Loam', irrigation: 'Canal + Drip', primaryCrop: CropType.RICE },
  { district: 'Hassan', taluk: 'Belur', lat: 13.162, lng: 75.865, soil: 'Red Clay Loam', irrigation: 'Sprinkler', primaryCrop: CropType.POTATO },
  { district: 'Kolar', taluk: 'Malur', lat: 13.004, lng: 77.939, soil: 'Red Loamy', irrigation: 'Drip Irrigation', primaryCrop: CropType.TOMATO },
  { district: 'Chikkaballapur', taluk: 'Sidlaghatta', lat: 13.391, lng: 77.864, soil: 'Sandy Clay Loam', irrigation: 'Drip Irrigation', primaryCrop: CropType.TOMATO },
  { district: 'Belagavi', taluk: 'Gokak', lat: 16.169, lng: 74.823, soil: 'Deep Black Cotton', irrigation: 'Furrow + Drip', primaryCrop: CropType.MAIZE },
  { district: 'Haveri', taluk: 'Byadgi', lat: 14.677, lng: 75.489, soil: 'Medium Black Soil', irrigation: 'Rainfed + Drip', primaryCrop: CropType.CHILLI },
  { district: 'Mysuru', taluk: 'Nanjangud', lat: 12.119, lng: 76.682, soil: 'Alluvial Loam', irrigation: 'Canal Fed', primaryCrop: CropType.RICE },
  { district: 'Davanagere', taluk: 'Harihar', lat: 14.513, lng: 75.806, soil: 'Black Clay', irrigation: 'Borewell + Canal', primaryCrop: CropType.MAIZE },
  { district: 'Shivamogga', taluk: 'Bhadravathi', lat: 13.848, lng: 75.702, soil: 'Lateritic Loam', irrigation: 'Canal Fed', primaryCrop: CropType.RICE },
  { district: 'Tumakuru', taluk: 'Sira', lat: 13.741, lng: 76.905, soil: 'Red Gravelly Loam', irrigation: 'Drip Irrigation', primaryCrop: CropType.CHILLI },
  { district: 'Ballari', taluk: 'Siruguppa', lat: 15.636, lng: 76.898, soil: 'Deep Black Soil', irrigation: 'Canal Fed', primaryCrop: CropType.CHILLI },
  { district: 'Dharwad', taluk: 'Kalghatgi', lat: 15.184, lng: 74.971, soil: 'Red & Black Mixed', irrigation: 'Rainfed + Sprinkler', primaryCrop: CropType.POTATO },
  { district: 'Chitradurga', taluk: 'Hiriyur', lat: 13.944, lng: 76.617, soil: 'Red Sandy Soil', irrigation: 'Drip Irrigation', primaryCrop: CropType.MAIZE },
  { district: 'Ramanagara', taluk: 'Kanakapura', lat: 12.546, lng: 77.419, soil: 'Red Loamy', irrigation: 'Drip Irrigation', primaryCrop: CropType.TOMATO },
  { district: 'Koppal', taluk: 'Gangavathi', lat: 15.432, lng: 76.529, soil: 'Medium Black Clay', irrigation: 'Canal Fed', primaryCrop: CropType.RICE },
  { district: 'Raichur', taluk: 'Sindhanur', lat: 15.771, lng: 76.756, soil: 'Deep Black Clay', irrigation: 'Tungabhadra Canal', primaryCrop: CropType.RICE },
  { district: 'Gadag', taluk: 'Mundargi', lat: 15.207, lng: 75.884, soil: 'Black Cotton Soil', irrigation: 'Rainfed + Drip', primaryCrop: CropType.CHILLI },
  { district: 'Bagalkot', taluk: 'Jamkhandi', lat: 16.504, lng: 75.291, soil: 'Calcareous Black', irrigation: 'Lift Irrigation', primaryCrop: CropType.MAIZE },
  { district: 'Vijayanagara', taluk: 'Hospet', lat: 15.268, lng: 76.391, soil: 'Red & Black Loam', irrigation: 'Canal + Drip', primaryCrop: CropType.CHILLI },
  { district: 'Bidar', taluk: 'Humnabad', lat: 17.771, lng: 77.129, soil: 'Lateritic Clay Loam', irrigation: 'Sprinkler', primaryCrop: CropType.POTATO },
];

const CROP_CATALOG: Record<
  CropType,
  {
    varieties: string[];
    diseases: Array<{ name: string; pathogen: string }>;
  }
> = {
  [CropType.TOMATO]: {
    varieties: ['Arka Rakshak', 'Arka Vikas', 'Pusa Ruby'],
    diseases: [
      { name: 'Early Blight', pathogen: 'Alternaria solani' },
      { name: 'Late Blight', pathogen: 'Phytophthora infestans' },
      { name: 'Bacterial Leaf Spot', pathogen: 'Xanthomonas campestris' },
    ],
  },
  [CropType.POTATO]: {
    varieties: ['Kufri Jyoti', 'Kufri Pukhraj', 'Kufri Chandramukhi'],
    diseases: [
      { name: 'Late Blight', pathogen: 'Phytophthora infestans' },
      { name: 'Early Blight', pathogen: 'Alternaria solani' },
    ],
  },
  [CropType.RICE]: {
    varieties: ['Sona Masoori', 'Jaya', 'IR-64'],
    diseases: [
      { name: 'Rice Blast', pathogen: 'Magnaporthe oryzae' },
      { name: 'Brown Spot', pathogen: 'Bipolaris oryzae' },
      { name: 'Bacterial Leaf Blight', pathogen: 'Xanthomonas oryzae' },
    ],
  },
  [CropType.MAIZE]: {
    varieties: ['NAH-1137', 'NK-6240', 'Deccan-103'],
    diseases: [
      { name: 'Northern Corn Leaf Blight', pathogen: 'Exserohilum turcicum' },
      { name: 'Common Rust', pathogen: 'Puccinia sorghi' },
    ],
  },
  [CropType.CHILLI]: {
    varieties: ['Byadgi Dabbi', 'Byadgi Kaddi', 'Guntur Sannam'],
    diseases: [
      { name: 'Chilli Leaf Curl', pathogen: 'Begomovirus (Whitefly vector)' },
      { name: 'Anthracnose / Dieback', pathogen: 'Colletotrichum capsici' },
    ],
  },
};

const GROWTH_STAGES = [
  GrowthStage.SEEDLING,
  GrowthStage.VEGETATIVE,
  GrowthStage.FLOWERING,
  GrowthStage.FRUITING,
  GrowthStage.MATURITY,
];

function makeBoxPolygon(lat: number, lng: number, dLat: number, dLng: number): string {
  const coords = [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [coords],
  });
}

function daysAgoIso(days: number, hoursOffset = 0): string {
  const d = new Date('2026-11-20T09:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(d.getUTCHours() - hoursOffset);
  return d.toISOString();
}

export interface GeneratedDemoDataset {
  users: UserAccount[];
  farms: Farm[];
  zones: FarmZone[];
  observations: DiseaseObservation[];
  scans: DiseaseScanRecord[];
  severityAnalyses: SeverityAnalysisRecord[];
  weatherRecords: WeatherRecord[];
  soilRecords: SoilRecord[];
  sensors: IoTSensor[];
  sensorReadings: SensorReading[];
  sensorThresholds: SensorThreshold[];
  riskAssessments: RiskAssessment[];
  alerts: AlertItem[];
  treatments: TreatmentRecord[];
  advisoryArticles: AdvisoryArticle[];
  expertReviewHistory: ExpertReviewHistoryEntry[];
  outbreakInvestigations: Array<{
    clusterId: string;
    district: string;
    cropType: string;
    dominantDisease: string;
    investigationStatus: 'monitoring' | 'under_investigation' | 'confirmed' | 'contained';
    expertNotes: string;
    updatedBy: string;
    updatedAt: string;
  }>;
}

export function generateKarnatakaDemoDataset(): GeneratedDemoDataset {
  const rng = createRng(20261120);

  const users: UserAccount[] = [
    {
      id: 'usr-farmer-01',
      fullName: 'Demo Farmer Account (Mandya Cluster)',
      email: 'demo.farmer@agroshield.local',
      role: UserRole.FARMER,
      district: 'Mandya',
      organization: 'Demo Grower Cooperative',
      active: true,
      isDemo: true,
      createdAt: daysAgoIso(90),
    },
    {
      id: 'usr-expert-01',
      fullName: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      email: 'demo.expert@agroshield.local',
      role: UserRole.EXPERT,
      district: 'Bengaluru / Statewide',
      organization: 'Demo Crop Pathology Advisory Panel',
      active: true,
      isDemo: true,
      createdAt: daysAgoIso(120),
    },
    {
      id: 'usr-admin-01',
      fullName: 'Platform Operations Admin (Demo)',
      email: 'demo.admin@agroshield.local',
      role: UserRole.ADMIN,
      district: 'Karnataka State Grid',
      organization: 'AgroShield Platform Operations',
      active: true,
      isDemo: true,
      createdAt: daysAgoIso(150),
    },
  ];

  const farms: Farm[] = [];
  const zones: FarmZone[] = [];
  const observations: DiseaseObservation[] = [];
  const weatherRecords: WeatherRecord[] = [];
  const soilRecords: SoilRecord[] = [];
  const sensors: IoTSensor[] = [];
  const sensorReadings: SensorReading[] = [];
  const sensorThresholds: SensorThreshold[] = [];
  const riskAssessments: RiskAssessment[] = [];
  const alerts: AlertItem[] = [];
  const treatments: TreatmentRecord[] = [];

  const cropTypesList = Object.values(CropType);

  // 1. Create 20 Karnataka Demo Farms & 72 Zones (3-4 per farm)
  KARNATAKA_DISTRICTS.forEach((loc, idx) => {
    const farmId = `farm-ka-${String(idx + 1).padStart(2, '0')}`;
    const areaHectares = Number((4.5 + rng() * 11.5).toFixed(2));
    farms.push({
      id: farmId,
      name: `Demo Farm ${String(idx + 1).padStart(2, '0')} — ${loc.district} (${loc.taluk})`,
      ownerLabel: `Synthetic Plot Unit KA-${String(idx + 1).padStart(2, '0')} (Demo)`,
      district: loc.district,
      taluk: loc.taluk,
      latitude: loc.lat,
      longitude: loc.lng,
      areaHectares,
      soilType: loc.soil,
      irrigationType: loc.irrigation,
      boundaryGeoJson: makeBoxPolygon(loc.lat, loc.lng, 0.0045, 0.0052),
      isDemo: true,
      createdAt: daysAgoIso(110 - idx),
      updatedAt: daysAgoIso(2),
    });

    // 16 daily weather records per farm = 320 weather records total
    for (let day = 15; day >= 0; day--) {
      const baseTemp =
        loc.district === 'Hassan' || loc.district === 'Dharwad'
          ? 21.5
          : loc.district === 'Raichur' || loc.district === 'Ballari'
          ? 29.5
          : 25.2;
      const tempC = Number((baseTemp + (rng() - 0.45) * 6.5).toFixed(1));
      const humidityPct = Number(
        Math.min(96, Math.max(42, 68 + (idx % 3 === 0 ? 14 : 0) + (rng() - 0.4) * 24)).toFixed(1)
      );
      const rainfallMm =
        rng() > 0.62 ? Number((2 + rng() * 24).toFixed(1)) : Number((rng() * 1.4).toFixed(1));
      const windSpeedKmh = Number((5 + rng() * 16).toFixed(1));
      const conditionLabel =
        rainfallMm > 10
          ? 'Heavy Rain Showers'
          : rainfallMm > 2
          ? 'Light Rain'
          : humidityPct > 80
          ? 'Humid Overcast'
          : 'Partly Cloudy';

      weatherRecords.push({
        id: `wx-${farmId}-d${day}`,
        farmId,
        district: loc.district,
        temperatureC: tempC,
        humidityPct,
        rainfallMm,
        windSpeedKmh,
        conditionLabel,
        source: 'demo_synthetic',
        recordedAt: daysAgoIso(day, 3),
        isDemo: true,
      });
    }

    // 3 or 4 zones per farm -> 72 total zones (12 farms * 4 + 8 farms * 3 = 72)
    const zoneCount = idx < 12 ? 4 : 3;
    const offsets = [
      [-0.002, -0.0024],
      [-0.002, 0.0024],
      [0.002, -0.0024],
      [0.002, 0.0024],
    ];

    for (let z = 0; z < zoneCount; z++) {
      const zoneId = `zone-${farmId}-${z + 1}`;
      const cropType =
        z === 0 ? loc.primaryCrop : cropTypesList[(idx + z) % cropTypesList.length];
      const cropMeta = CROP_CATALOG[cropType];
      const variety = cropMeta.varieties[(idx + z) % cropMeta.varieties.length];
      const growthStage = GROWTH_STAGES[(idx + z) % GROWTH_STAGES.length];
      const zLat = Number((loc.lat + offsets[z][0]).toFixed(6));
      const zLng = Number((loc.lng + offsets[z][1]).toFixed(6));
      const plantingDaysAgo = 25 + ((idx * 7 + z * 11) % 65);

      // Assign realistic health distribution across 72 zones
      const roll = rng();
      let healthStatus = ZoneHealthStatus.HEALTHY;
      if (roll > 0.85) healthStatus = ZoneHealthStatus.INFECTED;
      else if (roll > 0.72) healthStatus = ZoneHealthStatus.SUSPECTED;
      else if (roll > 0.56) healthStatus = ZoneHealthStatus.AT_RISK;
      else if (roll < 0.06) healthStatus = ZoneHealthStatus.INSUFFICIENT_DATA;

      zones.push({
        id: zoneId,
        farmId,
        farmName: `Demo Farm ${String(idx + 1).padStart(2, '0')} — ${loc.district}`,
        district: loc.district,
        zoneCode: `Z${z + 1}`,
        name: `Zone ${String.fromCharCode(65 + z)} (${cropType})`,
        cropType,
        variety,
        plantingDate: daysAgoIso(plantingDaysAgo).slice(0, 10),
        growthStage,
        areaHectares: Number((areaHectares / zoneCount).toFixed(2)),
        latitude: zLat,
        longitude: zLng,
        polygonGeoJson: makeBoxPolygon(zLat, zLng, 0.0018, 0.0021),
        healthStatus,
        riskScore: 20,
        riskCategory: evaluateZoneDiseaseRisk(
          {
            farmId,
            zoneId,
            cropType,
            growthStage,
            temperatureC: 25,
            humidityPct: 70,
            rainfallMm: 2,
            soilMoisturePct: 50,
            soilPh: 6.5,
            recentConfirmedObservations: 0,
            recentSuspectedObservations: 0,
            neighbouringInfectedZones: 0,
          },
          'tmp'
        ).riskCategory,
        lastInspectedAt:
          healthStatus === ZoneHealthStatus.INSUFFICIENT_DATA ? null : daysAgoIso(1 + (z % 6)),
        isDemo: true,
      });

      // 5 soil records per zone = 360 soil records (exceeds 300+)
      for (let sDay = 4; sDay >= 0; sDay--) {
        const moisture = Number(
          Math.min(88, Math.max(18, 48 + (healthStatus === ZoneHealthStatus.INFECTED ? 18 : 0) + (rng() - 0.5) * 32)).toFixed(1)
        );
        const sTemp = Number((21 + rng() * 9).toFixed(1));
        const pH = Number((5.7 + rng() * 1.9).toFixed(2));
        soilRecords.push({
          id: `soil-${zoneId}-d${sDay}`,
          farmId,
          zoneId,
          soilMoisturePct: moisture,
          soilTempC: sTemp,
          soilPh: pH,
          nitrogenPpm: Number((35 + rng() * 45).toFixed(0)),
          phosphorusPpm: Number((18 + rng() * 26).toFixed(0)),
          potassiumPpm: Number((120 + rng() * 90).toFixed(0)),
          recordedAt: daysAgoIso(sDay * 3),
          isDemo: true,
        });
      }

      // Disease Observations: 1-2 per zone -> ~122 observations (exceeds 100+)
      const obsCount = healthStatus === ZoneHealthStatus.INFECTED ? 2 : z % 2 === 0 ? 2 : 1;
      for (let o = 0; o < obsCount; o++) {
        const diseaseChoice = cropMeta.diseases[(idx + z + o) % cropMeta.diseases.length];
        const isHealthyObs =
          healthStatus === ZoneHealthStatus.HEALTHY ||
          (healthStatus === ZoneHealthStatus.AT_RISK && o === 0);
        const obsStatus: DiseaseObservation['observationStatus'] = isHealthyObs
          ? 'healthy'
          : healthStatus === ZoneHealthStatus.INFECTED
          ? o === 0
            ? 'confirmed'
            : 'suspected'
          : 'suspected';
        const severity = isHealthyObs
          ? SeverityClass.HEALTHY
          : healthStatus === ZoneHealthStatus.INFECTED
          ? o === 0
            ? rng() > 0.4
              ? SeverityClass.MODERATE
              : SeverityClass.SEVERE
            : SeverityClass.MILD
          : SeverityClass.MILD;
        const areaPct =
          severity === SeverityClass.HEALTHY
            ? 0
            : severity === SeverityClass.MILD
            ? Number((3 + rng() * 10).toFixed(1))
            : severity === SeverityClass.MODERATE
            ? Number((16 + rng() * 18).toFixed(1))
            : Number((36 + rng() * 24).toFixed(1));

        const reviewRoll = rng();
        const expertStatus: DiseaseObservation['expertReviewStatus'] =
          obsStatus === 'healthy'
            ? 'approved'
            : reviewRoll > 0.62
            ? 'pending'
            : reviewRoll > 0.25
            ? 'approved'
            : 'corrected';

        const sampleImageMap: Record<CropType, string> = {
          [CropType.TOMATO]: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
          [CropType.POTATO]: '/src/assets/images/potato_late_blight_sample_1795172709923.jpg',
          [CropType.RICE]: '/src/assets/images/rice_blast_sample_1795172710079.jpg',
          [CropType.CHILLI]: '/src/assets/images/chilli_leaf_curl_sample_1795172711138.jpg',
          [CropType.MAIZE]: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
        };

        const obsId = `obs-${zoneId}-${o + 1}`;
        observations.push({
          id: obsId,
          farmId,
          zoneId,
          cropType,
          diseaseName: isHealthyObs ? `${cropType} Healthy Canopy` : diseaseChoice.name,
          pathogen: isHealthyObs ? 'None detected' : diseaseChoice.pathogen,
          observationStatus: obsStatus,
          severityClass: severity,
          affectedAreaPct: areaPct,
          confidenceScore: isHealthyObs ? 0.94 : Number((0.74 + rng() * 0.2).toFixed(2)),
          sourceMode: 'demo_dataset',
          expertReviewStatus: expertStatus,
          expertNotes:
            expertStatus === 'approved'
              ? 'Synthetic demo observation verified against foliar symptom profile.'
              : expertStatus === 'corrected'
              ? 'Adjusted severity grade after reviewing lower-canopy leaf lesion ratio.'
              : null,
          reviewedBy: expertStatus === 'pending' ? null : 'Dr. Kavitha Rao (Demo Pathologist)',
          imageUrl: isHealthyObs ? null : sampleImageMap[cropType],
          notes: isHealthyObs
            ? `Routine demo inspection completed on ${cropType} (${variety}) — canopy uniform.`
            : `Demo field scouting noted foliar lesions consistent with ${diseaseChoice.name} in ${growthStage} stage.`,
          observedAt: daysAgoIso(o * 7 + (idx % 5), z),
          isDemo: true,
        });

        if (!isHealthyObs && o === 0) {
          const outcomeRoll = idx % 3;
          treatments.push({
            id: `trt-${obsId}`,
            farmId,
            zoneId,
            observationId: obsId,
            actionType:
              severity === SeverityClass.SEVERE ? 'fungicide_application' : 'bio_control',
            productOrMethod:
              cropType === CropType.CHILLI
                ? 'Yellow/Blue Sticky Traps + Horticultural Neem Formulation'
                : 'Trichoderma viride Bio-Protectant & Lower-Leaf Sanitation Pruning',
            dosage: 'Follow regional extension label / agronomist prescription',
            appliedBy: 'Demo Farm Crew',
            outcomeStatus:
              outcomeRoll === 0 ? 'improving' : outcomeRoll === 1 ? 'pending_evaluation' : 'no_change',
            outcomeNotes:
              outcomeRoll === 0
                ? 'Demo follow-up indicated halted necrotic margin expansion after canopy pruning.'
                : 'Logged in demo treatment history; follow-up scan scheduled.',
            expertVerified: expertStatus === 'approved' || expertStatus === 'corrected',
            appliedAt: daysAgoIso(2 + (idx % 4)),
            isDemo: true,
          });
        }
      }
    }

    // Sensor thresholds per farm
    sensorThresholds.push({
      id: `thr-${farmId}`,
      farmId,
      cropType: loc.primaryCrop,
      minSoilMoisture: 28,
      maxSoilMoisture: 75,
      maxHumidity: 82,
      minSoilPh: 5.8,
      maxSoilPh: 7.4,
      maxAirTemp: 34,
      updatedAt: daysAgoIso(10),
    });

    // 28 IoT ESP32 sensors across 20 farms (first 8 farms get 2 sensors, remaining 12 get 1)
    const farmZones = zones.filter((zz) => zz.farmId === farmId);
    const sensorCountForFarm = idx < 8 ? 2 : 1;
    for (let s = 0; s < sensorCountForFarm; s++) {
      const targetZone = farmZones[s % farmZones.length];
      const sensorId = `iot-${farmId}-s${s + 1}`;
      const deviceUid = `ESP32-AGRO-${String(idx + 1).padStart(2, '0')}${s + 1}`;
      const isOffline = idx % 9 === 4 && s === 0;
      const isDegraded = !isOffline && idx % 7 === 3;
      sensors.push({
        id: sensorId,
        deviceUid,
        name: `${loc.district} ${targetZone.zoneCode} Soil & Microclimate Node`,
        farmId,
        zoneId: targetZone.id,
        hardwareModel: 'ESP32-S3 + RS485 Soil NPK/pH + SHT31',
        firmwareVersion: 'v1.4.2-demo',
        status: isOffline ? 'offline' : isDegraded ? 'degraded' : 'online',
        batteryPct: isOffline ? 12 : Math.round(52 + rng() * 46),
        signalRssi: isOffline ? -115 : Math.round(-62 - rng() * 28),
        lastSeenAt: isOffline ? daysAgoIso(2) : daysAgoIso(0, s),
        isDemo: true,
      });

      // 20 readings per sensor = 560 sensor readings total (exceeds 500+)
      const latestWx = weatherRecords.find((w) => w.farmId === farmId)!;
      for (let r = 19; r >= 0; r--) {
        sensorReadings.push({
          id: `sr-${sensorId}-${r}`,
          sensorId,
          deviceUid,
          farmId,
          zoneId: targetZone.id,
          soilMoisturePct: Number(
            Math.min(86, Math.max(19, 52 + (idx % 4 === 0 ? 18 : 0) + (rng() - 0.5) * 26)).toFixed(1)
          ),
          soilTempC: Number((latestWx.temperatureC - 2.4 + (rng() - 0.5) * 2).toFixed(1)),
          airTempC: Number((latestWx.temperatureC + (rng() - 0.5) * 1.8).toFixed(1)),
          humidityPct: Number(
            Math.min(95, Math.max(40, latestWx.humidityPct + (rng() - 0.5) * 10)).toFixed(1)
          ),
          soilPh: Number((6.2 + (rng() - 0.5) * 1.4).toFixed(2)),
          recordedAt: daysAgoIso(Math.floor(r / 4), (r % 4) * 6),
          isDemo: true,
        });
      }
    }
  });

  // Compute Multimodal Risk Scores across all 72 zones & update zone riskScore/riskCategory
  zones.forEach((zone, zIdx) => {
    const latestWx = weatherRecords.find((w) => w.farmId === zone.farmId)!;
    const latestSoil = soilRecords.find((s) => s.zoneId === zone.id)!;
    const zoneObs = observations.filter((o) => o.zoneId === zone.id);
    const confirmedCount = zoneObs.filter((o) => o.observationStatus === 'confirmed').length;
    const suspectedCount = zoneObs.filter((o) => o.observationStatus === 'suspected').length;
    const neighbourInfected = zones.filter(
      (other) =>
        other.farmId === zone.farmId &&
        other.id !== zone.id &&
        other.healthStatus === ZoneHealthStatus.INFECTED
    ).length;

    const assessment = evaluateZoneDiseaseRisk(
      {
        farmId: zone.farmId,
        zoneId: zone.id,
        farmName: zone.farmName,
        zoneName: zone.name,
        cropType: zone.cropType,
        growthStage: zone.growthStage,
        temperatureC: latestWx.temperatureC,
        humidityPct: latestWx.humidityPct,
        rainfallMm: latestWx.rainfallMm,
        soilMoisturePct: latestSoil.soilMoisturePct,
        soilPh: latestSoil.soilPh,
        recentConfirmedObservations: confirmedCount,
        recentSuspectedObservations: suspectedCount,
        neighbouringInfectedZones: neighbourInfected,
        isDemo: true,
      },
      `risk-${zone.id}`
    );
    zone.riskScore = assessment.riskScore;
    zone.riskCategory = assessment.riskCategory;
    riskAssessments.push(assessment);

    // Create 38+ realistic alerts across disease, environmental, sensor, inspection
    if (zone.healthStatus === ZoneHealthStatus.INFECTED) {
      alerts.push({
        id: `al-dis-${zone.id}`,
        farmId: zone.farmId,
        zoneId: zone.id,
        category: AlertCategory.DISEASE,
        severity: AlertSeverity.CRITICAL,
        title: `Confirmed ${zone.cropType} Disease in ${zone.zoneCode}`,
        message: `Demo Zone ${zone.name} has confirmed foliar infection. Isolate affected rows and schedule follow-up severity scan.`,
        acknowledged: zIdx % 4 === 0,
        resolvedAt: null,
        createdAt: daysAgoIso(1, zIdx % 5),
        isDemo: true,
      });
    } else if (assessment.riskScore >= 62 && alerts.length < 32) {
      alerts.push({
        id: `al-env-${zone.id}`,
        farmId: zone.farmId,
        zoneId: zone.id,
        category: AlertCategory.ENVIRONMENTAL,
        severity: AlertSeverity.HIGH,
        title: `Elevated Disease Risk (${assessment.riskScore}/100) — ${zone.cropType}`,
        message: `Environmental conditions (${latestWx.humidityPct}% RH, ${latestWx.temperatureC}°C) favor ${assessment.targetDisease}. Preventive scouting advised.`,
        acknowledged: zIdx % 3 === 0,
        resolvedAt: null,
        createdAt: daysAgoIso(0, zIdx % 12),
        isDemo: true,
      });
    }
  });

  // Add sensor offline & inspection alerts to guarantee 36+ rich alerts
  sensors.forEach((sensor, idx) => {
    if (sensor.status === 'offline' || sensor.status === 'degraded') {
      alerts.push({
        id: `al-sen-${sensor.id}`,
        farmId: sensor.farmId,
        zoneId: sensor.zoneId,
        category: AlertCategory.SENSOR,
        severity: sensor.status === 'offline' ? AlertSeverity.HIGH : AlertSeverity.WARNING,
        title: `ESP32 Node ${sensor.deviceUid} ${sensor.status === 'offline' ? 'Offline' : 'Low Signal'}`,
        message: `${sensor.name} reported ${sensor.batteryPct}% battery and RSSI ${sensor.signalRssi} dBm.`,
        acknowledged: false,
        resolvedAt: null,
        createdAt: daysAgoIso(1, idx),
        isDemo: true,
      });
    }
  });

  zones
    .filter((z) => z.healthStatus === ZoneHealthStatus.INSUFFICIENT_DATA || z.healthStatus === ZoneHealthStatus.SUSPECTED)
    .slice(0, 10)
    .forEach((z, idx) => {
      alerts.push({
        id: `al-insp-${z.id}`,
        farmId: z.farmId,
        zoneId: z.id,
        category: AlertCategory.INSPECTION,
        severity: AlertSeverity.INFO,
        title: `Field Inspection Due — ${z.name}`,
        message: `Zone requires updated leaf photography and visual confirmation to update Digital Twin health state.`,
        acknowledged: idx % 2 === 0,
        resolvedAt: null,
        createdAt: daysAgoIso(2, idx),
        isDemo: true,
      });
    });

  // Seed initial Disease Scans & Severity Analyses using the generated Karnataka leaf specimens
  const scans: DiseaseScanRecord[] = [
    {
      id: 'scan-demo-01',
      farmId: 'farm-ka-03',
      zoneId: 'zone-farm-ka-03-1',
      cropType: CropType.TOMATO,
      imageUrl: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
      gradCamOverlayUrl: null,
      predictedDisease: 'Tomato Early Blight (Alternaria solani)',
      isHealthy: false,
      confidenceScore: 0.87,
      alternativePredictions: [
        { diseaseName: 'Tomato Target Spot', confidence: 0.09 },
        { diseaseName: 'Tomato Healthy', confidence: 0.04 },
      ],
      qualityMetrics: {
        width: 1200,
        height: 900,
        brightness: 128,
        sharpnessScore: 84,
        greenFoliageRatio: 0.64,
        passed: true,
        warnings: [],
      },
      inferenceMode: 'demo_visual_sandbox',
      modelVersion: 'PlantVillage-ResNet50-Architecture-Placeholder (Demo Mode)',
      datasetReference: 'PlantVillage / PlantDoc Demo Reference',
      createdAt: daysAgoIso(3),
      isDemo: true,
    },
    {
      id: 'scan-demo-02',
      farmId: 'farm-ka-02',
      zoneId: 'zone-farm-ka-02-1',
      cropType: CropType.POTATO,
      imageUrl: '/src/assets/images/potato_late_blight_sample_1795172709923.jpg',
      gradCamOverlayUrl: null,
      predictedDisease: 'Potato Late Blight (Phytophthora infestans)',
      isHealthy: false,
      confidenceScore: 0.89,
      alternativePredictions: [
        { diseaseName: 'Potato Early Blight', confidence: 0.08 },
        { diseaseName: 'Potato Healthy', confidence: 0.03 },
      ],
      qualityMetrics: {
        width: 1200,
        height: 900,
        brightness: 132,
        sharpnessScore: 88,
        greenFoliageRatio: 0.59,
        passed: true,
        warnings: [],
      },
      inferenceMode: 'demo_visual_sandbox',
      modelVersion: 'PlantVillage-ResNet50-Architecture-Placeholder (Demo Mode)',
      datasetReference: 'PlantVillage / PlantDoc Demo Reference',
      createdAt: daysAgoIso(2),
      isDemo: true,
    },
    {
      id: 'scan-demo-03',
      farmId: 'farm-ka-01',
      zoneId: 'zone-farm-ka-01-1',
      cropType: CropType.RICE,
      imageUrl: '/src/assets/images/rice_blast_sample_1795172710079.jpg',
      gradCamOverlayUrl: null,
      predictedDisease: 'Rice Leaf Blast (Magnaporthe oryzae)',
      isHealthy: false,
      confidenceScore: 0.84,
      alternativePredictions: [
        { diseaseName: 'Rice Brown Spot', confidence: 0.11 },
        { diseaseName: 'Rice Healthy', confidence: 0.05 },
      ],
      qualityMetrics: {
        width: 1200,
        height: 900,
        brightness: 135,
        sharpnessScore: 81,
        greenFoliageRatio: 0.68,
        passed: true,
        warnings: [],
      },
      inferenceMode: 'demo_visual_sandbox',
      modelVersion: 'PlantVillage-ResNet50-Architecture-Placeholder (Demo Mode)',
      datasetReference: 'PlantDoc Rice Pathology Reference',
      createdAt: daysAgoIso(1),
      isDemo: true,
    },
  ];

  const severityAnalyses: SeverityAnalysisRecord[] = [
    {
      id: 'sev-demo-01',
      scanId: 'scan-demo-01',
      observationId: null,
      farmId: 'farm-ka-03',
      zoneId: 'zone-farm-ka-03-1',
      cropType: CropType.TOMATO,
      diseaseName: 'Tomato Early Blight (Alternaria solani)',
      classificationConfidence: 0.87,
      affectedAreaPct: 18.4,
      severityClass: SeverityClass.MODERATE,
      boundingBoxes: [
        { id: 'bx-1', label: 'Necrotic Concentric Lesion', x: 0.43, y: 0.37, width: 0.16, height: 0.18, lesionAreaPct: 11.2, detectorConfidence: null },
        { id: 'bx-2', label: 'Secondary Chlorotic Halo Spot', x: 0.23, y: 0.50, width: 0.10, height: 0.11, lesionAreaPct: 4.1, detectorConfidence: null },
        { id: 'bx-3', label: 'Upper Margin Spot', x: 0.58, y: 0.25, width: 0.08, height: 0.09, lesionAreaPct: 3.1, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Demo severity estimation via necrotic + chlorotic leaf pixel ratio. Separate from CNN classification confidence.',
      analyzedAt: daysAgoIso(3),
      isDemo: true,
    },
    {
      id: 'sev-demo-01b',
      scanId: 'scan-demo-01',
      observationId: null,
      farmId: 'farm-ka-03',
      zoneId: 'zone-farm-ka-03-1',
      cropType: CropType.TOMATO,
      diseaseName: 'Tomato Early Blight (Alternaria solani)',
      classificationConfidence: 0.84,
      affectedAreaPct: 11.2,
      severityClass: SeverityClass.MILD,
      boundingBoxes: [
        { id: 'bx-1b', label: 'Early Concentric Spot', x: 0.44, y: 0.39, width: 0.12, height: 0.13, lesionAreaPct: 11.2, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/tomato_blight_sample_1795172710319.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Earlier baseline severity scan 10 days prior for Kolar Tomato Zone A progression comparison.',
      analyzedAt: daysAgoIso(13),
      isDemo: true,
    },
    {
      id: 'sev-demo-02',
      scanId: 'scan-demo-02',
      observationId: null,
      farmId: 'farm-ka-02',
      zoneId: 'zone-farm-ka-02-1',
      cropType: CropType.POTATO,
      diseaseName: 'Potato Late Blight (Phytophthora infestans)',
      classificationConfidence: 0.89,
      affectedAreaPct: 27.6,
      severityClass: SeverityClass.MODERATE,
      boundingBoxes: [
        { id: 'bx-4', label: 'Water-Soaked Margin Lesion', x: 0.34, y: 0.35, width: 0.26, height: 0.33, lesionAreaPct: 27.6, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/potato_late_blight_sample_1795172709923.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Demo severity baseline for Hassan potato plot.',
      analyzedAt: daysAgoIso(2),
      isDemo: true,
    },
    {
      id: 'sev-demo-02b',
      scanId: 'scan-demo-02',
      observationId: null,
      farmId: 'farm-ka-02',
      zoneId: 'zone-farm-ka-02-1',
      cropType: CropType.POTATO,
      diseaseName: 'Potato Late Blight (Phytophthora infestans)',
      classificationConfidence: 0.85,
      affectedAreaPct: 14.8,
      severityClass: SeverityClass.MILD,
      boundingBoxes: [
        { id: 'bx-4b', label: 'Initial Margin Necrosis', x: 0.37, y: 0.37, width: 0.18, height: 0.22, lesionAreaPct: 14.8, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/potato_late_blight_sample_1795172709923.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Prior week baseline scan for Hassan Potato Zone A demonstrating worsening trajectory.',
      analyzedAt: daysAgoIso(9),
      isDemo: true,
    },
    {
      id: 'sev-demo-03',
      scanId: 'scan-demo-03',
      observationId: null,
      farmId: 'farm-ka-01',
      zoneId: 'zone-farm-ka-01-1',
      cropType: CropType.RICE,
      diseaseName: 'Rice Leaf Blast (Magnaporthe oryzae)',
      classificationConfidence: 0.84,
      affectedAreaPct: 9.4,
      severityClass: SeverityClass.MILD,
      boundingBoxes: [
        { id: 'bx-5', label: 'Spindle Blast Lesion', x: 0.42, y: 0.30, width: 0.18, height: 0.25, lesionAreaPct: 9.4, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/rice_blast_sample_1795172710079.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Follow-up severity check showing lesion arrest after nitrogen split adjustment.',
      analyzedAt: daysAgoIso(1),
      isDemo: true,
    },
    {
      id: 'sev-demo-03b',
      scanId: 'scan-demo-03',
      observationId: null,
      farmId: 'farm-ka-01',
      zoneId: 'zone-farm-ka-01-1',
      cropType: CropType.RICE,
      diseaseName: 'Rice Leaf Blast (Magnaporthe oryzae)',
      classificationConfidence: 0.82,
      affectedAreaPct: 16.5,
      severityClass: SeverityClass.MODERATE,
      boundingBoxes: [
        { id: 'bx-5b', label: 'Active Blast Lesions', x: 0.38, y: 0.28, width: 0.24, height: 0.30, lesionAreaPct: 16.5, detectorConfidence: null },
      ],
      originalImageUrl: '/src/assets/images/rice_blast_sample_1795172710079.jpg',
      annotatedImageUrl: null,
      segmentationMaskUrl: null,
      processingEngine: 'demo_opencv_canvas_heuristic',
      modelVersion: 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
      notes: 'Initial baseline scan 11 days ago for Mandya Rice Zone A (improving trend).',
      analyzedAt: daysAgoIso(11),
      isDemo: true,
    },
  ];

  // Structured Agricultural Advisory Knowledge Base (No invented dosages; authentic agronomy references)
  const advisoryArticles: AdvisoryArticle[] = [
    {
      id: 'adv-tomato-early-blight',
      cropType: CropType.TOMATO,
      diseaseName: 'Tomato Early Blight',
      pathogen: 'Alternaria solani',
      summary: 'Fungal foliar disease creating characteristic dark brown concentric target-board lesions surrounded by yellow chlorotic halos on older lower leaves.',
      symptoms: [
        'Circular brown-black lesions with concentric rings on lower mature leaves',
        'Chlorotic yellow halo expanding around necrotic tissue',
        'Premature defoliation exposing developing fruit to sunscald',
      ],
      riskFactors: [
        'Extended relative humidity above 75% paired with 24–29°C temperatures',
        'Overhead sprinkler irrigation wetting lower canopy foliage',
        'Dense unpruned canopy and continuous solanaceous cropping',
      ],
      favorableConditions: 'Temperatures 24–29°C with alternating wet dew/rain and dry periods; high canopy humidity > 75%.',
      immediateActions: [
        'Prune and safely remove heavily spotted lower senescent leaves away from the field',
        'Switch irrigation schedule to morning drip only so foliage dries rapidly',
        'Photograph 3–5 representative leaves and log zone severity baseline',
      ],
      preventiveMeasures: [
        'Use drip irrigation instead of overhead sprinklers to keep foliage dry',
        'Maintain proper plant spacing and stake plants for airflow',
        'Mulch soil beds to minimize rain-splash spore transfer',
      ],
      culturalManagement: [
        'Rotate tomato with non-solanaceous crops (legumes, cereals) on a 2–3 year cycle',
        'Deep-plough or compost clean crop debris post-harvest',
      ],
      biologicalManagement: [
        'Foliar application of Trichoderma viride or Bacillus subtilis bio-protectants per state university label guidance',
      ],
      organicTreatments: [
        'Bio-control protectant schedule initiated prior to monsoon humidity spikes',
        'Approved copper-based organic protectants only under local certification rules',
      ],
      chemicalGuidance: [
        'If severity exceeds mild thresholds, consult a licensed Karnataka Horticulture Officer or agronomist for registered protectant/systemic fungicide prescriptions and exact label dilution rates.',
      ],
      verifiedTreatmentInfo: 'Verified extension management combines lower-canopy sanitation, drip irrigation timing, and registered bio-protectants; chemical intervention requires local agronomist sign-off.',
      references: [
        'ICAR-IIHR (Indian Institute of Horticultural Research) — Tomato IPM Package of Practices',
        'University of Agricultural Sciences (UAS Bengaluru) — Solanaceous Disease Management Guide',
      ],
      safetyNotes: 'Always observe product label Pre-Harvest Interval (PHI), wear protective equipment during spraying, and never exceed registered label rates.',
      expertReviewedBy: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      lastReviewedAt: '2026-10-15',
    },
    {
      id: 'adv-potato-late-blight',
      cropType: CropType.POTATO,
      diseaseName: 'Potato Late Blight',
      pathogen: 'Phytophthora infestans',
      summary: 'Aggressive oomycete disease capable of rapid defoliation within 5–7 days during cool, humid, and misty weather conditions.',
      symptoms: [
        'Irregular pale-green to dark water-soaked patches at leaf tips and margins',
        'White cottony sporangial growth visible on leaf underside in morning dew',
        'Dark brown stem lesions and firm granular tuber rot',
      ],
      riskFactors: [
        'Cool temperatures (12–22°C) with >82% RH for 10+ consecutive hours',
        'Unchecked cull piles or volunteer potato plants nearby',
        'Infected seed tubers planted without sorting',
      ],
      favorableConditions: 'Cool temperatures (12–22°C) paired with relative humidity > 82% for 10+ consecutive hours.',
      immediateActions: [
        'Inspect field margins and low-lying damp pockets within 6 hours',
        'Alert neighbouring potato plots for preventive scouting',
        'Avoid entering wet foliage rows with machinery to prevent mechanical spore spread',
      ],
      preventiveMeasures: [
        'Plant certified disease-free seed tubers (e.g., Kufri Jyoti tolerant lines)',
        'Hill soil properly around stems to protect developing tubers from spore wash-down',
        'Destroy volunteer potato plants and cull piles near field boundaries',
      ],
      culturalManagement: [
        'Ensure rapid furrow drainage so standing water does not persist after rain',
        'Monitor regional weather alerts during cool misty periods in Hassan & Dharwad',
      ],
      biologicalManagement: [
        'Preventive microbial consortia and Trichoderma soil enrichment prior to canopy closure',
      ],
      organicTreatments: [
        'Preventive copper-based protectants prior to persistent mist/rain per certified organic standards',
      ],
      chemicalGuidance: [
        'Escalate immediately to a regional plant pathologist or KVK specialist when risk exceeds 75/100; apply only officially registered oomycete fungicides per prescribed label instructions.',
      ],
      verifiedTreatmentInfo: 'Rapid escalation threshold: Late Blight progresses exponentially under cool-humid weather; verified local KVK/UAS advisories govern active oomycete spray schedules.',
      references: [
        'ICAR-CPRI (Central Potato Research Institute) — Late Blight Forecasting & Management Bulletin',
        'CIP (International Potato Center) — Integrated Late Blight Field Guide',
      ],
      safetyNotes: 'Never harvest tubers while foliage is actively blighted; wait 14 days after haulm destruction and follow label PHI.',
      expertReviewedBy: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      lastReviewedAt: '2026-10-20',
    },
    {
      id: 'adv-rice-blast',
      cropType: CropType.RICE,
      diseaseName: 'Rice Leaf & Neck Blast',
      pathogen: 'Magnaporthe oryzae',
      summary: 'Major fungal disease of paddy causing diamond/spindle-shaped lesions on leaves and severe yield loss if panicle necks become infected.',
      symptoms: [
        'Spindle-shaped lesions with whitish-gray centers and dark brown margins',
        'Lesion coalescence leading to scorched leaf appearance in nursery or tillering',
        'Blackening of panicle neck node causing unfilled white chaffy grains',
      ],
      riskFactors: [
        'Excessive basal nitrogen/urea fertilization producing lush susceptible foliage',
        'High canopy humidity >80% and prolonged night dew',
        'Intermittent water stress in upland or poorly leveled paddies',
      ],
      favorableConditions: 'High relative humidity > 80%, prolonged dew, 22–29°C, and excessive nitrogen fertilization.',
      immediateActions: [
        'Pause top-dressing urea applications until foliar blast pressure subsides',
        'Maintain uniform shallow water depth across paddy bunds',
        'Flag zone for booting/panicle emergence follow-up inspection',
      ],
      preventiveMeasures: [
        'Split nitrogen applications rather than heavy basal urea dosing',
        'Maintain shallow standing water uniformly without drought stress',
        'Select blast-tolerant paddy cultivars suited to Cauvery & Tungabhadra basins',
      ],
      culturalManagement: [
        'Remove grassy weed hosts along paddy bunds that harbor inoculum',
        'Incorporate rice husk ash or silicon sources to strengthen leaf epidermis',
      ],
      biologicalManagement: [
        'Pseudomonas fluorescens seed treatment and early foliar bio-protectant spray per UAS recommendation',
      ],
      organicTreatments: [
        'Bio-agent foliar conditioning during active tillering stage',
      ],
      chemicalGuidance: [
        'If neck blast risk threatens booting/panicle stages, obtain prescription and registered label rates from local Agriculture Extension Officer.',
      ],
      verifiedTreatmentInfo: 'Nitrogen moderation combined with Pseudomonas fluorescens conditioning and uniform water management forms the verified baseline against Rice Blast.',
      references: [
        'IRRI (International Rice Research Institute) — Rice Knowledge Bank: Blast Management',
        'UAS Mandya / ZARS V.C. Farm — Paddy Integrated Disease Management Advisory',
      ],
      safetyNotes: 'Avoid spraying during peak pollinator activity and maintain paddy water-holding periods specified on registered product labels.',
      expertReviewedBy: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      lastReviewedAt: '2026-10-12',
    },
    {
      id: 'adv-maize-blight',
      cropType: CropType.MAIZE,
      diseaseName: 'Northern Corn Leaf Blight',
      pathogen: 'Exserohilum turcicum',
      summary: 'Foliar fungal disease producing elongated cigar-shaped gray-green lesions that reduce photosynthetic grain-fill capacity.',
      symptoms: [
        'Long elliptical cigar-shaped lesions (3–15 cm) parallel to leaf veins',
        'Progression from lower canopy leaves upward toward ear leaf',
      ],
      riskFactors: [
        'Moderate temperatures (18–27°C) with frequent rain or heavy dew',
        'Surface maize residue retained from infected prior season',
      ],
      favorableConditions: 'Moderate temperatures (18–27°C) with heavy morning dew or frequent rainfall.',
      immediateActions: [
        'Inspect the ear leaf and leaves above the ear to assess yield-critical foliage status',
        'Log lesion percentage in Severity Analysis before tasseling',
      ],
      preventiveMeasures: [
        'Select locally adapted hybrids with NCLB tolerance',
        'Manage infected maize stover after harvest to lower overwintering inoculum',
      ],
      culturalManagement: [
        'Rotate maize with pulses (chickpea, greengram) in Belagavi and Davanagere belts',
        'Avoid overly dense plant populations that trap canopy moisture',
      ],
      biologicalManagement: [
        'Trichoderma harzianum soil application on crop residues to speed decomposition',
      ],
      organicTreatments: [
        'Residue decomposition bio-inoculants between cropping cycles',
      ],
      chemicalGuidance: [
        'Consult district agronomist before foliar fungicide intervention; prioritize ear-leaf protection only when extension thresholds are reached.',
      ],
      verifiedTreatmentInfo: 'Hybrid resistance + pulse crop rotation and residue management provide primary sustainable suppression of Exserohilum turcicum.',
      references: [
        'ICAR-IIMR (Indian Institute of Maize Research) — Foliar Disease Field Manual',
        'TNAU Agritech Portal — Maize Crop Protection Compendium',
      ],
      safetyNotes: 'Calibrate high-clearance sprayers properly and adhere to local agricultural label safety intervals.',
      expertReviewedBy: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      lastReviewedAt: '2026-09-28',
    },
    {
      id: 'adv-chilli-curl',
      cropType: CropType.CHILLI,
      diseaseName: 'Chilli Leaf Curl & Anthracnose',
      pathogen: 'Begomovirus (Whitefly/Thrips Vector) & Colletotrichum capsici',
      summary: 'Vector-transmitted viral curling paired with fungal fruit dieback in Karnataka chilli belts such as Byadgi and Ballari.',
      symptoms: [
        'Upward or downward leaf curling, puckering, and vein clearing on young shoots',
        'Stunted internodes and reduced flower set',
        'Sunken dark concentric lesions on ripening chilli pods (Anthracnose)',
      ],
      riskFactors: [
        'Dry warm spells (>30°C) accelerating whitefly and thrips vector reproduction',
        'Sudden rain splashes onto maturing chilli pods',
      ],
      favorableConditions: 'Dry warm spells (> 30°C) trigger thrips/whitefly vector surges; sudden rain triggers anthracnose.',
      immediateActions: [
        'Install yellow and blue sticky traps at canopy height to monitor vector counts',
        'Inspect shoot tips for thrips/whitefly nymphs and rogue severely viral stunted plants',
      ],
      preventiveMeasures: [
        'Grow 2 rows of maize or sorghum barrier crop around chilli plot borders',
        'Use reflective silver mulch where feasible to deter landing whiteflies',
      ],
      culturalManagement: [
        'Maintain weed-free field borders to eliminate alternate begomovirus hosts',
        'Avoid moisture stress swings that amplify thrips feeding damage',
      ],
      biologicalManagement: [
        'Entomopathogenic fungi (Beauveria bassiana / Lecanicillium lecanii) and neem-based botanicals targeting nymphal vectors',
      ],
      organicTreatments: [
        'Neem-based botanicals paired with sticky trap mass-trapping at early infestation',
      ],
      chemicalGuidance: [
        'Rotate vector management actives strictly under guidance of Karnataka Horticulture Department / KVK specialists to prevent whitefly resistance.',
      ],
      verifiedTreatmentInfo: 'Viral leaf curl cannot be cured once plants are systemically infected; early vector suppression + border barrier crops + roguing is the verified management protocol.',
      references: [
        'ICAR-IIHR — Chilli Murda (Leaf Curl) Integrated Vector Management Bulletin',
        'University of Horticultural Sciences (UHS Bagalkot) — Byadgi Chilli Advisory',
      ],
      safetyNotes: 'Do not spray broad-spectrum insecticides during active morning bloom to protect honeybees and natural predators.',
      expertReviewedBy: 'Dr. Kavitha Rao (Demo Plant Pathologist)',
      lastReviewedAt: '2026-11-02',
    },
  ];

  // Seed Expert Review History entries for pre-reviewed demo observations
  const expertReviewHistory: ExpertReviewHistoryEntry[] = observations
    .filter((o) => o.expertReviewStatus === 'approved' || o.expertReviewStatus === 'corrected')
    .slice(0, 24)
    .map((o, i) => ({
      id: `rev-${o.id}`,
      observationId: o.id,
      reviewerName: 'Dr. Kavitha Rao (Demo Pathologist)',
      reviewerRole: UserRole.EXPERT,
      decision: o.expertReviewStatus === 'corrected' ? 'corrected' : 'approved',
      previousDisease: o.expertReviewStatus === 'corrected' ? `${o.cropType} Unclassified Spot` : o.diseaseName,
      newDisease: o.diseaseName,
      previousSeverity: o.expertReviewStatus === 'corrected' ? SeverityClass.MILD : o.severityClass,
      newSeverity: o.severityClass,
      comment:
        o.expertNotes ||
        'Verified against crop foliar pathology baseline in synthetic demo dataset.',
      treatmentRecommendationNote:
        o.observationStatus === 'healthy'
          ? 'No intervention required; continue routine 7-day scouting.'
          : 'Follow Smart Advisory cultural & bio-protectant protocol; schedule 5-day follow-up scan.',
      reviewedAt: daysAgoIso(i % 5, 2),
    }));

  const outbreakInvestigations = [
    {
      clusterId: 'cluster-Kolar-Tomato',
      district: 'Kolar',
      cropType: 'Tomato',
      dominantDisease: 'Early Blight',
      investigationStatus: 'confirmed' as const,
      expertNotes: 'Confirmed multi-plot Alternaria cluster in Kolar/Sidlaghatta belt following morning dew spikes.',
      updatedBy: 'Dr. Kavitha Rao (Demo Pathologist)',
      updatedAt: daysAgoIso(1),
    },
    {
      clusterId: 'cluster-Hassan-Potato',
      district: 'Hassan',
      cropType: 'Potato',
      dominantDisease: 'Late Blight',
      investigationStatus: 'under_investigation' as const,
      expertNotes: 'Elevated cool-humid risk window; regional extension team reviewing uploaded leaf images.',
      updatedBy: 'Dr. Kavitha Rao (Demo Pathologist)',
      updatedAt: daysAgoIso(0, 4),
    },
    {
      clusterId: 'cluster-Mandya-Rice',
      district: 'Mandya',
      cropType: 'Rice',
      dominantDisease: 'Rice Blast',
      investigationStatus: 'monitoring' as const,
      expertNotes: 'Moderate blast incidence clustered near canal-fed blocks; nitrogen split advisory issued.',
      updatedBy: 'Dr. Kavitha Rao (Demo Pathologist)',
      updatedAt: daysAgoIso(2),
    },
  ];

  return {
    users,
    farms,
    zones,
    observations,
    scans,
    severityAnalyses,
    weatherRecords,
    soilRecords,
    sensors,
    sensorReadings,
    sensorThresholds,
    riskAssessments,
    alerts,
    treatments,
    advisoryArticles,
    expertReviewHistory,
    outbreakInvestigations,
  };
}
