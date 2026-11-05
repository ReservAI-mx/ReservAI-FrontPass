import { closeRing } from './geo';
import type {
  Category,
  CategoryInput,
  Draft,
  ExportRequest,
  GeoHit,
  Kpis,
  Prospect,
  ProspectPage,
  SearchJob,
  SearchStatus,
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message || `Error ${err.status}`;
  if (err instanceof Error && err.message) return err.message;
  return 'Ocurrió un error';
}

function str(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text === 'null' || text === 'undefined') return null;
  return text;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function boolish(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function strArray(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && 'text' in item) return String((item as { text: unknown }).text).trim();
    return '';
  }).filter(Boolean);
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  for (const key of ['items', 'results', 'prospects', 'categories', 'searches', 'data', 'exports', 'insights']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      for (const nested of ['items', 'results', 'prospects', 'categories', 'searches']) {
        if (Array.isArray(inner[nested])) return inner[nested] as unknown[];
      }
    }
  }
  return [];
}

function unwrapEntity(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id === 'string' || typeof record.id === 'number') return record;
  for (const key of ['search', 'data', 'result', 'prospect', 'category']) {
    const inner = record[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as Record<string, unknown>;
  }
  return record;
}

async function readBody(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageOf(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
  }
  return fallback || 'Error de API';
}

async function asError(res: Response) {
  const data = await readBody(res);
  const code = data && typeof data === 'object' ? str((data as Record<string, unknown>).code) ?? undefined : undefined;
  return new ApiError(res.status, messageOf(data, res.statusText), code);
}

export async function api<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
    const data = await readBody(res);
    if (res.status === 418 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    if (!res.ok) {
      const code = data && typeof data === 'object' ? str((data as Record<string, unknown>).code) ?? undefined : undefined;
      throw new ApiError(res.status, messageOf(data, res.statusText), code);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new ApiError(0, 'La API tardó demasiado en responder');
    throw new ApiError(0, 'No hay conexión con la API');
  }
}

const STATUSES: SearchStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

export function normalizeSearch(raw: unknown): SearchJob | null {
  const record = unwrapEntity(raw);
  if (!record) return null;
  const id = str(record.id);
  if (!id) return null;
  const statusRaw = str(record.status);
  let label: string | null = null;
  let city = str(record.city) || str(record.label_city);
  let zone = str(record.zone) || str(record.label_zone) || str(record.zone_label);
  if (typeof record.label === 'string') label = str(record.label);
  else if (record.label && typeof record.label === 'object') {
    const nested = record.label as Record<string, unknown>;
    city = city || str(nested.city);
    zone = zone || str(nested.zone);
    label = [city, zone].filter(Boolean).join(' — ') || null;
  }
  return {
    id,
    status: STATUSES.includes(statusRaw as SearchStatus) ? (statusRaw as SearchStatus) : 'completed',
    businesses_found: num(record.businesses_found),
    businesses_processed: num(record.businesses_processed),
    progress: num(record.progress),
    stage: str(record.stage),
    error: typeof record.error === 'string' ? record.error : null,
    label,
    city,
    zone,
    created_at: str(record.created_at),
  };
}

export function normalizeCategory(raw: unknown): Category | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = str(record.name);
  const id = str(record.id) || str(record.slug);
  if (!id || !name) return null;
  return {
    id,
    name,
    slug: str(record.slug) || slugFallback(name),
    google_place_types: strArray(record.google_place_types ?? record.googlePlaceTypes),
    search_terms: strArray(record.search_terms ?? record.searchTerms),
    is_active: record.is_active === false || record.isActive === false ? false : true,
  };
}

