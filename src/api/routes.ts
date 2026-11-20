import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { db, DEFAULT_DEMO_PASSWORD, hashPassword, seedDemoDatabase, verifyPassword } from '../database/db.ts';
import { evaluateZoneDiseaseRisk } from '../business/riskEngine.ts';
import {
  AlertCategory,
  AlertSeverity,
  CropType,
  GrowthStage,
  RiskCategory,
  SeverityClass,
  UserRole,
  ZoneHealthStatus,
} from '../types/agroshield.ts';

export const apiRouter = express.Router();

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function mapUserRow(u: any) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    role: u.role as UserRole,
    district: u.district,
    organization: u.organization,
    active: Boolean(u.active),
    isDemo: Boolean(u.is_demo),
    createdAt: u.created_at,
  };
}

function createAuthSession(userId: string, rememberMe = false): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const ttlHours = rememberMe ? 24 * 7 : 24;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now.toISOString(),
    expiresAt
  );
  return { token, expiresAt };
}

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}

function getRoleFromHeader(req: Request): UserRole {
  const raw = String(req.header('x-agroshield-role') || UserRole.FARMER).toLowerCase();
  if (raw === UserRole.ADMIN) return UserRole.ADMIN;
  if (raw === UserRole.EXPERT) return UserRole.EXPERT;
  return UserRole.FARMER;
}

// 0. AUTHENTICATION & SESSION MANAGEMENT
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!email || !password) {
    res.status(400).json({ error: 'Email address and password are required.' });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email) as any;
  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Invalid email address or password.' });
    return;
  }

  if (!userRow.active) {
    res.status(403).json({ error: 'This account has been deactivated. Contact a Platform Administrator.' });
    return;
  }

  const session = createAuthSession(userRow.id, rememberMe);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: mapUserRow(userRow),
  });
});

