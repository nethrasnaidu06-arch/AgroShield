import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateKarnatakaDemoDataset } from '../demo/seedData.ts';

export const DEFAULT_DEMO_PASSWORD = 'AgroShield@2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'agroshield.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL,
      district TEXT NOT NULL,
      organization TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS farms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_label TEXT NOT NULL,
      district TEXT NOT NULL,
      taluk TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      area_hectares REAL NOT NULL,
      soil_type TEXT NOT NULL,
      irrigation_type TEXT NOT NULL,
      boundary_geojson TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS farm_zones (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_code TEXT NOT NULL,
      name TEXT NOT NULL,
      crop_type TEXT NOT NULL,
      variety TEXT NOT NULL,
      planting_date TEXT NOT NULL,
      growth_stage TEXT NOT NULL,
      area_hectares REAL NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      polygon_geojson TEXT NOT NULL,
      health_status TEXT NOT NULL,
      risk_score INTEGER NOT NULL DEFAULT 0,
      risk_category TEXT NOT NULL DEFAULT 'Low',
      last_inspected_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS disease_observations (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      crop_type TEXT NOT NULL,
      disease_name TEXT NOT NULL,
      pathogen TEXT NOT NULL,
      observation_status TEXT NOT NULL,
      severity_class TEXT NOT NULL,
      affected_area_pct REAL NOT NULL DEFAULT 0,
      confidence_score REAL,
      source_mode TEXT NOT NULL,
      expert_review_status TEXT NOT NULL DEFAULT 'pending',
      expert_notes TEXT,
      reviewed_by TEXT,
      image_url TEXT,
      notes TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS disease_scans (
      id TEXT PRIMARY KEY,
      farm_id TEXT REFERENCES farms(id) ON DELETE SET NULL,
      zone_id TEXT REFERENCES farm_zones(id) ON DELETE SET NULL,
      crop_type TEXT NOT NULL,
      image_url TEXT NOT NULL,
      grad_cam_overlay_url TEXT,
      predicted_disease TEXT NOT NULL,
      is_healthy INTEGER NOT NULL,
      confidence_score REAL NOT NULL,
      alternative_predictions TEXT NOT NULL,
      quality_metrics TEXT NOT NULL,
      inference_mode TEXT NOT NULL,
      model_version TEXT NOT NULL,
      dataset_reference TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS severity_analyses (
      id TEXT PRIMARY KEY,
      scan_id TEXT REFERENCES disease_scans(id) ON DELETE SET NULL,
      observation_id TEXT REFERENCES disease_observations(id) ON DELETE SET NULL,
      farm_id TEXT REFERENCES farms(id) ON DELETE SET NULL,
      zone_id TEXT REFERENCES farm_zones(id) ON DELETE SET NULL,
      crop_type TEXT NOT NULL,
      disease_name TEXT NOT NULL,
      classification_confidence REAL NOT NULL,
      affected_area_pct REAL NOT NULL,
      severity_class TEXT NOT NULL,
      bounding_boxes TEXT NOT NULL,
      original_image_url TEXT NOT NULL,
      annotated_image_url TEXT,
      segmentation_mask_url TEXT,
      processing_engine TEXT NOT NULL,
      model_version TEXT NOT NULL,
      notes TEXT NOT NULL,
      analyzed_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS weather_records (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      district TEXT NOT NULL,
      temperature_c REAL NOT NULL,
      humidity_pct REAL NOT NULL,
      rainfall_mm REAL NOT NULL,
      wind_speed_kmh REAL NOT NULL,
      condition_label TEXT NOT NULL,
      source TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS soil_records (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      soil_moisture_pct REAL NOT NULL,
      soil_temp_c REAL NOT NULL,
      soil_ph REAL NOT NULL,
      nitrogen_ppm REAL NOT NULL,
      phosphorus_ppm REAL NOT NULL,
      potassium_ppm REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS iot_sensors (
      id TEXT PRIMARY KEY,
      device_uid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      hardware_model TEXT NOT NULL,
      firmware_version TEXT NOT NULL,
      status TEXT NOT NULL,
      battery_pct INTEGER NOT NULL,
      signal_rssi INTEGER NOT NULL,
      last_seen_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sensor_readings (
      id TEXT PRIMARY KEY,
      sensor_id TEXT NOT NULL REFERENCES iot_sensors(id) ON DELETE CASCADE,
      device_uid TEXT NOT NULL,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      soil_moisture_pct REAL NOT NULL,
      soil_temp_c REAL NOT NULL,
      air_temp_c REAL NOT NULL,
      humidity_pct REAL NOT NULL,
      soil_ph REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sensor_thresholds (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      crop_type TEXT NOT NULL,
      min_soil_moisture REAL NOT NULL,
      max_soil_moisture REAL NOT NULL,
      max_humidity REAL NOT NULL,
      min_soil_ph REAL NOT NULL,
      max_soil_ph REAL NOT NULL,
      max_air_temp REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      crop_type TEXT NOT NULL,
      target_disease TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      risk_category TEXT NOT NULL,
      environmental_vs_confirmed TEXT NOT NULL,
      contributing_factors TEXT NOT NULL,
      inspection_priority TEXT NOT NULL,
      recommended_actions TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      assessed_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT REFERENCES farm_zones(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
      observation_id TEXT REFERENCES disease_observations(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      product_or_method TEXT NOT NULL,
      dosage TEXT NOT NULL,
      applied_by TEXT NOT NULL,
      outcome_status TEXT NOT NULL DEFAULT 'pending_evaluation',
      outcome_notes TEXT NOT NULL,
      expert_verified INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS advisory_articles (
      id TEXT PRIMARY KEY,
      crop_type TEXT NOT NULL,
      disease_name TEXT NOT NULL,
      pathogen TEXT NOT NULL,
      summary TEXT NOT NULL,
      symptoms TEXT NOT NULL,
      risk_factors TEXT NOT NULL DEFAULT '[]',
      favorable_conditions TEXT NOT NULL,
      immediate_actions TEXT NOT NULL DEFAULT '[]',
      preventive_measures TEXT NOT NULL,
      cultural_management TEXT NOT NULL DEFAULT '[]',
      biological_management TEXT NOT NULL DEFAULT '[]',
      organic_treatments TEXT NOT NULL,
      chemical_guidance TEXT NOT NULL,
      verified_treatment_info TEXT NOT NULL DEFAULT '',
      article_references TEXT NOT NULL DEFAULT '[]',
      safety_notes TEXT NOT NULL,
      expert_reviewed_by TEXT NOT NULL,
      last_reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expert_review_history (
      id TEXT PRIMARY KEY,
      observation_id TEXT NOT NULL REFERENCES disease_observations(id) ON DELETE CASCADE,
      reviewer_name TEXT NOT NULL,
      reviewer_role TEXT NOT NULL,
      decision TEXT NOT NULL,
      previous_disease TEXT NOT NULL,
      new_disease TEXT NOT NULL,
      previous_severity TEXT NOT NULL,
      new_severity TEXT NOT NULL,
      comment TEXT NOT NULL,
      treatment_recommendation_note TEXT,
      reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbreak_investigations (
      cluster_id TEXT PRIMARY KEY,
      district TEXT NOT NULL,
      crop_type TEXT NOT NULL,
      dominant_disease TEXT NOT NULL,
      investigation_status TEXT NOT NULL,
      expert_notes TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe schema migrations for existing DB files
  const safeAlters = [
    'ALTER TABLE users ADD COLUMN password_hash TEXT',
    "ALTER TABLE treatments ADD COLUMN outcome_status TEXT NOT NULL DEFAULT 'pending_evaluation'",
    'ALTER TABLE treatments ADD COLUMN expert_verified INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE advisory_articles ADD COLUMN risk_factors TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE advisory_articles ADD COLUMN immediate_actions TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE advisory_articles ADD COLUMN cultural_management TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE advisory_articles ADD COLUMN biological_management TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE advisory_articles ADD COLUMN verified_treatment_info TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE advisory_articles ADD COLUMN article_references TEXT NOT NULL DEFAULT '[]'",
  ];
  for (const stmt of safeAlters) {
    try {
      db.exec(stmt);
    } catch {
      // column already exists
    }
  }

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM farms').get() as { cnt: number };
  if (countRow.cnt === 0) {
    seedDemoDatabase();
  } else {
    // Ensure new tables/enriched advisory articles are populated on existing DB
    const revCount = (db.prepare('SELECT COUNT(*) as cnt FROM expert_review_history').get() as { cnt: number }).cnt;
    if (revCount === 0) {
      seedUpgradeDelta();
    }
  }

  // Ensure all users without a password hash (including seeded demo accounts on existing DBs) receive a valid scrypt hash
  const usersWithoutHash = db.prepare("SELECT id FROM users WHERE password_hash IS NULL OR password_hash = ''").all() as Array<{ id: string }>;
  if (usersWithoutHash.length > 0) {
    const upd = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    const defaultHash = hashPassword(DEFAULT_DEMO_PASSWORD);
    const tx = db.transaction(() => {
      for (const u of usersWithoutHash) {
        upd.run(defaultHash, u.id);
      }
    });
    tx();
  }
}

function seedUpgradeDelta(): void {
  const data = generateKarnatakaDemoDataset();
  const tx = db.transaction(() => {
    const insSev = db.prepare(
      `INSERT OR REPLACE INTO severity_analyses (id, scan_id, observation_id, farm_id, zone_id, crop_type, disease_name, classification_confidence, affected_area_pct, severity_class, bounding_boxes, original_image_url, annotated_image_url, segmentation_mask_url, processing_engine, model_version, notes, analyzed_at, is_demo)
       VALUES (@id, @scanId, @observationId, @farmId, @zoneId, @cropType, @diseaseName, @classificationConfidence, @affectedAreaPct, @severityClass, @boundingBoxes, @originalImageUrl, @annotatedImageUrl, @segmentationMaskUrl, @processingEngine, @modelVersion, @notes, @analyzedAt, @isDemo)`
    );
    for (const sv of data.severityAnalyses) {
      insSev.run({ ...sv, boundingBoxes: JSON.stringify(sv.boundingBoxes), isDemo: sv.isDemo ? 1 : 0 });
    }

    const insAdv = db.prepare(
      `INSERT OR REPLACE INTO advisory_articles (id, crop_type, disease_name, pathogen, summary, symptoms, risk_factors, favorable_conditions, immediate_actions, preventive_measures, cultural_management, biological_management, organic_treatments, chemical_guidance, verified_treatment_info, article_references, safety_notes, expert_reviewed_by, last_reviewed_at)
       VALUES (@id, @cropType, @diseaseName, @pathogen, @summary, @symptoms, @riskFactors, @favorableConditions, @immediateActions, @preventiveMeasures, @culturalManagement, @biologicalManagement, @organicTreatments, @chemicalGuidance, @verifiedTreatmentInfo, @articleReferences, @safetyNotes, @expertReviewedBy, @lastReviewedAt)`
    );
    for (const a of data.advisoryArticles) {
      insAdv.run({
        ...a,
        symptoms: JSON.stringify(a.symptoms),
        riskFactors: JSON.stringify(a.riskFactors),
        immediateActions: JSON.stringify(a.immediateActions),
        preventiveMeasures: JSON.stringify(a.preventiveMeasures),
        culturalManagement: JSON.stringify(a.culturalManagement),
        biologicalManagement: JSON.stringify(a.biologicalManagement),
        organicTreatments: JSON.stringify(a.organicTreatments),
        chemicalGuidance: JSON.stringify(a.chemicalGuidance),
        articleReferences: JSON.stringify(a.references),
      });
    }

    const insRev = db.prepare(
      `INSERT OR REPLACE INTO expert_review_history (id, observation_id, reviewer_name, reviewer_role, decision, previous_disease, new_disease, previous_severity, new_severity, comment, treatment_recommendation_note, reviewed_at)
       VALUES (@id, @observationId, @reviewerName, @reviewerRole, @decision, @previousDisease, @newDisease, @previousSeverity, @newSeverity, @comment, @treatmentRecommendationNote, @reviewedAt)`
    );
    for (const r of data.expertReviewHistory) {
      insRev.run(r);
    }

    const insOut = db.prepare(
      `INSERT OR REPLACE INTO outbreak_investigations (cluster_id, district, crop_type, dominant_disease, investigation_status, expert_notes, updated_by, updated_at)
       VALUES (@clusterId, @district, @cropType, @dominantDisease, @investigationStatus, @expertNotes, @updatedBy, @updatedAt)`
    );
    for (const o of data.outbreakInvestigations) {
      insOut.run(o);
    }
  });
  tx();
}

export function seedDemoDatabase(): void {
  const data = generateKarnatakaDemoDataset();

  const insertTransaction = db.transaction(() => {
    const defaultDemoHash = hashPassword(DEFAULT_DEMO_PASSWORD);
    const insUser = db.prepare(
      `INSERT OR REPLACE INTO users (id, full_name, email, password_hash, role, district, organization, active, is_demo, created_at)
       VALUES (@id, @fullName, @email, @passwordHash, @role, @district, @organization, @active, @isDemo, @createdAt)`
    );
    for (const u of data.users) {
      insUser.run({
        ...u,
        passwordHash: defaultDemoHash,
        active: u.active ? 1 : 0,
        isDemo: u.isDemo ? 1 : 0,
      });
    }

    const insFarm = db.prepare(
      `INSERT OR REPLACE INTO farms (id, name, owner_label, district, taluk, latitude, longitude, area_hectares, soil_type, irrigation_type, boundary_geojson, is_demo, created_at, updated_at)
       VALUES (@id, @name, @ownerLabel, @district, @taluk, @latitude, @longitude, @areaHectares, @soilType, @irrigationType, @boundaryGeoJson, @isDemo, @createdAt, @updatedAt)`
    );
    for (const f of data.farms) {
      insFarm.run({ ...f, isDemo: f.isDemo ? 1 : 0 });
    }

    const insZone = db.prepare(
      `INSERT OR REPLACE INTO farm_zones (id, farm_id, zone_code, name, crop_type, variety, planting_date, growth_stage, area_hectares, latitude, longitude, polygon_geojson, health_status, risk_score, risk_category, last_inspected_at, is_demo)
       VALUES (@id, @farmId, @zoneCode, @name, @cropType, @variety, @plantingDate, @growthStage, @areaHectares, @latitude, @longitude, @polygonGeoJson, @healthStatus, @riskScore, @riskCategory, @lastInspectedAt, @isDemo)`
    );
    for (const z of data.zones) {
      insZone.run({ ...z, isDemo: z.isDemo ? 1 : 0 });
    }

    const insObs = db.prepare(
      `INSERT OR REPLACE INTO disease_observations (id, farm_id, zone_id, crop_type, disease_name, pathogen, observation_status, severity_class, affected_area_pct, confidence_score, source_mode, expert_review_status, expert_notes, reviewed_by, image_url, notes, observed_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @cropType, @diseaseName, @pathogen, @observationStatus, @severityClass, @affectedAreaPct, @confidenceScore, @sourceMode, @expertReviewStatus, @expertNotes, @reviewedBy, @imageUrl, @notes, @observedAt, @isDemo)`
    );
    for (const o of data.observations) {
      insObs.run({ ...o, isDemo: o.isDemo ? 1 : 0 });
    }

    const insScan = db.prepare(
      `INSERT OR REPLACE INTO disease_scans (id, farm_id, zone_id, crop_type, image_url, grad_cam_overlay_url, predicted_disease, is_healthy, confidence_score, alternative_predictions, quality_metrics, inference_mode, model_version, dataset_reference, created_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @cropType, @imageUrl, @gradCamOverlayUrl, @predictedDisease, @isHealthy, @confidenceScore, @alternativePredictions, @qualityMetrics, @inferenceMode, @modelVersion, @datasetReference, @createdAt, @isDemo)`
    );
    for (const sc of data.scans) {
      insScan.run({
        ...sc,
        isHealthy: sc.isHealthy ? 1 : 0,
        alternativePredictions: JSON.stringify(sc.alternativePredictions),
        qualityMetrics: JSON.stringify(sc.qualityMetrics),
        isDemo: sc.isDemo ? 1 : 0,
      });
    }

    const insSev = db.prepare(
      `INSERT OR REPLACE INTO severity_analyses (id, scan_id, observation_id, farm_id, zone_id, crop_type, disease_name, classification_confidence, affected_area_pct, severity_class, bounding_boxes, original_image_url, annotated_image_url, segmentation_mask_url, processing_engine, model_version, notes, analyzed_at, is_demo)
       VALUES (@id, @scanId, @observationId, @farmId, @zoneId, @cropType, @diseaseName, @classificationConfidence, @affectedAreaPct, @severityClass, @boundingBoxes, @originalImageUrl, @annotatedImageUrl, @segmentationMaskUrl, @processingEngine, @modelVersion, @notes, @analyzedAt, @isDemo)`
    );
    for (const sv of data.severityAnalyses) {
      insSev.run({
        ...sv,
        boundingBoxes: JSON.stringify(sv.boundingBoxes),
        isDemo: sv.isDemo ? 1 : 0,
      });
    }

    const insWx = db.prepare(
      `INSERT OR REPLACE INTO weather_records (id, farm_id, district, temperature_c, humidity_pct, rainfall_mm, wind_speed_kmh, condition_label, source, recorded_at, is_demo)
       VALUES (@id, @farmId, @district, @temperatureC, @humidityPct, @rainfallMm, @windSpeedKmh, @conditionLabel, @source, @recordedAt, @isDemo)`
    );
    for (const w of data.weatherRecords) {
      insWx.run({ ...w, isDemo: w.isDemo ? 1 : 0 });
    }

    const insSoil = db.prepare(
      `INSERT OR REPLACE INTO soil_records (id, farm_id, zone_id, soil_moisture_pct, soil_temp_c, soil_ph, nitrogen_ppm, phosphorus_ppm, potassium_ppm, recorded_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @soilMoisturePct, @soilTempC, @soilPh, @nitrogenPpm, @phosphorusPpm, @potassiumPpm, @recordedAt, @isDemo)`
    );
    for (const sl of data.soilRecords) {
      insSoil.run({ ...sl, isDemo: sl.isDemo ? 1 : 0 });
    }

    const insSensor = db.prepare(
      `INSERT OR REPLACE INTO iot_sensors (id, device_uid, name, farm_id, zone_id, hardware_model, firmware_version, status, battery_pct, signal_rssi, last_seen_at, is_demo)
       VALUES (@id, @deviceUid, @name, @farmId, @zoneId, @hardwareModel, @firmwareVersion, @status, @batteryPct, @signalRssi, @lastSeenAt, @isDemo)`
    );
    for (const sn of data.sensors) {
      insSensor.run({ ...sn, isDemo: sn.isDemo ? 1 : 0 });
    }

    const insReading = db.prepare(
      `INSERT OR REPLACE INTO sensor_readings (id, sensor_id, device_uid, farm_id, zone_id, soil_moisture_pct, soil_temp_c, air_temp_c, humidity_pct, soil_ph, recorded_at, is_demo)
       VALUES (@id, @sensorId, @deviceUid, @farmId, @zoneId, @soilMoisturePct, @soilTempC, @airTempC, @humidityPct, @soilPh, @recordedAt, @isDemo)`
    );
    for (const r of data.sensorReadings) {
      insReading.run({ ...r, isDemo: r.isDemo ? 1 : 0 });
    }

    const insThr = db.prepare(
      `INSERT OR REPLACE INTO sensor_thresholds (id, farm_id, crop_type, min_soil_moisture, max_soil_moisture, max_humidity, min_soil_ph, max_soil_ph, max_air_temp, updated_at)
       VALUES (@id, @farmId, @cropType, @minSoilMoisture, @maxSoilMoisture, @maxHumidity, @minSoilPh, @maxSoilPh, @maxAirTemp, @updatedAt)`
    );
    for (const th of data.sensorThresholds) {
      insThr.run(th);
    }

    const insRisk = db.prepare(
      `INSERT OR REPLACE INTO risk_assessments (id, farm_id, zone_id, crop_type, target_disease, risk_score, risk_category, environmental_vs_confirmed, contributing_factors, inspection_priority, recommended_actions, engine_version, assessed_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @cropType, @targetDisease, @riskScore, @riskCategory, @environmentalVsConfirmed, @contributingFactors, @inspectionPriority, @recommendedActions, @engineVersion, @assessedAt, @isDemo)`
    );
    for (const rk of data.riskAssessments) {
      insRisk.run({
        ...rk,
        contributingFactors: JSON.stringify(rk.contributingFactors),
        recommendedActions: JSON.stringify(rk.recommendedActions),
        isDemo: rk.isDemo ? 1 : 0,
      });
    }

    const insAlert = db.prepare(
      `INSERT OR REPLACE INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @category, @severity, @title, @message, @acknowledged, @resolvedAt, @createdAt, @isDemo)`
    );
    for (const al of data.alerts) {
      insAlert.run({ ...al, acknowledged: al.acknowledged ? 1 : 0, isDemo: al.isDemo ? 1 : 0 });
    }

    const insTrt = db.prepare(
      `INSERT OR REPLACE INTO treatments (id, farm_id, zone_id, observation_id, action_type, product_or_method, dosage, applied_by, outcome_status, outcome_notes, expert_verified, applied_at, is_demo)
       VALUES (@id, @farmId, @zoneId, @observationId, @actionType, @productOrMethod, @dosage, @appliedBy, @outcomeStatus, @outcomeNotes, @expertVerified, @appliedAt, @isDemo)`
    );
    for (const tr of data.treatments) {
      insTrt.run({
        ...tr,
        outcomeStatus: tr.outcomeStatus || 'pending_evaluation',
        expertVerified: tr.expertVerified ? 1 : 0,
        isDemo: tr.isDemo ? 1 : 0,
      });
    }

    const insAdv = db.prepare(
      `INSERT OR REPLACE INTO advisory_articles (id, crop_type, disease_name, pathogen, summary, symptoms, risk_factors, favorable_conditions, immediate_actions, preventive_measures, cultural_management, biological_management, organic_treatments, chemical_guidance, verified_treatment_info, article_references, safety_notes, expert_reviewed_by, last_reviewed_at)
       VALUES (@id, @cropType, @diseaseName, @pathogen, @summary, @symptoms, @riskFactors, @favorableConditions, @immediateActions, @preventiveMeasures, @culturalManagement, @biologicalManagement, @organicTreatments, @chemicalGuidance, @verifiedTreatmentInfo, @articleReferences, @safetyNotes, @expertReviewedBy, @lastReviewedAt)`
    );
    for (const a of data.advisoryArticles) {
      insAdv.run({
        ...a,
        symptoms: JSON.stringify(a.symptoms),
        riskFactors: JSON.stringify(a.riskFactors),
        immediateActions: JSON.stringify(a.immediateActions),
        preventiveMeasures: JSON.stringify(a.preventiveMeasures),
        culturalManagement: JSON.stringify(a.culturalManagement),
        biologicalManagement: JSON.stringify(a.biologicalManagement),
        organicTreatments: JSON.stringify(a.organicTreatments),
        chemicalGuidance: JSON.stringify(a.chemicalGuidance),
        articleReferences: JSON.stringify(a.references),
      });
    }

    const insRev = db.prepare(
      `INSERT OR REPLACE INTO expert_review_history (id, observation_id, reviewer_name, reviewer_role, decision, previous_disease, new_disease, previous_severity, new_severity, comment, treatment_recommendation_note, reviewed_at)
       VALUES (@id, @observationId, @reviewerName, @reviewerRole, @decision, @previousDisease, @newDisease, @previousSeverity, @newSeverity, @comment, @treatmentRecommendationNote, @reviewedAt)`
    );
    for (const r of data.expertReviewHistory) {
      insRev.run(r);
    }

    const insOut = db.prepare(
      `INSERT OR REPLACE INTO outbreak_investigations (cluster_id, district, crop_type, dominant_disease, investigation_status, expert_notes, updated_by, updated_at)
       VALUES (@clusterId, @district, @cropType, @dominantDisease, @investigationStatus, @expertNotes, @updatedBy, @updatedAt)`
    );
    for (const o of data.outbreakInvestigations) {
      insOut.run(o);
    }

    const insSetting = db.prepare(`INSERT OR IGNORE INTO integration_settings (key, value) VALUES (?, ?)`);
    insSetting.run('fastApiBaseUrl', process.env.FASTAPI_INFERENCE_URL || 'http://127.0.0.1:8000');
    insSetting.run('inferenceMode', 'demo_sandbox');
    insSetting.run('weatherProvider', 'open_meteo_live');
  });

  insertTransaction();
}