function slugFallback(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function normalizeProspect(raw: unknown): Prospect | null {
  const record = unwrapEntity(raw);
  if (!record) return null;
  const id = str(record.id);
  const name = str(record.name);
  if (!id || !name) return null;
  let categoryId: string | null = null;
  let categoryName: string | null = null;
  if (typeof record.category === 'string') categoryName = str(record.category);
  else if (record.category && typeof record.category === 'object') {
    const category = record.category as Record<string, unknown>;
    categoryId = str(category.id);
    categoryName = str(category.name);
  }
  categoryId = categoryId || str(record.category_id);
  categoryName = categoryName || str(record.category_name);
  const signals = record.signals && typeof record.signals === 'object'
    ? record.signals as Record<string, unknown>
    : {};
  const location = record.location ?? record.geo;
  let lng: number | null = null;
  let lat: number | null = null;
  if (Array.isArray(location) && location.length >= 2) {
    lng = num(location[0]);
    lat = num(location[1]);
  } else if (Array.isArray(record.coordinates) && record.coordinates.length >= 2) {
    lng = num(record.coordinates[0]);
    lat = num(record.coordinates[1]);
  } else if (location && typeof location === 'object') {
    const point = location as Record<string, unknown>;
    lng = num(point.lng ?? point.lon ?? point.longitude);
    lat = num(point.lat ?? point.latitude);
  }
  if (lng == null) lng = num(record.lng ?? record.longitude);
  if (lat == null) lat = num(record.lat ?? record.latitude);
  return {
    id,
    name,
    address: str(record.address),
    category_id: categoryId,
    category_name: categoryName,
    zone_label: str(record.zone_label ?? record.zone),
    phone: str(record.phone),
    email: str(record.email),
    email_status: str(record.email_status),
    website: str(record.website),
    maps_url: str(record.maps_url ?? record.google_maps_url),
    rating: num(record.rating),
    review_count: num(record.review_count),
    branch_count: num(record.branch_count),
    has_whatsapp: boolish(record.has_whatsapp ?? signals.whatsapp ?? signals.has_whatsapp),
    booking_system_detected: boolish(record.booking_system_detected ?? signals.booking_system_detected ?? record.booking_detected),
    lead_score: num(record.lead_score),
    reservai_fit: str(record.reservai_fit),
    status_label: str(record.status_label),
    review_summary: str(record.review_summary),
    pain_points: strArray(record.pain_points),
    positive_signals: strArray(record.positive_signals),
    sales_angle: str(record.sales_angle),
    opportunity: str(record.opportunity),
    analyzed_at: str(record.analyzed_at),
    lng,
    lat,
  };
}

function pair(value: unknown, total: number) {
  if (typeof value === 'number') return { count: value, pct: total ? (value / total) * 100 : 0 };
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const count = num(record.count) ?? 0;
    const pct = num(record.pct ?? record.percent) ?? (total ? (count / total) * 100 : 0);
    return { count, pct };
  }
  return { count: 0, pct: 0 };
}

export function normalizeKpis(raw: unknown): Kpis | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = (raw as Record<string, unknown>).kpis && typeof (raw as Record<string, unknown>).kpis === 'object'
    ? (raw as Record<string, unknown>).kpis as Record<string, unknown>
    : raw as Record<string, unknown>;
  const total = num(record.prospects_total ?? record.total ?? record.businesses_found) ?? 0;
  return {
    prospects_total: total,
    with_whatsapp: pair(record.with_whatsapp, total),
    with_email: pair(record.with_email ?? record.with_mail, total),
    without_booking_system: pair(record.without_booking_system ?? record.no_booking_system, total),
    avg_rating: num(record.avg_rating ?? record.average_rating),
    avg_lead_score: num(record.avg_lead_score ?? record.average_lead_score ?? record.avg_score),
  };
}

export function computeKpis(rows: Prospect[]): Kpis {
  const total = rows.length;
  const pct = (count: number) => (total ? (count / total) * 100 : 0);
  const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const whatsapp = rows.filter((row) => row.has_whatsapp).length;
  const email = rows.filter((row) => row.email).length;
  const noBooking = rows.filter((row) => row.booking_system_detected === false).length;
  return {
    prospects_total: total,
    with_whatsapp: { count: whatsapp, pct: pct(whatsapp) },
    with_email: { count: email, pct: pct(email) },
    without_booking_system: { count: noBooking, pct: pct(noBooking) },
    avg_rating: avg(rows.map((row) => row.rating).filter((value): value is number => value != null)),
    avg_lead_score: avg(rows.map((row) => row.lead_score).filter((value): value is number => value != null)),
  };
}

export function normalizeInsights(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : unwrapList(raw);
  return list.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return str(record.text ?? record.insight ?? record.body ?? record.summary) ?? '';
    }
    return '';
  }).filter(Boolean);
}

