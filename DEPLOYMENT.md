# AgroShield — Deployment, Environment & Integration Guide

## 1. Architecture Summary

AgroShield is a full-stack agricultural intelligence platform built with:
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Leaflet, Lucide Icons
- **Backend API & SPA Server**: Node.js + Express (`server.ts`, `src/api/routes.ts`) serving port `3000`
- **Database (Local / Embedded)**: SQLite (`better-sqlite3` at `data/agroshield.db`) with strict `is_demo` (`0` = Real/Live, `1` = Synthetic Demo) data separation
- **Database (Production Target Blueprint)**: PostgreSQL 16 + PostGIS (`src/database/postgres_postgis_schema.sql`)
- **AI Vision Inference Service (Optional External Blueprint)**: Python FastAPI (`python_services/fastapi_inference_server.py`) prepared for PyTorch / ResNet / YOLOv8 / OpenCV / Grad-CAM

> **Transparency Notice**: Out of the box, external PyTorch/YOLOv8 trained model weights are **not** bundled. When `FASTAPI_INFERENCE_URL` is unreachable or unconfigured, AgroShield operates transparently in **Demo Visual Sandbox Mode** (`demo_visual_sandbox` / `demo_opencv_canvas_heuristic`) and never presents heuristic demo estimates as trained deep learning model outputs.

---

## 2. Environment Variables (`.env.example`)

Copy `.env.example` to `.env` for local or production configuration (never commit secrets):

| Variable | Description | Default |
|---|---|---|
| `PORT` | Express HTTP server port (must be `3000` in AI Studio runtime) | `3000` |
| `NODE_ENV` | `development` (Vite middleware) or `production` (serves `dist/`) | `development` |
| `FASTAPI_INFERENCE_URL` | Base URL for external Python FastAPI PyTorch/YOLO inference server | `http://127.0.0.1:8000` |
| `APP_URL` | Public origin URL of the hosted AgroShield instance | — |
| `GEMINI_API_KEY` | Reserved runtime secret if external API features are enabled | — |

---

## 3. Local Development & Production Build

```bash
# 1. Install Node dependencies
npm install

# 2. Start Express + Vite dev server on http://0.0.0.0:3000
npm run dev

# 3. Typecheck & build production frontend bundle (dist/)
npm run lint
npm run build

# 4. Run production server serving dist/ + /api/*
NODE_ENV=production npm start
```

### Static Asset Note
`vite.config.ts` automatically copies `src/assets/` into `dist/src/assets/` during `npm run build` so specimen leaf photos and banners resolve in production builds.

---

## 4. PostgreSQL + PostGIS Production Migration

To migrate persistence from local SQLite (`data/agroshield.db`) to PostgreSQL + PostGIS:
1. Provision a PostgreSQL 15+ instance with PostGIS enabled (`CREATE EXTENSION IF NOT EXISTS postgis;`).
2. Apply the full relational + spatial schema:
   ```bash
   psql "$DATABASE_URL" -f src/database/postgres_postgis_schema.sql
   ```
3. Replace the SQLite query adapter in `src/database/db.ts` with `pg` pool queries maintaining the `is_demo` boolean flag separation.

---

## 5. External Python FastAPI AI Vision Server

To connect real PyTorch CNN / YOLOv8 / OpenCV / Grad-CAM inference:
```bash
cd python_services
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn fastapi_inference_server:app --host 0.0.0.0 --port 8000
```
- Mount your trained `.pt` / `.pth` weights in `fastapi_inference_server.py`.
- Verify connectivity inside AgroShield under **Settings & Users** or **AI Disease Scanner** (`GET /api/integrations/fastapi/health`).
- Note: Do not expose raw API keys or secrets in the browser; keep `FASTAPI_INFERENCE_URL` configured server-side or via Admin Settings.

---

## 6. Real Hardware Integrations

### Weather Monitoring (Open-Meteo)
- Endpoint: `POST /api/weather/sync-live/:farmId`
- Queries `https://api.open-meteo.com/v1/forecast` server-side using the registered farm's WGS84 latitude/longitude and persists records with `source = 'open_meteo_live'` and `is_demo = 0`.

### IoT Soil & Microclimate Ingestion (ESP32)
Register the sensor UID in **IoT Sensors**, then configure your microcontroller firmware to `POST` JSON telemetry to `/api/iot/ingest`:
```json
{
  "deviceUid": "ESP32-AGRO-001",
  "soilMoisturePct": 62.4,
  "soilTempC": 23.8,
  "airTempC": 27.1,
  "humidityPct": 86.5,
  "soilPh": 6.3,
  "batteryPct": 92,
  "signalRssi": -68
}
```
Threshold breaches automatically insert alerts into the **Alert Centre** and persist soil snapshots for the **Multimodal Risk Engine**.