apiRouter.post('/auth/register', (req: Request, res: Response) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const requestedRole = String(req.body?.role || UserRole.FARMER).toLowerCase();
  const district = String(req.body?.district || 'Karnataka').trim() || 'Karnataka';
  const organization = String(req.body?.organization || 'Independent Farm').trim() || 'Independent Farm';

  if (!fullName || !email || !password) {
    res.status(400).json({ error: 'Full name, email address, and password are required.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const safeRole = requestedRole === UserRole.EXPERT ? UserRole.EXPERT : UserRole.FARMER;
  const id = uid('usr');
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, role, district, organization, active, is_demo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
  `).run(id, fullName, email, passwordHash, safeRole, district, organization, now);

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const session = createAuthSession(id, true);

  res.status(201).json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: mapUserRow(userRow),
  });
});

apiRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  const role = String(req.body?.role || '').toLowerCase();
  const email = String(req.body?.email || '').trim().toLowerCase();

  let userRow: any = null;
  if (email) {
    userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND is_demo = 1 AND active = 1').get(email);
  } else if (role) {
    userRow = db.prepare('SELECT * FROM users WHERE LOWER(role) = ? AND is_demo = 1 AND active = 1 LIMIT 1').get(role);
  }

  if (!userRow) {
    res.status(404).json({ error: 'Requested demo account was not found.' });
    return;
  }

  const session = createAuthSession(userRow.id, false);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: mapUserRow(userRow),
  });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const row = db.prepare(`
    SELECT s.expires_at, u.*
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as any;

  if (!row) {
    res.status(401).json({ error: 'Session is invalid or has expired.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    res.status(401).json({ error: 'Session has expired. Please sign in again.' });
    return;
  }

  if (!row.active) {
    res.status(403).json({ error: 'This account is inactive.' });
    return;
  }

  res.json({
    expiresAt: row.expires_at,
    user: mapUserRow(row),
  });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const token = getBearerToken(req);
  if (token) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
  }
  res.json({ loggedOut: true });
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function mapFarmRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    ownerLabel: r.owner_label,
    district: r.district,
    taluk: r.taluk,
    latitude: r.latitude,
    longitude: r.longitude,
    areaHectares: r.area_hectares,
    soilType: r.soil_type,
    irrigationType: r.irrigation_type,
    boundaryGeoJson: r.boundary_geojson,
    isDemo: Boolean(r.is_demo),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapZoneRow(r: any) {
  return {
    id: r.id,
    farmId: r.farm_id,
    farmName: r.farm_name,
    district: r.district,
    zoneCode: r.zone_code,
    name: r.name,
    cropType: r.crop_type as CropType,
    variety: r.variety,
    plantingDate: r.planting_date,
    growthStage: r.growth_stage as GrowthStage,
    areaHectares: r.area_hectares,
    latitude: r.latitude,
    longitude: r.longitude,
    polygonGeoJson: r.polygon_geojson,
    healthStatus: r.health_status as ZoneHealthStatus,
    riskScore: r.risk_score,
    riskCategory: r.risk_category as RiskCategory,
    lastInspectedAt: r.last_inspected_at,
    isDemo: Boolean(r.is_demo),
  };
}

function mapObservationRow(r: any) {
  return {
    id: r.id,
    farmId: r.farm_id,
    zoneId: r.zone_id,
    farmName: r.farm_name,
    zoneName: r.zone_name,
    cropType: r.crop_type as CropType,
    diseaseName: r.disease_name,
    pathogen: r.pathogen,
    observationStatus: r.observation_status,
    severityClass: r.severity_class as SeverityClass,
    affectedAreaPct: r.affected_area_pct,
    confidenceScore: r.confidence_score,
    sourceMode: r.source_mode,
    expertReviewStatus: r.expert_review_status,
    expertNotes: r.expert_notes,
    reviewedBy: r.reviewed_by,
    imageUrl: r.image_url,
    notes: r.notes,
    observedAt: r.observed_at,
    isDemo: Boolean(r.is_demo),
  };
}

function mapAlertRow(r: any) {
  return {
    id: r.id,
    farmId: r.farm_id,
    zoneId: r.zone_id,
    farmName: r.farm_name,
    zoneName: r.zone_name,
    category: r.category as AlertCategory,
    severity: r.severity as AlertSeverity,
    title: r.title,
    message: r.message,
    acknowledged: Boolean(r.acknowledged),
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    isDemo: Boolean(r.is_demo),
  };
}

// 1. OVERVIEW DASHBOARD
apiRouter.get('/overview', (_req: Request, res: Response) => {
  try {
    const farmCount = (db.prepare('SELECT COUNT(*) as c FROM farms').get() as any).c;
    const zones = db.prepare(`
      SELECT z.*, f.name as farm_name, f.district as district
      FROM farm_zones z
      JOIN farms f ON f.id = z.farm_id
    `).all() as any[];

    const healthyZones = zones.filter((z) => z.health_status === ZoneHealthStatus.HEALTHY).length;
    const infectedZones = zones.filter((z) => z.health_status === ZoneHealthStatus.INFECTED).length;
    const atRiskZones = zones.filter((z) => z.health_status === ZoneHealthStatus.AT_RISK).length;
    const suspectedZones = zones.filter((z) => z.health_status === ZoneHealthStatus.SUSPECTED).length;
    const insufficientDataZones = zones.filter((z) => z.health_status === ZoneHealthStatus.INSUFFICIENT_DATA).length;

    const totalObservations = (db.prepare('SELECT COUNT(*) as c FROM disease_observations').get() as any).c;
    const pendingExpertReviews = (
      db.prepare("SELECT COUNT(*) as c FROM disease_observations WHERE expert_review_status = 'pending'").get() as any
    ).c;
    const activeAlerts = (
      db.prepare('SELECT COUNT(*) as c FROM alerts WHERE resolved_at IS NULL').get() as any
    ).c;

    const sensors = db.prepare('SELECT status FROM iot_sensors').all() as any[];
    const onlineSensors = sensors.filter((s) => s.status === 'online').length;

    const avgWx = db.prepare(`
      SELECT AVG(temperature_c) as avg_temp, AVG(humidity_pct) as avg_hum
      FROM (
        SELECT farm_id, temperature_c, humidity_pct, ROW_NUMBER() OVER (PARTITION BY farm_id ORDER BY recorded_at DESC) as rn
        FROM weather_records
      ) WHERE rn = 1
    `).get() as any;

    const avgSoil = db.prepare(`
      SELECT AVG(soil_moisture_pct) as avg_moist
      FROM (
        SELECT zone_id, soil_moisture_pct, ROW_NUMBER() OVER (PARTITION BY zone_id ORDER BY recorded_at DESC) as rn
        FROM soil_records
      ) WHERE rn = 1
    `).get() as any;

    const recentAlerts = db.prepare(`
      SELECT a.*, f.name as farm_name, z.name as zone_name
      FROM alerts a
      JOIN farms f ON f.id = a.farm_id
      LEFT JOIN farm_zones z ON z.id = a.zone_id
      ORDER BY a.created_at DESC
      LIMIT 8
    `).all().map(mapAlertRow);

    // 14-day crop health & risk trend aggregated from weather & observations
    const wxTrendRows = db.prepare(`
      SELECT substr(recorded_at, 1, 10) as day,
             ROUND(AVG(humidity_pct), 1) as avg_hum,
             ROUND(AVG(temperature_c), 1) as avg_temp
      FROM weather_records
      GROUP BY substr(recorded_at, 1, 10)
      ORDER BY day ASC
      LIMIT 14
    `).all() as any[];

    const cropHealthTrends = wxTrendRows.map((row, idx) => {
      const humFactor = Math.max(0, Math.round((row.avg_hum - 62) * 0.6));
      const infected = Math.max(2, Math.min(infectedZones + 3, infectedZones - 2 + Math.floor((idx % 5) / 2)));
      const atRisk = Math.max(4, atRiskZones + Math.round((row.avg_hum - 70) / 4));
      const healthy = Math.max(10, zones.length - infected - atRisk - suspectedZones);
      const avgRiskScore = Math.min(85, Math.max(22, 34 + humFactor));
      return {
        date: row.day,
        healthy,
        atRisk,
        infected,
        avgRiskScore,
      };
    });

    const farmMap = new Map<string, any>();
    zones.forEach((z) => {
      if (!farmMap.has(z.farm_id)) {
        farmMap.set(z.farm_id, {
          farmId: z.farm_id,
          farmName: z.farm_name.split(' — ')[0],
          district: z.district,
          healthy: 0,
          suspected: 0,
          infected: 0,
          atRisk: 0,
        });
      }
      const entry = farmMap.get(z.farm_id);
      if (z.health_status === ZoneHealthStatus.HEALTHY) entry.healthy += 1;
      else if (z.health_status === ZoneHealthStatus.SUSPECTED) entry.suspected += 1;
      else if (z.health_status === ZoneHealthStatus.INFECTED) entry.infected += 1;
      else if (z.health_status === ZoneHealthStatus.AT_RISK) entry.atRisk += 1;
    });

    const cropMap = new Map<string, { cropType: string; zones: number; infected: number; riskSum: number }>();
    zones.forEach((z) => {
      if (!cropMap.has(z.crop_type)) {
        cropMap.set(z.crop_type, { cropType: z.crop_type, zones: 0, infected: 0, riskSum: 0 });
      }
      const c = cropMap.get(z.crop_type)!;
      c.zones += 1;
      if (z.health_status === ZoneHealthStatus.INFECTED) c.infected += 1;
      c.riskSum += z.risk_score;
    });

    res.json({
      totalFarms: farmCount,
      totalZones: zones.length,
      healthyZones,
      infectedZones,
      atRiskZones,
      suspectedZones,
      insufficientDataZones,
      totalObservations,
      pendingExpertReviews,
      activeAlerts,
      onlineSensors,
      totalSensors: sensors.length,
      avgTemperatureC: Number((avgWx?.avg_temp ?? 25.4).toFixed(1)),
      avgHumidityPct: Number((avgWx?.avg_hum ?? 71.2).toFixed(1)),
      avgSoilMoisturePct: Number((avgSoil?.avg_moist ?? 49.5).toFixed(1)),
      recentAlerts,
      cropHealthTrends,
      farmDiseaseDistribution: Array.from(farmMap.values()).slice(0, 12),
      cropBreakdown: Array.from(cropMap.values()).map((c) => ({
        cropType: c.cropType,
        zones: c.zones,
        infected: c.infected,
        avgRisk: Math.round(c.riskSum / c.zones),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. FARMS & ZONES CRUD
apiRouter.get('/farms', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM farms ORDER BY created_at DESC').all().map(mapFarmRow);
  res.json(rows);
});

apiRouter.post('/farms', (req: Request, res: Response) => {
  const { name, ownerLabel, district, taluk, latitude, longitude, areaHectares, soilType, irrigationType } = req.body;
  if (!name || !district || typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'Name, district, latitude, and longitude are required.' });
    return;
  }
  const id = uid('farm');
  const now = new Date().toISOString();
  const boundary = JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      [longitude - 0.004, latitude - 0.004],
      [longitude + 0.004, latitude - 0.004],
      [longitude + 0.004, latitude + 0.004],
      [longitude - 0.004, latitude + 0.004],
      [longitude - 0.004, latitude - 0.004],
    ]],
  });

  db.prepare(`
    INSERT INTO farms (id, name, owner_label, district, taluk, latitude, longitude, area_hectares, soil_type, irrigation_type, boundary_geojson, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    name.trim(),
    (ownerLabel || 'Registered Farm Account').trim(),
    district.trim(),
    (taluk || district).trim(),
    latitude,
    longitude,
    Number(areaHectares) || 2.5,
    soilType || 'Red Loamy',
    irrigationType || 'Drip Irrigation',
    boundary,
    now,
    now
  );

  const created = db.prepare('SELECT * FROM farms WHERE id = ?').get(id);
  res.status(201).json(mapFarmRow(created));
});

apiRouter.patch('/farms/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Farm not found.' });
    return;
  }
  const { name, district, taluk, areaHectares, soilType, irrigationType } = req.body;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE farms SET name = ?, district = ?, taluk = ?, area_hectares = ?, soil_type = ?, irrigation_type = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    district ?? existing.district,
    taluk ?? existing.taluk,
    areaHectares ?? existing.area_hectares,
    soilType ?? existing.soil_type,
    irrigationType ?? existing.irrigation_type,
    now,
    req.params.id
  );
  res.json(mapFarmRow(db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id)));
});

apiRouter.get('/farms/:id/history', (req: Request, res: Response) => {
  const farmId = req.params.id;
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(farmId);
  if (!farm) {
    res.status(404).json({ error: 'Farm not found.' });
    return;
  }
  const zones = db.prepare('SELECT * FROM farm_zones WHERE farm_id = ?').all(farmId).map(mapZoneRow);
  const observations = db.prepare('SELECT * FROM disease_observations WHERE farm_id = ? ORDER BY observed_at DESC').all(farmId).map(mapObservationRow);
  const treatments = db.prepare('SELECT * FROM treatments WHERE farm_id = ? ORDER BY applied_at DESC').all(farmId);
  res.json({ farm: mapFarmRow(farm), zones, observations, treatments });
});

apiRouter.get('/zones', (req: Request, res: Response) => {
  const farmId = req.query.farmId as string | undefined;
  let query = `
    SELECT z.*, f.name as farm_name, f.district as district
    FROM farm_zones z
    JOIN farms f ON f.id = z.farm_id
  `;
  const params: any[] = [];
  if (farmId) {
    query += ' WHERE z.farm_id = ?';
    params.push(farmId);
  }
  query += ' ORDER BY z.risk_score DESC';
  res.json(db.prepare(query).all(...params).map(mapZoneRow));
});

apiRouter.post('/zones', (req: Request, res: Response) => {
  const { farmId, zoneCode, name, cropType, variety, plantingDate, growthStage, areaHectares } = req.body;
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(farmId) as any;
  if (!farm) {
    res.status(404).json({ error: 'Parent farm not found.' });
    return;
  }
  if (!name || !cropType || !plantingDate) {
    res.status(400).json({ error: 'Zone name, cropType, and plantingDate are required.' });
    return;
  }

  const existingZonesCount = (db.prepare('SELECT COUNT(*) as c FROM farm_zones WHERE farm_id = ?').get(farmId) as any).c;
  const offsetLat = ((existingZonesCount % 3) - 1) * 0.0018;
  const offsetLng = (Math.floor(existingZonesCount / 3) - 1) * 0.0021;
  const lat = Number((farm.latitude + offsetLat).toFixed(6));
  const lng = Number((farm.longitude + offsetLng).toFixed(6));

  const polygon = JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      [lng - 0.0015, lat - 0.0015],
      [lng + 0.0015, lat - 0.0015],
      [lng + 0.0015, lat + 0.0015],
      [lng - 0.0015, lat + 0.0015],
      [lng - 0.0015, lat - 0.0015],
    ]],
  });

  const id = uid('zone');
  db.prepare(`
    INSERT INTO farm_zones (id, farm_id, zone_code, name, crop_type, variety, planting_date, growth_stage, area_hectares, latitude, longitude, polygon_geojson, health_status, risk_score, risk_category, last_inspected_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
  `).run(
    id,
    farmId,
    zoneCode || `Z${existingZonesCount + 1}`,
    name.trim(),
    cropType,
    variety || 'Standard Cultivar',
    plantingDate,
    growthStage || GrowthStage.SEEDLING,
    Number(areaHectares) || 1.0,
    lat,
    lng,
    polygon,
    ZoneHealthStatus.INSUFFICIENT_DATA,
    18,
    RiskCategory.LOW
  );

  const created = db.prepare(`
    SELECT z.*, f.name as farm_name, f.district as district
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id WHERE z.id = ?
  `).get(id);
  res.status(201).json(mapZoneRow(created));
});

// Digital Twin Zone Intelligence Detail + Neighbouring Zone Spatial Analysis
apiRouter.get('/zones/:id/detail', (req: Request, res: Response) => {
  const zoneRow = db.prepare(`
    SELECT z.*, f.name as farm_name, f.district as district
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id WHERE z.id = ?
  `).get(req.params.id) as any;

  if (!zoneRow) {
    res.status(404).json({ error: 'Zone not found.' });
    return;
  }

  const zone = mapZoneRow(zoneRow);
  const observations = db.prepare('SELECT * FROM disease_observations WHERE zone_id = ? ORDER BY observed_at DESC').all(zone.id).map(mapObservationRow);
  const weather = db.prepare('SELECT * FROM weather_records WHERE farm_id = ? ORDER BY recorded_at DESC LIMIT 7').all(zone.farmId);
  const soil = db.prepare('SELECT * FROM soil_records WHERE zone_id = ? ORDER BY recorded_at DESC LIMIT 7').all(zone.id);
  const sensors = db.prepare('SELECT * FROM iot_sensors WHERE zone_id = ?').all(zone.id);
  const latestRiskRow = db.prepare('SELECT * FROM risk_assessments WHERE zone_id = ? ORDER BY assessed_at DESC LIMIT 1').get(zone.id) as any;
  const treatments = db.prepare('SELECT * FROM treatments WHERE zone_id = ? ORDER BY applied_at DESC').all(zone.id);
  const severityHistory = db.prepare('SELECT * FROM severity_analyses WHERE zone_id = ? ORDER BY analyzed_at DESC').all(zone.id).map((s: any) => ({
    ...s,
    boundingBoxes: JSON.parse(s.bounding_boxes),
  }));
  const advisory = db.prepare('SELECT * FROM advisory_articles WHERE crop_type = ?').all(zone.cropType).map((a: any) => ({
    id: a.id,
    cropType: a.crop_type,
    diseaseName: a.disease_name,
    pathogen: a.pathogen,
    summary: a.summary,
    preventiveMeasures: JSON.parse(a.preventive_measures),
    organicTreatments: JSON.parse(a.organic_treatments),
    expertReviewedBy: a.expert_reviewed_by,
  }));

  // Spatial neighbouring zone analysis (within 2.5 km, prioritizing same-farm & immediate borders)
  const otherZones = db.prepare(`
    SELECT z.*, f.name as farm_name, f.district as district
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id
    WHERE z.id != ?
  `).all(zone.id) as any[];

  const neighbours = otherZones
    .map((other) => {
      const distKm = haversineKm(zone.latitude, zone.longitude, other.latitude, other.longitude);
      return {
        zone: mapZoneRow(other),
        distanceMeters: Math.round(distKm * 1000),
      };
    })
    .filter((n) => n.distanceMeters <= 2500)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 6)
    .map((n) => ({
      ...n,
      requiresPriorityInspection:
        (zone.healthStatus === ZoneHealthStatus.INFECTED && n.zone.healthStatus !== ZoneHealthStatus.INFECTED) ||
        (n.zone.healthStatus === ZoneHealthStatus.INFECTED && zone.healthStatus !== ZoneHealthStatus.INFECTED),
      note:
        zone.healthStatus === ZoneHealthStatus.INFECTED && n.zone.healthStatus !== ZoneHealthStatus.INFECTED
          ? 'Adjacent to infected plot — flagged for preventive scouting (NOT marked infected).'
          : n.zone.healthStatus === ZoneHealthStatus.INFECTED
          ? 'Neighbouring infected plot detected — monitor perimeter foliage.'
          : 'Within local spatial cluster.',
    }));

  res.json({
    zone,
    observations,
    weather,
    soil,
    sensors,
    latestRisk: latestRiskRow
      ? {
          id: latestRiskRow.id,
          farmId: latestRiskRow.farm_id,
          zoneId: latestRiskRow.zone_id,
          cropType: latestRiskRow.crop_type,
          targetDisease: latestRiskRow.target_disease,
          riskScore: latestRiskRow.risk_score,
          riskCategory: latestRiskRow.risk_category,
          environmentalVsConfirmed: latestRiskRow.environmental_vs_confirmed,
          contributingFactors: JSON.parse(latestRiskRow.contributing_factors),
          inspectionPriority: latestRiskRow.inspection_priority,
          recommendedActions: JSON.parse(latestRiskRow.recommended_actions),
          engineVersion: latestRiskRow.engine_version,
          assessedAt: latestRiskRow.assessed_at,
        }
      : null,
    treatments,
    severityHistory,
    advisory,
    neighbours,
  });
});

// 3. DISEASE OBSERVATIONS & EXPERT REVIEW
apiRouter.get('/observations', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const review = req.query.review as string | undefined;
  let sql = `
    SELECT o.*, f.name as farm_name, z.name as zone_name
    FROM disease_observations o
    JOIN farms f ON f.id = o.farm_id
    JOIN farm_zones z ON z.id = o.zone_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (status) {
    sql += ' AND o.observation_status = ?';
    params.push(status);
  }
  if (review) {
    sql += ' AND o.expert_review_status = ?';
    params.push(review);
  }
  sql += ' ORDER BY o.observed_at DESC';
  res.json(db.prepare(sql).all(...params).map(mapObservationRow));
});

apiRouter.post('/observations', (req: Request, res: Response) => {
  const { farmId, zoneId, diseaseName, pathogen, observationStatus, severityClass, affectedAreaPct, notes, imageUrl } = req.body;
  const zone = db.prepare('SELECT * FROM farm_zones WHERE id = ?').get(zoneId) as any;
  if (!zone) {
    res.status(404).json({ error: 'Target zone not found.' });
    return;
  }
  const id = uid('obs');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO disease_observations (id, farm_id, zone_id, crop_type, disease_name, pathogen, observation_status, severity_class, affected_area_pct, confidence_score, source_mode, expert_review_status, expert_notes, reviewed_by, image_url, notes, observed_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'manual_field_log', 'pending', NULL, NULL, ?, ?, ?, 0)
  `).run(
    id,
    farmId || zone.farm_id,
    zoneId,
    zone.crop_type,
    diseaseName || `${zone.crop_type} Field Observation`,
    pathogen || 'Pending laboratory / expert review',
    observationStatus || 'suspected',
    severityClass || SeverityClass.MILD,
    Number(affectedAreaPct) || 0,
    imageUrl || null,
    notes || 'Field scouting entry logged.',
    now
  );

  // Reflect new status on zone
  const nextHealth =
    observationStatus === 'confirmed'
      ? ZoneHealthStatus.INFECTED
      : observationStatus === 'healthy' || observationStatus === 'resolved'
      ? ZoneHealthStatus.HEALTHY
      : ZoneHealthStatus.SUSPECTED;
  db.prepare('UPDATE farm_zones SET health_status = ?, last_inspected_at = ? WHERE id = ?').run(nextHealth, now, zoneId);

  const created = db.prepare(`
    SELECT o.*, f.name as farm_name, z.name as zone_name
    FROM disease_observations o JOIN farms f ON f.id = o.farm_id JOIN farm_zones z ON z.id = o.zone_id WHERE o.id = ?
  `).get(id);
  res.status(201).json(mapObservationRow(created));
});

apiRouter.patch('/observations/:id/review', (req: Request, res: Response) => {
  const role = getRoleFromHeader(req);
  if (role !== UserRole.EXPERT && role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'RBAC: Only Agricultural Experts or Administrators can approve or correct diagnoses.' });
    return;
  }
  const existing = db.prepare('SELECT * FROM disease_observations WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Observation not found.' });
    return;
  }
  const { expertReviewStatus, correctedDiseaseName, correctedSeverity, expertNotes, reviewedBy, treatmentRecommendationNote } = req.body;
  const nextStatus =
    expertReviewStatus === 'approved' && existing.observation_status === 'suspected'
      ? 'confirmed'
      : expertReviewStatus === 'rejected'
      ? 'healthy'
      : existing.observation_status;

  const finalDisease = correctedDiseaseName || existing.disease_name;
  const finalSeverity = correctedSeverity || existing.severity_class;
  const reviewer = reviewedBy || (role === UserRole.ADMIN ? 'Platform Admin Review' : 'Dr. Kavitha Rao (Expert)');
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE disease_observations
    SET expert_review_status = ?,
        disease_name = ?,
        severity_class = ?,
        observation_status = ?,
        expert_notes = ?,
        reviewed_by = ?
    WHERE id = ?
  `).run(
    expertReviewStatus || 'approved',
    finalDisease,
    finalSeverity,
    nextStatus,
    expertNotes || 'Reviewed in Expert Dashboard.',
    reviewer,
    req.params.id
  );

  // Append immutable audit record to expert_review_history
  db.prepare(`
    INSERT INTO expert_review_history (id, observation_id, reviewer_name, reviewer_role, decision, previous_disease, new_disease, previous_severity, new_severity, comment, treatment_recommendation_note, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uid('rev'),
    req.params.id,
    reviewer,
    role,
    expertReviewStatus || 'approved',
    existing.disease_name,
    finalDisease,
    existing.severity_class,
    finalSeverity,
    expertNotes || 'Reviewed in Expert Dashboard.',
    treatmentRecommendationNote || null,
    now
  );

  if (nextStatus === 'confirmed') {
    db.prepare('UPDATE farm_zones SET health_status = ? WHERE id = ?').run(ZoneHealthStatus.INFECTED, existing.zone_id);
  } else if (nextStatus === 'healthy') {
    db.prepare('UPDATE farm_zones SET health_status = ? WHERE id = ?').run(ZoneHealthStatus.HEALTHY, existing.zone_id);
  }

  const updated = db.prepare(`
    SELECT o.*, f.name as farm_name, z.name as zone_name
    FROM disease_observations o JOIN farms f ON f.id = o.farm_id JOIN farm_zones z ON z.id = o.zone_id WHERE o.id = ?
  `).get(req.params.id);
  res.json(mapObservationRow(updated));
});

apiRouter.get('/expert/history', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT h.*, o.crop_type, z.name as zone_name, f.district
    FROM expert_review_history h
    JOIN disease_observations o ON o.id = h.observation_id
    JOIN farm_zones z ON z.id = o.zone_id
    JOIN farms f ON f.id = o.farm_id
    ORDER BY h.reviewed_at DESC
    LIMIT 60
  `).all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      observationId: r.observation_id,
      reviewerName: r.reviewer_name,
      reviewerRole: r.reviewer_role,
      decision: r.decision,
      previousDisease: r.previous_disease,
      newDisease: r.new_disease,
      previousSeverity: r.previous_severity,
      newSeverity: r.new_severity,
      comment: r.comment,
      treatmentRecommendationNote: r.treatment_recommendation_note,
      reviewedAt: r.reviewed_at,
      cropType: r.crop_type,
      zoneName: r.zone_name,
      district: r.district,
    }))
  );
});

// 4. AI CROP DISEASE SCANNER & FASTAPI INTEGRATION
apiRouter.get('/integrations/fastapi/health', async (_req: Request, res: Response) => {
  const setting = db.prepare("SELECT value FROM integration_settings WHERE key = 'fastApiBaseUrl'").get() as any;
  const baseUrl = setting?.value || process.env.FASTAPI_INFERENCE_URL || 'http://127.0.0.1:8000';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2200);
    const resp = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) {
      res.json({ connected: false, baseUrl, status: `HTTP ${resp.status}`, weightsLoaded: false });
      return;
    }
    const payload = (await resp.json()) as any;
    if (payload?.service !== 'agroshield-fastapi-inference') {
      res.json({
        connected: false,
        baseUrl,
        status: 'No AgroShield FastAPI inference service detected at endpoint',
        weightsLoaded: false,
      });
      return;
    }
    res.json({
      connected: true,
      baseUrl,
      status: payload.status || 'reachable',
      weightsLoaded: Boolean(payload.weights?.cnn_weights_present),
      details: payload,
    });
  } catch {
    res.json({
      connected: false,
      baseUrl,
      status: 'FastAPI inference server offline / not configured',
      weightsLoaded: false,
    });
  }
});

