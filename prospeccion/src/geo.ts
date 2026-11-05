import type { Draft, LngLat } from './types';

const EARTH = 6378137;
export const MAX_AREA_KM2 = 50;

export function closeRing(coords: LngLat[]): LngLat[] {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineM(a: LngLat, b: LngLat) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function polygonMetrics(coords: LngLat[]) {
  const ring = closeRing(coords);
  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
    perimeter += haversineM(ring[i], ring[i + 1]);
  }
  return { areaKm2: Math.abs((area * EARTH * EARTH) / 2) / 1e6, perimeterKm: perimeter / 1000 };
}

export function circleRing(center: { lng: number; lat: number }, radiusM: number, steps = 64): LngLat[] {
  const ring: LngLat[] = [];
  const lat = toRad(center.lat);
  const lng = toRad(center.lng);
  const d = radiusM / EARTH;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
    );
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return ring;
}

export function assessDraft(draft: Draft, opts: { categoryCount: number; categoriesFallback: boolean }) {
  let areaKm2: number | null = null;
  let perimeterKm: number | null = null;

  if (draft.mode === 'radius') {
    if (!draft.center) {
      return { ok: false, reason: 'Haz clic en el mapa para fijar el centro del radio.', areaKm2, perimeterKm };
    }
    if (draft.radiusM < 500 || draft.radiusM > 10000) {
      return { ok: false, reason: 'El radio debe estar entre 0.5 y 10 km.', areaKm2, perimeterKm };
    }
    const km = draft.radiusM / 1000;
    areaKm2 = Math.PI * km * km;
    perimeterKm = 2 * Math.PI * km;
  } else if (draft.polygon.length < 3) {
    return { ok: false, reason: 'Dibuja un polígono de al menos 3 vértices.', areaKm2, perimeterKm };
  } else {
    const metrics = polygonMetrics(draft.polygon);
    areaKm2 = metrics.areaKm2;
    perimeterKm = metrics.perimeterKm;
    if (metrics.areaKm2 > MAX_AREA_KM2) {
      return { ok: false, reason: 'El área supera 50 km². Reduce el polígono.', areaKm2, perimeterKm };
    }
  }

  if (opts.categoriesFallback) {
    return { ok: false, reason: 'No se puede buscar: la API de giros no respondió.', areaKm2, perimeterKm };
  }
  if (opts.categoryCount === 0) {
    return { ok: false, reason: 'Selecciona al menos un giro.', areaKm2, perimeterKm };
  }
  if (draft.minimumRating.trim()) {
    const n = Number(draft.minimumRating);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      return { ok: false, reason: 'La calificación mínima debe estar entre 0 y 5.', areaKm2, perimeterKm };
    }
  }
  if (draft.minimumReviews.trim()) {
    const n = Number(draft.minimumReviews);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, reason: 'El mínimo de reseñas debe ser un entero de 0 o más.', areaKm2, perimeterKm };
    }
  }
  return { ok: true, reason: null as string | null, areaKm2, perimeterKm };
}
