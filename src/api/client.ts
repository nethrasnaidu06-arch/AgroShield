import { UserRole } from '../types/agroshield.ts';

let activeRole: UserRole = UserRole.FARMER;

export function setApiClientRole(role: UserRole) {
  activeRole = role;
}

export function getApiClientRole(): UserRole {
  return activeRole;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-agroshield-role': activeRole,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      if (payload.error) errMsg = payload.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getOverview: () => request<any>('/api/overview'),
  getFarms: () => request<any[]>('/api/farms'),
  createFarm: (body: any) => request<any>('/api/farms', { method: 'POST', body: JSON.stringify(body) }),
  updateFarm: (id: string, body: any) => request<any>(`/api/farms/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getFarmHistory: (id: string) => request<any>(`/api/farms/${id}/history`),

  getZones: (farmId?: string) => request<any[]>(farmId ? `/api/zones?farmId=${encodeURIComponent(farmId)}` : '/api/zones'),
  createZone: (body: any) => request<any>('/api/zones', { method: 'POST', body: JSON.stringify(body) }),
  getZoneDetail: (id: string) => request<any>(`/api/zones/${id}/detail`),

  getObservations: (params?: { status?: string; review?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.review) qs.set('review', params.review);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<any[]>(`/api/observations${suffix}`);
  },
  createObservation: (body: any) => request<any>('/api/observations', { method: 'POST', body: JSON.stringify(body) }),
  reviewObservation: (id: string, body: any) =>
    request<any>(`/api/observations/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
  getExpertHistory: () => request<any[]>('/api/expert/history'),

  getFastApiHealth: () => request<any>('/api/integrations/fastapi/health'),
  getScannerHistory: () => request<any[]>('/api/scanner/history'),
  saveDiseaseScan: (body: any) => request<any>('/api/scanner/analyze', { method: 'POST', body: JSON.stringify(body) }),

  getSeverityHistory: (zoneId?: string) =>
    request<any[]>(zoneId ? `/api/severity/history?zoneId=${encodeURIComponent(zoneId)}` : '/api/severity/history'),
  saveSeverityAnalysis: (body: any) => request<any>('/api/severity/analyze', { method: 'POST', body: JSON.stringify(body) }),

  getWeather: (farmId?: string) =>
    request<any[]>(farmId ? `/api/weather?farmId=${encodeURIComponent(farmId)}` : '/api/weather'),
  syncLiveWeather: (farmId: string) => request<any>(`/api/weather/sync-live/${farmId}`, { method: 'POST' }),

  getSensors: () => request<any[]>('/api/iot/sensors'),
  registerSensor: (body: any) => request<any>('/api/iot/sensors', { method: 'POST', body: JSON.stringify(body) }),
  getSensorReadings: (sensorId?: string) =>
    request<any[]>(sensorId ? `/api/iot/readings?sensorId=${encodeURIComponent(sensorId)}` : '/api/iot/readings'),
  ingestEsp32Reading: (body: any) => request<any>('/api/iot/ingest', { method: 'POST', body: JSON.stringify(body) }),
  getThresholds: () => request<any[]>('/api/iot/thresholds'),
  updateThreshold: (id: string, body: any) =>
    request<any>(`/api/iot/thresholds/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  getRiskAssessments: () => request<any[]>('/api/risk'),
  recalculateRisks: () => request<any>('/api/risk/recalculate', { method: 'POST' }),

  getAlerts: () => request<any[]>('/api/alerts'),
  acknowledgeAlert: (id: string) => request<any>(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  resolveAlert: (id: string) => request<any>(`/api/alerts/${id}/resolve`, { method: 'PATCH' }),

  getAdvisory: () => request<any[]>('/api/advisory'),
  getTreatments: (zoneId?: string) =>
    request<any[]>(zoneId ? `/api/treatments?zoneId=${encodeURIComponent(zoneId)}` : '/api/treatments'),
  createTreatment: (body: any) => request<any>('/api/treatments', { method: 'POST', body: JSON.stringify(body) }),
  updateTreatmentOutcome: (id: string, body: any) =>
    request<any>(`/api/treatments/${id}/outcome`, { method: 'PATCH', body: JSON.stringify(body) }),

  getProgression: (zoneId?: string) =>
    request<any>(zoneId ? `/api/progression?zoneId=${encodeURIComponent(zoneId)}` : '/api/progression'),
  createProgressionReminder: (body: any) =>
    request<any>('/api/progression/reminder', { method: 'POST', body: JSON.stringify(body) }),

  getOutbreaks: (days?: number, crop?: string) => {
    const qs = new URLSearchParams();
    if (days) qs.set('days', String(days));
    if (crop && crop !== 'all') qs.set('crop', crop);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<any[]>(`/api/outbreaks${suffix}`);
  },
  investigateOutbreak: (clusterId: string, body: any) =>
    request<any>(`/api/outbreaks/${encodeURIComponent(clusterId)}/investigate`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getUsers: () => request<any[]>('/api/users'),
  createUser: (body: any) => request<any>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  getSettings: () => request<any>('/api/settings'),
  updateSettings: (body: any) => request<any>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  resetDemoData: () => request<any>('/api/demo/reset', { method: 'POST' }),
};