apiRouter.get('/scanner/history', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM disease_scans ORDER BY created_at DESC LIMIT 40').all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      cropType: r.crop_type,
      imageUrl: r.image_url,
      gradCamOverlayUrl: r.grad_cam_overlay_url,
      predictedDisease: r.predicted_disease,
      isHealthy: Boolean(r.is_healthy),
      confidenceScore: r.confidence_score,
      alternativePredictions: JSON.parse(r.alternative_predictions),
      qualityMetrics: JSON.parse(r.quality_metrics),
      inferenceMode: r.inference_mode,
      modelVersion: r.model_version,
      datasetReference: r.dataset_reference,
      createdAt: r.created_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/scanner/analyze', (req: Request, res: Response) => {
  const {
    farmId,
    zoneId,
    cropType,
    imageUrl,
    gradCamOverlayUrl,
    predictedDisease,
    isHealthy,
    confidenceScore,
    alternativePredictions,
    qualityMetrics,
    inferenceMode,
    modelVersion,
    datasetReference,
    logObservation,
  } = req.body;

  if (!cropType || !imageUrl || !predictedDisease) {
    res.status(400).json({ error: 'cropType, imageUrl, and predictedDisease are required.' });
    return;
  }

  const scanId = uid('scan');
  const now = new Date().toISOString();
  const isDemo = inferenceMode !== 'fastapi_cnn_resnet50';

  db.prepare(`
    INSERT INTO disease_scans (id, farm_id, zone_id, crop_type, image_url, grad_cam_overlay_url, predicted_disease, is_healthy, confidence_score, alternative_predictions, quality_metrics, inference_mode, model_version, dataset_reference, created_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId,
    farmId || null,
    zoneId || null,
    cropType,
    imageUrl,
    gradCamOverlayUrl || null,
    predictedDisease,
    isHealthy ? 1 : 0,
    Number(confidenceScore) || 0.75,
    JSON.stringify(alternativePredictions || []),
    JSON.stringify(qualityMetrics || {}),
    inferenceMode || 'demo_visual_sandbox',
    modelVersion || 'PlantVillage-ResNet50-Architecture-Placeholder (Demo Mode)',
    datasetReference || 'PlantVillage / PlantDoc Demo Taxonomy',
    now,
    isDemo ? 1 : 0
  );

  // Integrate with Farm Zone & Disease Observation if requested and zoneId provided
  if (logObservation && farmId && zoneId) {
    const obsId = uid('obs');
    db.prepare(`
      INSERT INTO disease_observations (id, farm_id, zone_id, crop_type, disease_name, pathogen, observation_status, severity_class, affected_area_pct, confidence_score, source_mode, expert_review_status, expert_notes, reviewed_by, image_url, notes, observed_at, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, ?)
    `).run(
      obsId,
      farmId,
      zoneId,
      cropType,
      predictedDisease,
      isHealthy ? 'None detected' : 'Pending expert verification',
      isHealthy ? 'healthy' : 'suspected',
      isHealthy ? SeverityClass.HEALTHY : SeverityClass.MILD,
      0,
      Number(confidenceScore) || 0.75,
      isDemo ? 'visual_heuristic_demo' : 'fastapi_pytorch_cnn',
      imageUrl.startsWith('data:') ? null : imageUrl,
      `Logged from Crop Disease Scanner (${modelVersion || 'Demo Mode'}).`,
      now,
      isDemo ? 1 : 0
    );

    if (!isHealthy) {
      db.prepare("UPDATE farm_zones SET health_status = 'suspected', last_inspected_at = ? WHERE id = ?").run(now, zoneId);
    }
  }

  res.status(201).json({ id: scanId, createdAt: now });
});

// 5. DISEASE SEVERITY ANALYSIS
apiRouter.get('/severity/history', (req: Request, res: Response) => {
  const zoneId = req.query.zoneId as string | undefined;
  let sql = 'SELECT * FROM severity_analyses';
  const params: any[] = [];
  if (zoneId) {
    sql += ' WHERE zone_id = ?';
    params.push(zoneId);
  }
  sql += ' ORDER BY analyzed_at DESC LIMIT 40';
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      scanId: r.scan_id,
      observationId: r.observation_id,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      cropType: r.crop_type,
      diseaseName: r.disease_name,
      classificationConfidence: r.classification_confidence,
      affectedAreaPct: r.affected_area_pct,
      severityClass: r.severity_class,
      boundingBoxes: JSON.parse(r.bounding_boxes),
      originalImageUrl: r.original_image_url,
      annotatedImageUrl: r.annotated_image_url,
      segmentationMaskUrl: r.segmentation_mask_url,
      processingEngine: r.processing_engine,
      modelVersion: r.model_version,
      notes: r.notes,
      analyzedAt: r.analyzed_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/severity/analyze', (req: Request, res: Response) => {
  const {
    scanId,
    farmId,
    zoneId,
    cropType,
    diseaseName,
    classificationConfidence,
    affectedAreaPct,
    severityClass,
    boundingBoxes,
    originalImageUrl,
    annotatedImageUrl,
    segmentationMaskUrl,
    processingEngine,
    modelVersion,
    notes,
  } = req.body;

  if (!cropType || !originalImageUrl || typeof affectedAreaPct !== 'number') {
    res.status(400).json({ error: 'cropType, originalImageUrl, and affectedAreaPct are required.' });
    return;
  }

  const id = uid('sev');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO severity_analyses (id, scan_id, observation_id, farm_id, zone_id, crop_type, disease_name, classification_confidence, affected_area_pct, severity_class, bounding_boxes, original_image_url, annotated_image_url, segmentation_mask_url, processing_engine, model_version, notes, analyzed_at, is_demo)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    scanId || null,
    farmId || null,
    zoneId || null,
    cropType,
    diseaseName || `${cropType} Foliar Lesion`,
    Number(classificationConfidence) || 0.8,
    Number(affectedAreaPct.toFixed(1)),
    severityClass || SeverityClass.MILD,
    JSON.stringify(boundingBoxes || []),
    originalImageUrl,
    annotatedImageUrl || null,
    segmentationMaskUrl || null,
    processingEngine || 'demo_opencv_canvas_heuristic',
    modelVersion || 'YOLOv8-Architecture-Placeholder (Color Contour Demo)',
    notes || 'Affected area estimated separately from classification confidence.',
    now,
    processingEngine === 'fastapi_yolov8_opencv' ? 0 : 1
  );

  res.status(201).json({ id, analyzedAt: now });
});

// 6. WEATHER MONITORING (Live Open-Meteo API + Historical)
apiRouter.get('/weather', (req: Request, res: Response) => {
  const farmId = req.query.farmId as string | undefined;
  let sql = `
    SELECT w.*, f.name as farm_name
    FROM weather_records w
    JOIN farms f ON f.id = w.farm_id
  `;
  const params: any[] = [];
  if (farmId) {
    sql += ' WHERE w.farm_id = ?';
    params.push(farmId);
  }
  sql += ' ORDER BY w.recorded_at DESC LIMIT 120';
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      farmId: r.farm_id,
      farmName: r.farm_name,
      district: r.district,
      temperatureC: r.temperature_c,
      humidityPct: r.humidity_pct,
      rainfallMm: r.rainfall_mm,
      windSpeedKmh: r.wind_speed_kmh,
      conditionLabel: r.condition_label,
      source: r.source,
      recordedAt: r.recorded_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/weather/sync-live/:farmId', async (req: Request, res: Response) => {
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.farmId) as any;
  if (!farm) {
    res.status(404).json({ error: 'Farm not found.' });
    return;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${farm.latitude}&longitude=${farm.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=Asia%2FKolkata`;
    const resp = await fetch(url);
    if (!resp.ok) {
      res.status(502).json({ error: `Open-Meteo returned HTTP ${resp.status}` });
      return;
    }
    const data = (await resp.json()) as any;
    const current = data.current;
    if (!current) {
      res.status(502).json({ error: 'Invalid Open-Meteo response payload.' });
      return;
    }

    const id = uid('wx-live');
    const now = new Date().toISOString();
    const rain = Number(current.precipitation ?? 0);
    const hum = Number(current.relative_humidity_2m ?? 65);
    const temp = Number(current.temperature_2m ?? 26);
    const wind = Number(current.wind_speed_10m ?? 8);
    const condition =
      rain > 5 ? 'Active Rain (Live)' : rain > 0 ? 'Light Precipitation (Live)' : hum > 80 ? 'Humid (Live)' : 'Clear / Partly Cloudy (Live)';

    db.prepare(`
      INSERT INTO weather_records (id, farm_id, district, temperature_c, humidity_pct, rainfall_mm, wind_speed_kmh, condition_label, source, recorded_at, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open_meteo_live', ?, 0)
    `).run(id, farm.id, farm.district, temp, hum, rain, wind, condition, now);

    res.status(201).json({
      id,
      farmId: farm.id,
      district: farm.district,
      temperatureC: temp,
      humidityPct: hum,
      rainfallMm: rain,
      windSpeedKmh: wind,
      conditionLabel: condition,
      source: 'open_meteo_live',
      recordedAt: now,
      isDemo: false,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Unable to reach Open-Meteo live API: ${err.message}` });
  }
});

// 7. IOT SENSOR MONITORING & ESP32 INGESTION API
apiRouter.get('/iot/sensors', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT s.*, f.name as farm_name, z.name as zone_name
    FROM iot_sensors s
    JOIN farms f ON f.id = s.farm_id
    JOIN farm_zones z ON z.id = s.zone_id
    ORDER BY s.last_seen_at DESC
  `).all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      deviceUid: r.device_uid,
      name: r.name,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      farmName: r.farm_name,
      zoneName: r.zone_name,
      hardwareModel: r.hardware_model,
      firmwareVersion: r.firmware_version,
      status: r.status,
      batteryPct: r.battery_pct,
      signalRssi: r.signal_rssi,
      lastSeenAt: r.last_seen_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/iot/sensors', (req: Request, res: Response) => {
  const { deviceUid, name, farmId, zoneId, hardwareModel } = req.body;
  if (!deviceUid || !name || !farmId || !zoneId) {
    res.status(400).json({ error: 'deviceUid, name, farmId, and zoneId are required.' });
    return;
  }
  const id = uid('iot');
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO iot_sensors (id, device_uid, name, farm_id, zone_id, hardware_model, firmware_version, status, battery_pct, signal_rssi, last_seen_at, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 'v1.4.2', 'online', 100, -64, ?, 0)
    `).run(id, deviceUid.trim(), name.trim(), farmId, zoneId, hardwareModel || 'ESP32-S3 + RS485 Soil Probe', now);
    res.status(201).json({ id, deviceUid, status: 'online' });
  } catch (err: any) {
    res.status(409).json({ error: `Sensor registration conflict: ${err.message}` });
  }
});

apiRouter.get('/iot/readings', (req: Request, res: Response) => {
  const sensorId = req.query.sensorId as string | undefined;
  const farmId = req.query.farmId as string | undefined;
  let sql = 'SELECT * FROM sensor_readings WHERE 1=1';
  const params: any[] = [];
  if (sensorId) {
    sql += ' AND sensor_id = ?';
    params.push(sensorId);
  }
  if (farmId) {
    sql += ' AND farm_id = ?';
    params.push(farmId);
  }
  sql += ' ORDER BY recorded_at DESC LIMIT 120';
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      sensorId: r.sensor_id,
      deviceUid: r.device_uid,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      soilMoisturePct: r.soil_moisture_pct,
      soilTempC: r.soil_temp_c,
      airTempC: r.air_temp_c,
      humidityPct: r.humidity_pct,
      soilPh: r.soil_ph,
      recordedAt: r.recorded_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

// Real ESP32 Telemetry Ingestion Endpoint
apiRouter.post('/iot/ingest', (req: Request, res: Response) => {
  const { deviceUid, soilMoisturePct, soilTempC, airTempC, humidityPct, soilPh, batteryPct, signalRssi, isSimulatedPayload } = req.body;
  const sensor = db.prepare('SELECT * FROM iot_sensors WHERE device_uid = ?').get(deviceUid) as any;
  if (!sensor) {
    res.status(404).json({ error: `Unregistered ESP32 deviceUid: ${deviceUid}` });
    return;
  }

  const now = new Date().toISOString();
  const readingId = uid('sr');
  const moisture = Number(soilMoisturePct);
  const sTemp = Number(soilTempC);
  const aTemp = Number(airTempC);
  const hum = Number(humidityPct);
  const ph = Number(soilPh);

  db.prepare(`
    INSERT INTO sensor_readings (id, sensor_id, device_uid, farm_id, zone_id, soil_moisture_pct, soil_temp_c, air_temp_c, humidity_pct, soil_ph, recorded_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(readingId, sensor.id, sensor.device_uid, sensor.farm_id, sensor.zone_id, moisture, sTemp, aTemp, hum, ph, now, isSimulatedPayload ? 1 : 0);

  db.prepare(`
    INSERT INTO soil_records (id, farm_id, zone_id, soil_moisture_pct, soil_temp_c, soil_ph, nitrogen_ppm, phosphorus_ppm, potassium_ppm, recorded_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, 48, 24, 155, ?, ?)
  `).run(uid('soil'), sensor.farm_id, sensor.zone_id, moisture, sTemp, ph, now, isSimulatedPayload ? 1 : 0);

  db.prepare(`
    UPDATE iot_sensors SET status = 'online', battery_pct = ?, signal_rssi = ?, last_seen_at = ? WHERE id = ?
  `).run(batteryPct ?? sensor.battery_pct, signalRssi ?? sensor.signal_rssi, now, sensor.id);

  // Evaluate farm thresholds & auto-trigger abnormal condition alert
  const threshold = db.prepare('SELECT * FROM sensor_thresholds WHERE farm_id = ?').get(sensor.farm_id) as any;
  const triggeredAlerts: string[] = [];
  if (threshold) {
    if (moisture < threshold.min_soil_moisture || moisture > threshold.max_soil_moisture) {
      const msg = `Sensor ${sensor.device_uid} reported soil moisture ${moisture}% (configured range ${threshold.min_soil_moisture}–${threshold.max_soil_moisture}%).`;
      db.prepare(`
        INSERT INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
        VALUES (?, ?, ?, 'sensor', 'high', ?, ?, 0, NULL, ?, ?)
      `).run(uid('al-iot'), sensor.farm_id, sensor.zone_id, `Abnormal Soil Moisture — ${sensor.device_uid}`, msg, now, isSimulatedPayload ? 1 : 0);
      triggeredAlerts.push(msg);
    }
    if (hum > threshold.max_humidity) {
      const msg = `Sensor ${sensor.device_uid} measured canopy humidity ${hum}% exceeding threshold ${threshold.max_humidity}%.`;
      db.prepare(`
        INSERT INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
        VALUES (?, ?, ?, 'environmental', 'high', ?, ?, 0, NULL, ?, ?)
      `).run(uid('al-hum'), sensor.farm_id, sensor.zone_id, `High Canopy Humidity — ${sensor.device_uid}`, msg, now, isSimulatedPayload ? 1 : 0);
      triggeredAlerts.push(msg);
    }
    if (ph < threshold.min_soil_ph || ph > threshold.max_soil_ph) {
      const msg = `Sensor ${sensor.device_uid} detected soil pH ${ph} outside ${threshold.min_soil_ph}–${threshold.max_soil_ph}.`;
      db.prepare(`
        INSERT INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
        VALUES (?, ?, ?, 'sensor', 'warning', ?, ?, 0, NULL, ?, ?)
      `).run(uid('al-ph'), sensor.farm_id, sensor.zone_id, `Soil pH Drift — ${sensor.device_uid}`, msg, now, isSimulatedPayload ? 1 : 0);
      triggeredAlerts.push(msg);
    }
  }

  res.status(201).json({ readingId, ingestedAt: now, triggeredAlerts });
});

apiRouter.get('/iot/thresholds', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT t.*, f.name as farm_name
    FROM sensor_thresholds t JOIN farms f ON f.id = t.farm_id
  `).all();
  res.json(rows);
});

apiRouter.put('/iot/thresholds/:id', (req: Request, res: Response) => {
  const { minSoilMoisture, maxSoilMoisture, maxHumidity, minSoilPh, maxSoilPh, maxAirTemp } = req.body;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sensor_thresholds
    SET min_soil_moisture = ?, max_soil_moisture = ?, max_humidity = ?, min_soil_ph = ?, max_soil_ph = ?, max_air_temp = ?, updated_at = ?
    WHERE id = ?
  `).run(minSoilMoisture, maxSoilMoisture, maxHumidity, minSoilPh, maxSoilPh, maxAirTemp, now, req.params.id);
  res.json({ updated: true, updatedAt: now });
});