export function buildSearchBody(draft: Draft) {
  const area = draft.mode === 'radius'
    ? { type: 'radius' as const, center: { lng: draft.center!.lng, lat: draft.center!.lat }, radius_m: Math.round(draft.radiusM) }
    : { type: 'polygon' as const, coordinates: closeRing(draft.polygon) };
  const options: Record<string, unknown> = {
    include_closed: draft.includeClosed,
    require_phone: draft.requirePhone,
    require_website: draft.requireWebsite,
    require_email: draft.requireEmail,
  };
  if (draft.minimumRating.trim()) options.minimum_rating = Number(draft.minimumRating);
  if (draft.minimumReviews.trim()) options.minimum_reviews = Number(draft.minimumReviews);
  const label = [draft.city.trim(), draft.zone.trim()].filter(Boolean).join(' — ') || 'Zona sin nombre';
  return { area, category_ids: draft.categoryIds, options, label };
}

export async function getCategories(activeOnly = false) {
  const path = activeOnly ? '/api/prospeccion/categories?active=true' : '/api/prospeccion/categories';
  const raw = await api<unknown>(path);
  return unwrapList(raw).map(normalizeCategory).filter((item): item is Category => item != null);
}

export function saveCategory(id: string | null, input: CategoryInput) {
  const path = id ? `/api/prospeccion/categories/${encodeURIComponent(id)}` : '/api/prospeccion/categories';
  return api(path, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
}

export function deleteCategory(id: string) {
  return api(`/api/prospeccion/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createSearch(draft: Draft) {
  const raw = await api<unknown>('/api/prospeccion/searches', { method: 'POST', body: JSON.stringify(buildSearchBody(draft)) });
  const search = normalizeSearch(raw);
  if (!search) throw new ApiError(500, 'La API no devolvió el id de la búsqueda');
  return search;
}

export async function getSearch(id: string) {
  const search = normalizeSearch(await api<unknown>(`/api/prospeccion/searches/${encodeURIComponent(id)}`));
  if (!search) throw new ApiError(500, 'Respuesta de búsqueda inválida');
  return search;
}

export async function listSearches() {
  const raw = await api<unknown>('/api/prospeccion/searches');
  return unwrapList(raw).map(normalizeSearch).filter((item): item is SearchJob => item != null);
}

export async function getProspects(id: string): Promise<ProspectPage> {
  const pageSize = 100;
  const items: Prospect[] = [];
  let total = 0;
  for (let page = 1; page <= 20; page += 1) {
    const raw = await api<unknown>(
      `/api/prospeccion/searches/${encodeURIComponent(id)}/prospects?page=${page}&page_size=${pageSize}`,
    );
    const batch = unwrapList(raw).map(normalizeProspect).filter((item): item is Prospect => item != null);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const reported = num((raw as Record<string, unknown>).total ?? (raw as Record<string, unknown>).count);
      if (reported != null) total = reported;
    }
    items.push(...batch);
    if (batch.length < pageSize || (total > 0 && items.length >= total)) break;
  }
  return { items, total: total || items.length };
}

export async function getUsage(): Promise<{ places_mode: string }> {
  const raw = await api<unknown>('/api/prospeccion/meta/usage');
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    places_mode: str(src.places_mode) || 'mock',
  };
}

export async function getProspect(id: string) {
  const prospect = normalizeProspect(await api<unknown>(`/api/prospeccion/prospects/${encodeURIComponent(id)}`));
  if (!prospect) throw new ApiError(500, 'Prospecto inválido');
  return prospect;
}

export function analyzeSearch(id: string) {
  return api(`/api/prospeccion/searches/${encodeURIComponent(id)}/analyze`, { method: 'POST' });
}

export function analyzeProspect(id: string) {
  return api(`/api/prospeccion/prospects/${encodeURIComponent(id)}/analyze`, { method: 'POST' });
}

export async function getKpis(id: string): Promise<Kpis | null> {
  try {
    return normalizeKpis(await api<unknown>(`/api/prospeccion/searches/${encodeURIComponent(id)}/kpis`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getInsights(id: string): Promise<string[]> {
  try {
    return normalizeInsights(await api<unknown>(`/api/prospeccion/searches/${encodeURIComponent(id)}/insights`));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 204)) return [];
    throw err;
  }
}

export async function getLastExportAt(id: string): Promise<string | null> {
  try {
    const raw = await api<unknown>(`/api/prospeccion/searches/${encodeURIComponent(id)}/exports`);
    const dates = unwrapList(raw)
      .map((item) => (item && typeof item === 'object' ? str((item as Record<string, unknown>).created_at) : null))
      .filter((item): item is string => Boolean(item));
    if (!dates.length) return null;
    return dates.sort().at(-1) ?? null;
  } catch {
    return null;
  }
}

function filenameFrom(res: Response, fallback: string) {
  const header = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(header);
  if (!match) return fallback;
  const cleaned = match[1].replace(/"/g, '').trim();
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned || fallback;
  }
}

async function blobFrom(res: Response, fallback: string) {
  if (!res.ok) throw await asError(res);
  return { blob: await res.blob(), filename: filenameFrom(res, fallback) };
}

async function followExport(meta: Record<string, unknown>, fallback: string) {
  const exportId = str(meta.id ?? meta.export_id);
  const status = str(meta.status);
  if (exportId && (status === 'pending' || status === 'processing')) {
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const current = unwrapEntity(await api<unknown>(`/api/prospeccion/exports/${encodeURIComponent(exportId)}`)) ?? {};
      const next = str(current.status);
      if (next === 'failed') throw new ApiError(500, str(current.error) || 'La exportación falló');
      if (!next || next === 'completed' || next === 'ready') break;
    }
  }
  const downloadUrl = str(meta.download_url ?? meta.url);
  const path = downloadUrl
    ? (downloadUrl.startsWith('http') ? downloadUrl : `${BASE}${downloadUrl}`)
    : `${BASE}/api/prospeccion/exports/${encodeURIComponent(exportId || '')}/download`;
  if (!exportId && !downloadUrl) throw new ApiError(500, 'La exportación no devolvió un archivo');
  const res = await fetch(path, { credentials: 'include', signal: AbortSignal.timeout(60000) });
  return blobFrom(res, fallback);
}

export async function exportFile(searchId: string, request: ExportRequest) {
  const fallback = `prospectos-${searchId}.${request.format}`;
  const body = {
    format: request.format,
    type: request.type,
    qualified_min_score: request.qualified_min_score,
    columns: request.columns,
    include_ai_findings_summary: request.include_ai_findings_summary,
    include_call_recommendations: request.include_call_recommendations,
    prospect_ids: request.prospect_ids,
    filters: {
      ...(request.prospect_ids.length ? { ids: request.prospect_ids.join(',') } : {}),
      ...(request.type === 'qualified_only' ? { min_score: request.qualified_min_score } : {}),
    },
  };
  try {
    const res = await fetch(`${BASE}/api/prospeccion/searches/${encodeURIComponent(searchId)}/exports`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (res.status === 404 || res.status === 405 || res.status === 501) throw new ApiError(res.status, 'Atajo de exportación');
    const type = res.headers.get('content-type') || '';
    if (!res.ok) throw await asError(res);
    if (type.includes('application/json')) {
      const data = await res.json() as unknown;
      const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      return followExport(record, fallback);
    }
    return { blob: await res.blob(), filename: filenameFrom(res, fallback) };
  } catch (err) {
    if (!(err instanceof ApiError) || ![404, 405, 501].includes(err.status)) throw err;
  }

  const params = new URLSearchParams();
  params.set('columns', request.columns.join(','));
  if (request.type === 'executive_summary') params.set('type', 'executive');
  if (request.type === 'qualified_only') params.set('min_score', String(request.qualified_min_score));
  if (request.include_ai_findings_summary) params.set('include_insights', 'true');
  if (request.include_call_recommendations) params.set('include_call_tips', 'true');
  if (request.prospect_ids.length) params.set('ids', request.prospect_ids.join(','));
  const res = await fetch(`${BASE}/api/prospeccion/searches/${encodeURIComponent(searchId)}/export.${request.format}?${params}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(60000),
  });
  return blobFrom(res, fallback);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function geocode(query: string): Promise<GeoHit[]> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '5', 'accept-language': 'es', q: query });
  const res = await fetch(`/nominatim/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo ubicar la zona');
  const data = await res.json() as unknown;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const lng = Number(record.lon);
    const lat = Number(record.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [{ label: String(record.display_name ?? ''), lng, lat }];
  });
}
