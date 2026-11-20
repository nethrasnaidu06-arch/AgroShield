-- AgroShield Production Relational Schema (PostgreSQL 15+ & PostGIS 3+)
-- Compatible migration target for external cloud PostgreSQL / PostGIS deployment.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('farmer', 'expert', 'admin')),
  district TEXT NOT NULL,
  organization TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  district TEXT NOT NULL,
  taluk TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  boundary GEOGRAPHY(POLYGON, 4326),
  area_hectares NUMERIC(8,2) NOT NULL,
  soil_type TEXT NOT NULL,
  irrigation_type TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_code TEXT NOT NULL,
  name TEXT NOT NULL,
  crop_type TEXT NOT NULL CHECK (crop_type IN ('Tomato', 'Potato', 'Rice', 'Maize', 'Chilli')),
  variety TEXT NOT NULL,
  planting_date DATE NOT NULL,
  growth_stage TEXT NOT NULL,
  area_hectares NUMERIC(8,2) NOT NULL,
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  zone_polygon GEOGRAPHY(POLYGON, 4326) NOT NULL,
  health_status TEXT NOT NULL CHECK (health_status IN ('healthy', 'suspected', 'infected', 'at_risk', 'insufficient_data')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_category TEXT NOT NULL DEFAULT 'Low',
  last_inspected_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_farm_zones_geom ON farm_zones USING GIST (zone_polygon);
CREATE INDEX IF NOT EXISTS idx_farms_loc ON farms USING GIST (location);

CREATE TABLE IF NOT EXISTS disease_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  disease_name TEXT NOT NULL,
  pathogen TEXT NOT NULL,
  observation_status TEXT NOT NULL CHECK (observation_status IN ('healthy', 'suspected', 'confirmed', 'resolved')),
  severity_class TEXT NOT NULL CHECK (severity_class IN ('Healthy', 'Mild', 'Moderate', 'Severe')),
  affected_area_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,4),
  source_mode TEXT NOT NULL,
  expert_review_status TEXT NOT NULL DEFAULT 'pending',
  expert_notes TEXT,
  reviewed_by TEXT,
  image_url TEXT,
  notes TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS disease_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES farm_zones(id) ON DELETE SET NULL,
  crop_type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  grad_cam_overlay_url TEXT,
  predicted_disease TEXT NOT NULL,
  is_healthy BOOLEAN NOT NULL,
  confidence_score NUMERIC(5,4) NOT NULL,
  alternative_predictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_metrics JSONB NOT NULL,
  inference_mode TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dataset_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS severity_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID REFERENCES disease_scans(id) ON DELETE SET NULL,
  observation_id UUID REFERENCES disease_observations(id) ON DELETE SET NULL,
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES farm_zones(id) ON DELETE SET NULL,
  crop_type TEXT NOT NULL,
  disease_name TEXT NOT NULL,
  classification_confidence NUMERIC(5,4) NOT NULL,
  affected_area_pct NUMERIC(5,2) NOT NULL,
  severity_class TEXT NOT NULL,
  bounding_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_image_url TEXT NOT NULL,
  annotated_image_url TEXT,
  segmentation_mask_url TEXT,
  processing_engine TEXT NOT NULL,
  model_version TEXT NOT NULL,
  notes TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS weather_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  district TEXT NOT NULL,
  temperature_c NUMERIC(5,2) NOT NULL,
  humidity_pct NUMERIC(5,2) NOT NULL,
  rainfall_mm NUMERIC(6,2) NOT NULL,
  wind_speed_kmh NUMERIC(5,2) NOT NULL,
  condition_label TEXT NOT NULL,
  source TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS soil_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  soil_moisture_pct NUMERIC(5,2) NOT NULL,
  soil_temp_c NUMERIC(5,2) NOT NULL,
  soil_ph NUMERIC(4,2) NOT NULL,
  nitrogen_ppm NUMERIC(6,2) NOT NULL,
  phosphorus_ppm NUMERIC(6,2) NOT NULL,
  potassium_ppm NUMERIC(6,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS iot_sensors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_uid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  hardware_model TEXT NOT NULL,
  firmware_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  battery_pct INTEGER NOT NULL,
  signal_rssi INTEGER NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id UUID NOT NULL REFERENCES iot_sensors(id) ON DELETE CASCADE,
  device_uid TEXT NOT NULL,
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  soil_moisture_pct NUMERIC(5,2) NOT NULL,
  soil_temp_c NUMERIC(5,2) NOT NULL,
  air_temp_c NUMERIC(5,2) NOT NULL,
  humidity_pct NUMERIC(5,2) NOT NULL,
  soil_ph NUMERIC(4,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  target_disease TEXT NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_category TEXT NOT NULL,
  environmental_vs_confirmed TEXT NOT NULL,
  contributing_factors JSONB NOT NULL,
  inspection_priority TEXT NOT NULL,
  recommended_actions JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES farm_zones(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('disease', 'environmental', 'sensor', 'inspection')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS treatments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES farm_zones(id) ON DELETE CASCADE,
  observation_id UUID REFERENCES disease_observations(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  product_or_method TEXT NOT NULL,
  dosage TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  outcome_status TEXT NOT NULL DEFAULT 'pending_evaluation',
  outcome_notes TEXT NOT NULL,
  expert_verified BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS expert_review_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id UUID NOT NULL REFERENCES disease_observations(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  reviewer_role TEXT NOT NULL,
  decision TEXT NOT NULL,
  previous_disease TEXT NOT NULL,
  new_disease TEXT NOT NULL,
  previous_severity TEXT NOT NULL,
  new_severity TEXT NOT NULL,
  comment TEXT NOT NULL,
  treatment_recommendation_note TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbreak_investigations (
  cluster_id TEXT PRIMARY KEY,
  district TEXT NOT NULL,
  crop_type TEXT NOT NULL,
  dominant_disease TEXT NOT NULL,
  investigation_status TEXT NOT NULL CHECK (investigation_status IN ('monitoring', 'under_investigation', 'confirmed', 'contained')),
  expert_notes TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