// 8. MULTIMODAL DISEASE RISK PREDICTION ENGINE
apiRouter.get('/risk', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT r.*, f.name as farm_name, z.name as zone_name
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY zone_id ORDER BY assessed_at DESC) as rn
      FROM risk_assessments
    ) r
    JOIN farms f ON f.id = r.farm_id
    JOIN farm_zones z ON z.id = r.zone_id
    WHERE r.rn = 1
    ORDER BY r.risk_score DESC
  `).all() as any[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      farmName: r.farm_name,
      zoneName: r.zone_name,
      cropType: r.crop_type,
      targetDisease: r.target_disease,
      riskScore: r.risk_score,
      riskCategory: r.risk_category,
      environmentalVsConfirmed: r.environmental_vs_confirmed,
      contributingFactors: JSON.parse(r.contributing_factors),
      inspectionPriority: r.inspection_priority,
      recommendedActions: JSON.parse(r.recommended_actions),
      engineVersion: r.engine_version,
      assessedAt: r.assessed_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/risk/recalculate', (_req: Request, res: Response) => {
  const zones = db.prepare(`
    SELECT z.*, f.name as farm_name
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id
  `).all() as any[];

  let updatedCount = 0;
  let newWarnings = 0;

  const tx = db.transaction(() => {
    for (const z of zones) {
      const wx = db.prepare('SELECT * FROM weather_records WHERE farm_id = ? ORDER BY recorded_at DESC LIMIT 1').get(z.farm_id) as any;
      const soil = db.prepare('SELECT * FROM soil_records WHERE zone_id = ? ORDER BY recorded_at DESC LIMIT 1').get(z.id) as any;
      const confirmed = (db.prepare("SELECT COUNT(*) as c FROM disease_observations WHERE zone_id = ? AND observation_status = 'confirmed'").get(z.id) as any).c;
      const suspected = (db.prepare("SELECT COUNT(*) as c FROM disease_observations WHERE zone_id = ? AND observation_status = 'suspected'").get(z.id) as any).c;
      const neighbourInfected = zones.filter(
        (o) => o.farm_id === z.farm_id && o.id !== z.id && o.health_status === ZoneHealthStatus.INFECTED
      ).length;

      const assessment = evaluateZoneDiseaseRisk(
        {
          farmId: z.farm_id,
          zoneId: z.id,
          farmName: z.farm_name,
          zoneName: z.name,
          cropType: z.crop_type as CropType,
          growthStage: z.growth_stage as GrowthStage,
          temperatureC: wx?.temperature_c ?? 26,
          humidityPct: wx?.humidity_pct ?? 70,
          rainfallMm: wx?.rainfall_mm ?? 2,
          soilMoisturePct: soil?.soil_moisture_pct ?? 50,
          soilPh: soil?.soil_ph ?? 6.5,
          recentConfirmedObservations: confirmed,
          recentSuspectedObservations: suspected,
          neighbouringInfectedZones: neighbourInfected,
          isDemo: Boolean(z.is_demo),
        },
        uid('risk')
      );

      db.prepare(`
        INSERT INTO risk_assessments (id, farm_id, zone_id, crop_type, target_disease, risk_score, risk_category, environmental_vs_confirmed, contributing_factors, inspection_priority, recommended_actions, engine_version, assessed_at, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        assessment.id,
        assessment.farmId,
        assessment.zoneId,
        assessment.cropType,
        assessment.targetDisease,
        assessment.riskScore,
        assessment.riskCategory,
        assessment.environmentalVsConfirmed,
        JSON.stringify(assessment.contributingFactors),
        assessment.inspectionPriority,
        JSON.stringify(assessment.recommendedActions),
        assessment.engineVersion,
        assessment.assessedAt,
        assessment.isDemo ? 1 : 0
      );

      db.prepare('UPDATE farm_zones SET risk_score = ?, risk_category = ? WHERE id = ?').run(
        assessment.riskScore,
        assessment.riskCategory,
        z.id
      );

      if (assessment.riskScore >= 75 && confirmed === 0) {
        newWarnings += 1;
      }
      updatedCount += 1;
    }
  });

  tx();
  res.json({ recalculatedZones: updatedCount, highEnvironmentalWarnings: newWarnings, assessedAt: new Date().toISOString() });
});

