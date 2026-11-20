export enum UserRole {
  FARMER = 'farmer',
  EXPERT = 'expert',
  ADMIN = 'admin',
}

export enum CropType {
  TOMATO = 'Tomato',
  POTATO = 'Potato',
  RICE = 'Rice',
  MAIZE = 'Maize',
  CHILLI = 'Chilli',
}

export enum GrowthStage {
  SEEDLING = 'Seedling',
  VEGETATIVE = 'Vegetative',
  FLOWERING = 'Flowering',
  FRUITING = 'Fruiting / Grain Fill',
  MATURITY = 'Maturity',
}

export enum ZoneHealthStatus {
  HEALTHY = 'healthy',
  SUSPECTED = 'suspected',
  INFECTED = 'infected',
  AT_RISK = 'at_risk',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export enum SeverityClass {
  HEALTHY = 'Healthy',
  MILD = 'Mild',
  MODERATE = 'Moderate',
  SEVERE = 'Severe',
}

export enum RiskCategory {
  LOW = 'Low',
  MODERATE = 'Moderate',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertCategory {
  DISEASE = 'disease',
  ENVIRONMENTAL = 'environmental',
  SENSOR = 'sensor',
  INSPECTION = 'inspection',
}

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  district: string;
  organization: string;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
}

export interface Farm {
  id: string;
  name: string;
  ownerLabel: string;
  district: string;
  taluk: string;
  latitude: number;
  longitude: number;
  areaHectares: number;
  soilType: string;
  irrigationType: string;
  boundaryGeoJson: string; // GeoJSON Polygon string
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CropRecord {
  id: string;
  farmId: string;
  zoneId: string;
  cropType: CropType;
  variety: string;
  plantingDate: string;
  expectedHarvestDate: string;
  growthStage: GrowthStage;
  isDemo: boolean;
}

export interface FarmZone {
  id: string;
  farmId: string;
  farmName?: string;
  district?: string;
  zoneCode: string;
  name: string;
  cropType: CropType;
  variety: string;
  plantingDate: string;
  growthStage: GrowthStage;
  areaHectares: number;
  latitude: number;
  longitude: number;
  polygonGeoJson: string;
  healthStatus: ZoneHealthStatus;
  riskScore: number;
  riskCategory: RiskCategory;
  lastInspectedAt: string | null;
  isDemo: boolean;
}

export interface DiseaseObservation {
  id: string;
  farmId: string;
  zoneId: string;
  farmName?: string;
  zoneName?: string;
  cropType: CropType;
  diseaseName: string;
  pathogen: string;
  observationStatus: 'healthy' | 'suspected' | 'confirmed' | 'resolved';
  severityClass: SeverityClass;
  affectedAreaPct: number;
  confidenceScore: number | null;
  sourceMode: 'demo_dataset' | 'visual_heuristic_demo' | 'fastapi_pytorch_cnn' | 'manual_field_log';
  expertReviewStatus: 'pending' | 'approved' | 'corrected' | 'rejected';
  expertNotes: string | null;
  reviewedBy: string | null;
  imageUrl: string | null;
  notes: string;
  observedAt: string;
  isDemo: boolean;
}

export interface ImageQualityMetrics {
  width: number;
  height: number;
  brightness: number; // 0-255
  sharpnessScore: number; // 0-100
  greenFoliageRatio: number; // 0-1
  passed: boolean;
  warnings: string[];
}

export interface AlternativePrediction {
  diseaseName: string;
  confidence: number;
}

export interface DiseaseScanRecord {
  id: string;
  farmId: string | null;
  zoneId: string | null;
  cropType: CropType;
  imageUrl: string;
  gradCamOverlayUrl: string | null;
  predictedDisease: string;
  isHealthy: boolean;
  confidenceScore: number;
  alternativePredictions: AlternativePrediction[];
  qualityMetrics: ImageQualityMetrics;
  inferenceMode: 'demo_visual_sandbox' | 'fastapi_cnn_resnet50';
  modelVersion: string;
  datasetReference: string;
  createdAt: string;
  isDemo: boolean;
}

export interface SeverityBoundingBox {
  id: string;
  label: string;
  x: number; // normalized 0-1
  y: number;
  width: number;
  height: number;
  lesionAreaPct: number;
  detectorConfidence: number | null;
}

export interface SeverityAnalysisRecord {
  id: string;
  scanId: string | null;
  observationId: string | null;
  farmId: string | null;
  zoneId: string | null;
  cropType: CropType;
  diseaseName: string;
  classificationConfidence: number;
  affectedAreaPct: number;
  severityClass: SeverityClass;
  boundingBoxes: SeverityBoundingBox[];
  originalImageUrl: string;
  annotatedImageUrl: string | null;
  segmentationMaskUrl: string | null;
  processingEngine: 'demo_opencv_canvas_heuristic' | 'fastapi_yolov8_opencv';
  modelVersion: string;
  notes: string;
  analyzedAt: string;
  isDemo: boolean;
}

export interface WeatherRecord {
  id: string;
  farmId: string;
  district: string;
  temperatureC: number;
  humidityPct: number;
  rainfallMm: number;
  windSpeedKmh: number;
  conditionLabel: string;
  source: 'demo_synthetic' | 'open_meteo_live';
  recordedAt: string;
  isDemo: boolean;
}

export interface SoilRecord {
  id: string;
  farmId: string;
  zoneId: string;
  soilMoisturePct: number;
  soilTempC: number;
  soilPh: number;
  nitrogenPpm: number;
  phosphorusPpm: number;
  potassiumPpm: number;
  recordedAt: string;
  isDemo: boolean;
}

export interface IoTSensor {
  id: string;
  deviceUid: string;
  name: string;
  farmId: string;
  zoneId: string;
  farmName?: string;
  zoneName?: string;
  hardwareModel: string;
  firmwareVersion: string;
  status: 'online' | 'degraded' | 'offline';
  batteryPct: number;
  signalRssi: number;
  lastSeenAt: string;
  isDemo: boolean;
}

export interface SensorReading {
  id: string;
  sensorId: string;
  deviceUid: string;
  farmId: string;
  zoneId: string;
  soilMoisturePct: number;
  soilTempC: number;
  airTempC: number;
  humidityPct: number;
  soilPh: number;
  recordedAt: string;
  isDemo: boolean;
}

export interface SensorThreshold {
  id: string;
  farmId: string;
  cropType: CropType;
  minSoilMoisture: number;
  maxSoilMoisture: number;
  maxHumidity: number;
  minSoilPh: number;
  maxSoilPh: number;
  maxAirTemp: number;
  updatedAt: string;
}

export interface RiskFactor {
  factor: string;
  observedValue: string;
  threshold: string;
  contributionPoints: number;
  rationale: string;
}

export interface RiskAssessment {
  id: string;
  farmId: string;
  zoneId: string;
  farmName?: string;
  zoneName?: string;
  cropType: CropType;
  targetDisease: string;
  riskScore: number; // 0-100
  riskCategory: RiskCategory;
  environmentalVsConfirmed: 'environmental_risk' | 'confirmed_disease_present';
  contributingFactors: RiskFactor[];
  inspectionPriority: 'Routine (7d)' | 'Elevated (72h)' | 'Urgent (24h)' | 'Immediate (6h)';
  recommendedActions: string[];
  engineVersion: string;
  assessedAt: string;
  isDemo: boolean;
}

export interface AlertItem {
  id: string;
  farmId: string;
  zoneId: string | null;
  farmName?: string;
  zoneName?: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  acknowledged: boolean;
  resolvedAt: string | null;
  createdAt: string;
  isDemo: boolean;
}

export interface TreatmentRecord {
  id: string;
  farmId: string;
  zoneId: string;
  observationId: string | null;
  actionType: 'preventive_spray' | 'fungicide_application' | 'bio_control' | 'irrigation_adjustment' | 'field_inspection';
  productOrMethod: string;
  dosage: string;
  appliedBy: string;
  outcomeStatus?: 'pending_evaluation' | 'improving' | 'no_change' | 'worsened';
  outcomeNotes: string;
  expertVerified?: boolean;
  appliedAt: string;
  isDemo: boolean;
}

export interface ExpertReviewHistoryEntry {
  id: string;
  observationId: string;
  reviewerName: string;
  reviewerRole: UserRole;
  decision: 'approved' | 'corrected' | 'rejected';
  previousDisease: string;
  newDisease: string;
  previousSeverity: SeverityClass;
  newSeverity: SeverityClass;
  comment: string;
  treatmentRecommendationNote: string | null;
  reviewedAt: string;
}

export interface AdvisoryArticle {
  id: string;
  cropType: CropType;
  diseaseName: string;
  pathogen: string;
  summary: string;
  symptoms: string[];
  riskFactors: string[];
  favorableConditions: string;
  immediateActions: string[];
  preventiveMeasures: string[];
  culturalManagement: string[];
  biologicalManagement: string[];
  organicTreatments: string[];
  chemicalGuidance: string[];
  verifiedTreatmentInfo: string;
  references: string[];
  safetyNotes: string;
  expertReviewedBy: string;
  lastReviewedAt: string;
}

export interface OutbreakCluster {
  clusterId: string;
  regionLabel: string;
  district: string;
  cropType: string;
  dominantDisease: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  farmCount: number;
  totalZones: number;
  recentReportsCount: number;
  priorWindowReportsCount: number;
  increasingTrend: boolean;
  confirmedCount: number;
  suspectedCount: number;
  avgRiskScore: number;
  classification: 'potential_cluster' | 'expert_confirmed_outbreak';
  investigationStatus: 'monitoring' | 'under_investigation' | 'confirmed' | 'contained';
  expertNotes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface IntegrationSettings {
  fastApiBaseUrl: string;
  fastApiApiKeyConfigured: boolean;
  inferenceMode: 'demo_sandbox' | 'fastapi_external';
  weatherProvider: 'open_meteo_live' | 'demo_synthetic';
  esp32IngestEndpoint: string;
  activeDemoRole: UserRole;
}

export interface OverviewSummary {
  totalFarms: number;
  totalZones: number;
  healthyZones: number;
  infectedZones: number;
  atRiskZones: number;
  suspectedZones: number;
  insufficientDataZones: number;
  totalObservations: number;
  pendingExpertReviews: number;
  activeAlerts: number;
  onlineSensors: number;
  totalSensors: number;
  avgTemperatureC: number;
  avgHumidityPct: number;
  avgSoilMoisturePct: number;
  recentAlerts: AlertItem[];
  cropHealthTrends: Array<{
    date: string;
    healthy: number;
    atRisk: number;
    infected: number;
    avgRiskScore: number;
  }>;
  farmDiseaseDistribution: Array<{
    farmId: string;
    farmName: string;
    district: string;
    healthy: number;
    suspected: number;
    infected: number;
    atRisk: number;
  }>;
  cropBreakdown: Array<{
    cropType: string;
    zones: number;
    infected: number;
    avgRisk: number;
  }>;
}
