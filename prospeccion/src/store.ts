import { useSyncExternalStore } from 'react';
import { EMPTY_DRAFT, type ActiveSearch, type Draft, type LngLat } from './types';

const ACTIVE_KEY = 'prospectai.activeSearch';
const DRAFT_KEY = 'prospectai.draft';
const EMPTY_IDS: string[] = [];

let active: ActiveSearch | null = readActive();
const selections = new Map<string, string[]>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readActive(): ActiveSearch | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null') as ActiveSearch | null;
    if (raw && typeof raw.id === 'string') return raw;
  } catch {
    return null;
  }
  return null;
}

export function getActiveSearch() {
  return active;
}

export function setActiveSearch(next: ActiveSearch | null) {
  active = next;
  if (next) localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
  else localStorage.removeItem(ACTIVE_KEY);
  emit();
}

export function useActiveSearch() {
  return useSyncExternalStore(subscribe, () => active, () => null);
}

function selectionKey(searchId: string) {
  return `prospectai.sel.${searchId}`;
}

function ensureSelection(searchId: string) {
  const cached = selections.get(searchId);
  if (cached) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(selectionKey(searchId)) || '[]') as unknown;
    const ids = Array.isArray(raw) ? raw.map(String) : [];
    selections.set(searchId, ids);
    return ids;
  } catch {
    selections.set(searchId, []);
    return selections.get(searchId)!;
  }
}

function selectionSnapshot(searchId: string | undefined) {
  if (!searchId) return EMPTY_IDS;
  return ensureSelection(searchId);
}

export function useSelection(searchId: string | undefined) {
  return useSyncExternalStore(subscribe, () => selectionSnapshot(searchId), () => EMPTY_IDS);
}

export function setSelected(searchId: string, ids: string[]) {
  selections.set(searchId, ids);
  localStorage.setItem(selectionKey(searchId), JSON.stringify(ids));
  emit();
}

export function toggleSelected(searchId: string, prospectId: string) {
  const current = ensureSelection(searchId);
  const next = current.includes(prospectId)
    ? current.filter((id) => id !== prospectId)
    : [...current, prospectId];
  setSelected(searchId, next);
}

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

export function loadDraft(): Draft {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as Partial<Draft> | null;
    if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT, polygon: [], categoryIds: [] };
    const radius = Number(raw.radiusM);
    return {
      mode: raw.mode === 'radius' ? 'radius' : 'polygon',
      polygon: Array.isArray(raw.polygon) ? raw.polygon.filter(isLngLat) : [],
      center: raw.center && Number.isFinite(raw.center.lng) && Number.isFinite(raw.center.lat) ? raw.center : null,
      radiusM: Number.isFinite(radius) ? Math.min(10000, Math.max(500, radius)) : EMPTY_DRAFT.radiusM,
      categoryIds: Array.isArray(raw.categoryIds) ? raw.categoryIds.map(String) : [],
      city: typeof raw.city === 'string' ? raw.city : '',
      zone: typeof raw.zone === 'string' ? raw.zone : '',
      minimumRating: typeof raw.minimumRating === 'string' ? raw.minimumRating : '',
      minimumReviews: typeof raw.minimumReviews === 'string' ? raw.minimumReviews : '',
      requirePhone: raw.requirePhone === true,
      requireWebsite: raw.requireWebsite === true,
      requireEmail: raw.requireEmail === true,
      includeClosed: raw.includeClosed === true,
    };
  } catch {
    return { ...EMPTY_DRAFT, polygon: [], categoryIds: [] };
  }
}

export function saveDraft(draft: Draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