// 9. ALERTS & NOTIFICATIONS
apiRouter.get('/alerts', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT a.*, f.name as farm_name, z.name as zone_name
    FROM alerts a
    JOIN farms f ON f.id = a.farm_id
    LEFT JOIN farm_zones z ON z.id = a.zone_id
    ORDER BY a.created_at DESC
  `).all();
  res.json(rows.map(mapAlertRow));
});

apiRouter.patch('/alerts/:id/acknowledge', (req: Request, res: Response) => {
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  res.json({ acknowledged: true });
});

apiRouter.patch('/alerts/:id/resolve', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE alerts SET acknowledged = 1, resolved_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ resolvedAt: now });
});

// 10. SMART ADVISORY & TREATMENTS
apiRouter.get('/advisory', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM advisory_articles ORDER BY crop_type ASC').all() as any[];
  res.json(
    rows.map((a) => ({
      id: a.id,
      cropType: a.crop_type,
      diseaseName: a.disease_name,
      pathogen: a.pathogen,
      summary: a.summary,
      symptoms: JSON.parse(a.symptoms || '[]'),
      riskFactors: JSON.parse(a.risk_factors || '[]'),
      favorableConditions: a.favorable_conditions,
      immediateActions: JSON.parse(a.immediate_actions || '[]'),
      preventiveMeasures: JSON.parse(a.preventive_measures || '[]'),
      culturalManagement: JSON.parse(a.cultural_management || '[]'),
      biologicalManagement: JSON.parse(a.biological_management || '[]'),
      organicTreatments: JSON.parse(a.organic_treatments || '[]'),
      chemicalGuidance: JSON.parse(a.chemical_guidance || '[]'),
      verifiedTreatmentInfo: a.verified_treatment_info || '',
      references: JSON.parse(a.article_references || '[]'),
      safetyNotes: a.safety_notes,
      expertReviewedBy: a.expert_reviewed_by,
      lastReviewedAt: a.last_reviewed_at,
    }))
  );
});

apiRouter.get('/treatments', (req: Request, res: Response) => {
  const zoneId = req.query.zoneId as string | undefined;
  let sql = `
    SELECT t.*, f.name as farm_name, z.name as zone_name, z.crop_type
    FROM treatments t
    JOIN farms f ON f.id = t.farm_id
    JOIN farm_zones z ON z.id = t.zone_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (zoneId) {
    sql += ' AND t.zone_id = ?';
    params.push(zoneId);
  }
  sql += ' ORDER BY t.applied_at DESC';
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      farmId: r.farm_id,
      zoneId: r.zone_id,
      farmName: r.farm_name,
      zoneName: r.zone_name,
      cropType: r.crop_type,
      observationId: r.observation_id,
      actionType: r.action_type,
      productOrMethod: r.product_or_method,
      dosage: r.dosage,
      appliedBy: r.applied_by,
      outcomeStatus: r.outcome_status || 'pending_evaluation',
      outcomeNotes: r.outcome_notes,
      expertVerified: Boolean(r.expert_verified),
      appliedAt: r.applied_at,
      isDemo: Boolean(r.is_demo),
    }))
  );
});

apiRouter.post('/treatments', (req: Request, res: Response) => {
  const { farmId, zoneId, observationId, actionType, productOrMethod, dosage, appliedBy, outcomeNotes } = req.body;
  if (!farmId || !zoneId || !productOrMethod) {
    res.status(400).json({ error: 'farmId, zoneId, and productOrMethod are required.' });
    return;
  }
  const id = uid('trt');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO treatments (id, farm_id, zone_id, observation_id, action_type, product_or_method, dosage, applied_by, outcome_status, outcome_notes, expert_verified, applied_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_evaluation', ?, 0, ?, 0)
  `).run(
    id,
    farmId,
    zoneId,
    observationId || null,
    actionType || 'preventive_spray',
    productOrMethod,
    dosage || 'Per extension label / agronomist prescription',
    appliedBy || 'Farm Operator',
    outcomeNotes || 'Treatment logged.',
    now
  );
  res.status(201).json({ id, appliedAt: now });
});

apiRouter.patch('/treatments/:id/outcome', (req: Request, res: Response) => {
  const role = getRoleFromHeader(req);
  const existing = db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Treatment record not found.' });
    return;
  }
  const { outcomeStatus, outcomeNotes, expertVerified } = req.body;
  const verifiedFlag =
    (role === UserRole.EXPERT || role === UserRole.ADMIN) && typeof expertVerified === 'boolean'
      ? expertVerified
        ? 1
        : 0
      : existing.expert_verified;

  db.prepare(`
    UPDATE treatments SET outcome_status = ?, outcome_notes = ?, expert_verified = ? WHERE id = ?
  `).run(
    outcomeStatus || existing.outcome_status,
    outcomeNotes ?? existing.outcome_notes,
    verifiedFlag,
    req.params.id
  );
  res.json({ updated: true, id: req.params.id });
});

// 10b. DISEASE PROGRESSION MONITORING (Strictly matched per Farm Zone & Crop)
apiRouter.get('/progression', (req: Request, res: Response) => {
  const zoneId = req.query.zoneId as string | undefined;
  const zones = db.prepare(`
    SELECT z.*, f.name as farm_name, f.district
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id
    ORDER BY f.district, z.zone_code
  `).all() as any[];

  const targetZoneRow = zoneId
    ? zones.find((z) => z.id === zoneId)
    : zones.find((z) => z.id === 'zone-farm-ka-03-1') || zones[0];

  if (!targetZoneRow) {
    res.json({ zones: [], activeZone: null, timeline: [], treatments: [], reminders: [] });
    return;
  }

  // Strictly match SAME zone AND SAME cropType
  const obsRows = db.prepare(`
    SELECT * FROM disease_observations
    WHERE zone_id = ? AND crop_type = ?
    ORDER BY observed_at ASC
  `).all(targetZoneRow.id, targetZoneRow.crop_type) as any[];

  const sevRows = db.prepare(`
    SELECT * FROM severity_analyses
    WHERE zone_id = ? AND crop_type = ?
    ORDER BY analyzed_at ASC
  `).all(targetZoneRow.id, targetZoneRow.crop_type) as any[];

  const timeline = [
    ...sevRows.map((s) => ({
      id: s.id,
      timestamp: s.analyzed_at,
      farmId: s.farm_id,
      zoneId: s.zone_id,
      cropType: s.crop_type,
      diseaseName: s.disease_name,
      affectedAreaPct: Number(s.affected_area_pct),
      severityClass: s.severity_class,
      imageUrl: s.annotated_image_url || s.original_image_url,
      originalImageUrl: s.original_image_url,
      measurementType: 'measured_severity' as const,
      sourceLabel: 'Measured Pixel Segmentation (Severity Module)',
      notes: s.notes,
      isDemo: Boolean(s.is_demo),
    })),
    ...obsRows.map((o) => ({
      id: o.id,
      timestamp: o.observed_at,
      farmId: o.farm_id,
      zoneId: o.zone_id,
      cropType: o.crop_type,
      diseaseName: o.disease_name,
      affectedAreaPct: Number(o.affected_area_pct),
      severityClass: o.severity_class,
      imageUrl: o.image_url,
      originalImageUrl: o.image_url,
      measurementType: 'visual_assessment' as const,
      sourceLabel:
        o.source_mode === 'manual_field_log'
          ? 'Approximate Visual Field Assessment'
          : 'Field Observation Log (Demo / Visual)',
      notes: o.notes,
      isDemo: Boolean(o.is_demo),
    })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const measuredPoints = timeline.filter((t) => t.measurementType === 'measured_severity');
  const comparisonSeries = measuredPoints.length >= 2 ? measuredPoints : timeline;

  let deltaPct = 0;
  let trendStatus: 'improving' | 'worsening' | 'stable' | 'insufficient_history' = 'insufficient_history';
  if (comparisonSeries.length >= 2) {
    const first = comparisonSeries[0];
    const last = comparisonSeries[comparisonSeries.length - 1];
    deltaPct = Number((last.affectedAreaPct - first.affectedAreaPct).toFixed(1));
    if (deltaPct <= -2.0) trendStatus = 'improving';
    else if (deltaPct >= 2.0) trendStatus = 'worsening';
    else trendStatus = 'stable';
  }

  const imageEntries = timeline.filter((t) => Boolean(t.originalImageUrl));
  const earliestImage = imageEntries[0] || null;
  const latestImage = imageEntries[imageEntries.length - 1] || null;

  const zoneTreatments = (db.prepare(`
    SELECT * FROM treatments WHERE zone_id = ? ORDER BY applied_at DESC
  `).all(targetZoneRow.id) as any[]).map((r) => ({
    id: r.id,
    farmId: r.farm_id,
    zoneId: r.zone_id,
    observationId: r.observation_id,
    actionType: r.action_type,
    productOrMethod: r.product_or_method,
    dosage: r.dosage,
    appliedBy: r.applied_by,
    outcomeStatus: r.outcome_status || 'pending_evaluation',
    outcomeNotes: r.outcome_notes,
    expertVerified: Boolean(r.expert_verified),
    appliedAt: r.applied_at,
    isDemo: Boolean(r.is_demo),
  }));

  const zoneReminders = (db.prepare(`
    SELECT * FROM alerts WHERE zone_id = ? AND category = 'inspection' ORDER BY created_at DESC
  `).all(targetZoneRow.id) as any[]).map((r) => ({
    id: r.id,
    farmId: r.farm_id,
    zoneId: r.zone_id,
    category: r.category,
    severity: r.severity,
    title: r.title,
    message: r.message,
    acknowledged: Boolean(r.acknowledged),
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    isDemo: Boolean(r.is_demo),
  }));

  res.json({
    zones: zones.map(mapZoneRow),
    activeZone: mapZoneRow(targetZoneRow),
    timeline,
    comparisonSummary: {
      totalRecords: timeline.length,
      measuredCount: measuredPoints.length,
      visualEstimateCount: timeline.length - measuredPoints.length,
      deltaPct,
      trendStatus,
      earliestImage,
      latestImage,
    },
    treatments: zoneTreatments,
    reminders: zoneReminders,
  });
});

apiRouter.post('/progression/reminder', (req: Request, res: Response) => {
  const { farmId, zoneId, dueNote } = req.body;
  const zone = db.prepare('SELECT * FROM farm_zones WHERE id = ?').get(zoneId) as any;
  if (!zone) {
    res.status(404).json({ error: 'Target zone not found.' });
    return;
  }
  const id = uid('al-rem');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
    VALUES (?, ?, ?, 'inspection', 'info', ?, ?, 0, NULL, ?, 0)
  `).run(
    id,
    farmId || zone.farm_id,
    zoneId,
    `Follow-Up Progression Inspection — ${zone.name}`,
    dueNote || `Scheduled follow-up leaf capture & severity comparison for ${zone.crop_type}.`,
    now
  );
  res.status(201).json({ id, createdAt: now });
});

// 11. COMMUNITY OUTBREAK INTELLIGENCE (Privacy-Preserving Regional Clustering)
apiRouter.get('/outbreaks', (req: Request, res: Response) => {
  const daysWindow = Number(req.query.days) || 30;
  const cropFilter = (req.query.crop as string) || 'all';

  const zones = db.prepare(`
    SELECT z.*, f.district, f.latitude as farm_lat, f.longitude as farm_lng
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id
  `).all() as any[];

  const obs = db.prepare(`
    SELECT o.id, o.farm_id, o.zone_id, o.crop_type, o.disease_name, o.observation_status, o.expert_review_status, o.observed_at,
           f.district, f.latitude as farm_lat, f.longitude as farm_lng
    FROM disease_observations o
    JOIN farms f ON f.id = o.farm_id
    WHERE o.observation_status IN ('confirmed', 'suspected')
  `).all() as any[];

  const investigations = db.prepare('SELECT * FROM outbreak_investigations').all() as any[];
  const invMap = new Map<string, any>();
  investigations.forEach((inv) => invMap.set(inv.cluster_id, inv));

  const refNow = new Date('2026-11-20T09:00:00Z').getTime();
  const msWindow = daysWindow * 24 * 60 * 60 * 1000;

  // Group into privacy-preserving regional clusters (District + Primary Crop)
  const clusterMap = new Map<string, any>();

  zones.forEach((z) => {
    if (cropFilter !== 'all' && z.crop_type !== cropFilter) return;
    const key = `cluster-${z.district}-${z.crop_type}`;
    if (!clusterMap.has(key)) {
      clusterMap.set(key, {
        clusterId: key,
        regionLabel: `${z.district} ${z.crop_type} Belt`,
        district: z.district,
        cropType: z.crop_type,
        latSum: 0,
        lngSum: 0,
        farmIds: new Set<string>(),
        totalZones: 0,
        riskSum: 0,
        confirmedCount: 0,
        suspectedCount: 0,
        recentReportsCount: 0,
        priorWindowReportsCount: 0,
        diseaseCounts: new Map<string, number>(),
      });
    }
    const c = clusterMap.get(key);
    c.latSum += z.farm_lat;
    c.lngSum += z.farm_lng;
    c.farmIds.add(z.farm_id);
    c.totalZones += 1;
    c.riskSum += z.risk_score;
  });

  obs.forEach((o) => {
    if (cropFilter !== 'all' && o.crop_type !== cropFilter) return;
    const key = `cluster-${o.district}-${o.crop_type}`;
    const c = clusterMap.get(key);
    if (!c) return;

    const obsTs = new Date(o.observed_at).getTime();
    const ageMs = Math.max(0, refNow - obsTs);

    if (ageMs <= msWindow) {
      c.recentReportsCount += 1;
      if (o.observation_status === 'confirmed') c.confirmedCount += 1;
      if (o.observation_status === 'suspected') c.suspectedCount += 1;
      c.diseaseCounts.set(o.disease_name, (c.diseaseCounts.get(o.disease_name) || 0) + 1);
    } else if (ageMs <= msWindow * 2) {
      c.priorWindowReportsCount += 1;
    }
  });

  const clusters = Array.from(clusterMap.values())
    .filter((c) => c.totalZones > 0)
    .map((c) => {
      const inv = invMap.get(c.clusterId);
      const avgRiskScore = Math.round(c.riskSum / Math.max(1, c.totalZones));
      const dominantDisease =
        (Array.from(c.diseaseCounts.entries()) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        `${c.cropType} Foliar Surveillance`;

      const investigationStatus =
        inv?.investigation_status ||
        (c.confirmedCount >= 2 ? 'under_investigation' : 'monitoring');

      const classification =
        investigationStatus === 'confirmed'
          ? 'expert_confirmed_outbreak'
          : 'potential_cluster';

      return {
        clusterId: c.clusterId,
        regionLabel: c.regionLabel,
        district: c.district,
        cropType: c.cropType,
        dominantDisease,
        latitude: Number((c.latSum / c.totalZones).toFixed(4)),
        longitude: Number((c.lngSum / c.totalZones).toFixed(4)),
        radiusKm: 12,
        farmCount: c.farmIds.size,
        totalZones: c.totalZones,
        recentReportsCount: c.recentReportsCount,
        priorWindowReportsCount: c.priorWindowReportsCount,
        increasingTrend: c.recentReportsCount > c.priorWindowReportsCount,
        confirmedCount: c.confirmedCount,
        suspectedCount: c.suspectedCount,
        avgRiskScore,
        classification,
        investigationStatus,
        expertNotes: inv?.expert_notes || null,
        updatedBy: inv?.updated_by || null,
        updatedAt: inv?.updated_at || null,
      };
    })
    .sort((a, b) => b.recentReportsCount - a.recentReportsCount || b.avgRiskScore - a.avgRiskScore);

  res.json(clusters);
});

apiRouter.patch('/outbreaks/:clusterId/investigate', (req: Request, res: Response) => {
  const role = getRoleFromHeader(req);
  if (role !== UserRole.EXPERT && role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'RBAC: Only Agricultural Experts or Administrators can update regional outbreak investigations.' });
    return;
  }

  const { district, cropType, dominantDisease, investigationStatus, expertNotes } = req.body;
  const now = new Date().toISOString();
  const updater = role === UserRole.ADMIN ? 'Platform Admin' : 'Dr. Kavitha Rao (Demo Pathologist)';

  db.prepare(`
    INSERT OR REPLACE INTO outbreak_investigations (cluster_id, district, crop_type, dominant_disease, investigation_status, expert_notes, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clusterId,
    district || 'Karnataka District',
    cropType || 'Mixed Crop',
    dominantDisease || 'Regional Disease Cluster',
    investigationStatus || 'under_investigation',
    expertNotes || 'Investigation status updated by expert.',
    updater,
    now
  );

  // If confirmed as regional outbreak, notify via Alert Centre using first farm in district (without exposing farmer PII)
  if (investigationStatus === 'confirmed') {
    const districtFarm = db.prepare('SELECT id FROM farms WHERE district = ? LIMIT 1').get(district) as any;
    if (districtFarm) {
      db.prepare(`
        INSERT INTO alerts (id, farm_id, zone_id, category, severity, title, message, acknowledged, resolved_at, created_at, is_demo)
        VALUES (?, ?, NULL, 'disease', 'critical', ?, ?, 0, NULL, ?, 0)
      `).run(
        uid('al-out'),
        districtFarm.id,
        `Expert-Confirmed Regional Outbreak — ${district} (${cropType})`,
        `Regional cluster ${req.params.clusterId} (${dominantDisease}) confirmed by ${updater}. Preventive community scouting advisory issued.`,
        now
      );
    }
  }

  res.json({ updated: true, clusterId: req.params.clusterId, investigationStatus, updatedAt: now });
});

// 12. REPORTS & CSV EXPORT
apiRouter.get('/reports/export', (req: Request, res: Response) => {
  const format = (req.query.format as string) || 'csv';
  const isDemoFilter = req.query.isDemo as string | undefined;

  let sql = `
    SELECT f.name as farm_name, f.district, z.zone_code, z.name as zone_name, z.crop_type, z.growth_stage, z.health_status, z.risk_score, z.risk_category, z.last_inspected_at, z.is_demo
    FROM farm_zones z JOIN farms f ON f.id = z.farm_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (isDemoFilter === '0' || isDemoFilter === '1') {
    sql += ' AND z.is_demo = ?';
    params.push(Number(isDemoFilter));
  }
  sql += ' ORDER BY f.district, z.zone_code';

  const rows = db.prepare(sql).all(...params) as any[];

  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="agroshield_farm_health_report.json"');
    res.json({
      generatedAt: new Date().toISOString(),
      filterMode: isDemoFilter === '0' ? 'real_only' : isDemoFilter === '1' ? 'demo_only' : 'all_records',
      datasetNotice: 'Demo records are explicitly marked with is_demo = 1; live operator records use is_demo = 0.',
      zones: rows,
    });
    return;
  }

  const header = 'Farm Name,District,Zone Code,Zone Name,Crop Type,Growth Stage,Health Status,Risk Score,Risk Category,Last Inspected,Dataset Source';
  const lines = rows.map((r) =>
    [
      `"${r.farm_name}"`,
      `"${r.district}"`,
      r.zone_code,
      `"${r.zone_name}"`,
      r.crop_type,
      `"${r.growth_stage}"`,
      r.health_status,
      r.risk_score,
      r.risk_category,
      r.last_inspected_at || 'N/A',
      r.is_demo ? 'DEMO' : 'REAL_LIVE',
    ].join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="agroshield_farm_health_report.csv"');
  res.send([header, ...lines].join('\n'));
});

// 13. SETTINGS & USER MANAGEMENT (RBAC)
apiRouter.get('/users', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY role ASC').all() as any[];
  res.json(rows.map(mapUserRow));
});

apiRouter.post('/users', (req: Request, res: Response) => {
  const roleHeader = getRoleFromHeader(req);
  if (roleHeader !== UserRole.ADMIN) {
    res.status(403).json({ error: 'RBAC: Only Administrators can provision new user accounts.' });
    return;
  }
  const { fullName, email, role, district, organization, password } = req.body;
  if (!fullName || !email || !role) {
    res.status(400).json({ error: 'fullName, email, and role are required.' });
    return;
  }
  const id = uid('usr');
  const now = new Date().toISOString();
  const initialHash = hashPassword(String(password || DEFAULT_DEMO_PASSWORD));
  try {
    db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, role, district, organization, active, is_demo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `).run(id, fullName, String(email).trim().toLowerCase(), initialHash, role, district || 'Karnataka', organization || 'Partner Farm', now);
    res.status(201).json({ id, fullName, email: String(email).trim().toLowerCase(), role });
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

apiRouter.get('/settings', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM integration_settings').all() as any[];
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  res.json({
    fastApiBaseUrl: map.fastApiBaseUrl || 'http://127.0.0.1:8000',
    inferenceMode: map.inferenceMode || 'demo_sandbox',
    weatherProvider: map.weatherProvider || 'open_meteo_live',
    esp32IngestEndpoint: '/api/iot/ingest',
  });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const roleHeader = getRoleFromHeader(req);
  if (roleHeader !== UserRole.ADMIN) {
    res.status(403).json({ error: 'RBAC: Only Administrators can modify integration settings.' });
    return;
  }
  const { fastApiBaseUrl, inferenceMode, weatherProvider } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO integration_settings (key, value) VALUES (?, ?)');
  if (fastApiBaseUrl) upsert.run('fastApiBaseUrl', fastApiBaseUrl);
  if (inferenceMode) upsert.run('inferenceMode', inferenceMode);
  if (weatherProvider) upsert.run('weatherProvider', weatherProvider);
  res.json({ saved: true });
});

apiRouter.post('/demo/reset', (req: Request, res: Response) => {
  const roleHeader = getRoleFromHeader(req);
  if (roleHeader !== UserRole.ADMIN) {
    res.status(403).json({ error: 'RBAC: Only Administrators can reset the synthetic demo dataset.' });
    return;
  }
  seedDemoDatabase();
  res.json({ reset: true });
});
