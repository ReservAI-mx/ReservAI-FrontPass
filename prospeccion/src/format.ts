import type { Prospect, ResultFilters } from './types';

export const PAGE_SIZE = 20;

export const EXPORT_COLUMNS = [
  { id: 'name', label: 'Negocio' },
  { id: 'category', label: 'Giro' },
  { id: 'phone', label: 'Teléfono' },
  { id: 'email', label: 'Correo' },
  { id: 'rating', label: 'Calificación' },
  { id: 'review_count', label: 'Reseñas' },
  { id: 'lead_score', label: 'Score' },
  { id: 'zone', label: 'Zona' },
  { id: 'address', label: 'Dirección' },
  { id: 'website', label: 'Sitio web' },
  { id: 'sales_angle', label: 'Ángulo de venta' },
  { id: 'opportunity', label: 'Oportunidad' },
] as const;

export type ExportColumnId = (typeof EXPORT_COLUMNS)[number]['id'];

const PALETTE = ['#0983d6', '#4ade80', '#fbbf24', '#a78bfa', '#7cc4f5', '#008bbd', '#ff8484'];

const FIT: Record<string, string> = {
  high: 'Alto potencial',
  potential: 'Potencial',
  medium: 'Medio',
  mid: 'Medio',
  low: 'Bajo',
};

const EMAIL_STATUS: Record<string, string> = {
  not_found: 'No encontrado',
  no_website: 'Sin sitio web',
  fetch_failed: 'No se pudo leer el sitio',
  found: 'Encontrado',
};

const STAGE: Record<string, string> = {
  validate: 'Validando zona',
  discovery: 'Buscando negocios',
  enrich: 'Enriqueciendo datos',
  enrichment: 'Enriqueciendo datos',
  email: 'Buscando correos',
  scoring: 'Calculando scores',
  ai_analysis: 'Calculando scores',
  insights: 'Generando hallazgos',
};

export function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function fmtNum(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtKm(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  const digits = value < 10 ? 2 : 1;
  return value.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtPct(count: number, pct: number) {
  return `${fmtNum(count)} · ${fmtNum(pct, 0)}%`;
}

export function fmtDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fitLabel(prospect: Pick<Prospect, 'status_label' | 'reservai_fit'>) {
  if (prospect.status_label) return prospect.status_label;
  if (!prospect.reservai_fit) return '—';
  return FIT[prospect.reservai_fit] ?? prospect.reservai_fit;
}

export function fitTone(label: string) {
  const text = label.toLowerCase();
  if (text.includes('alto')) return 'high';
  if (text.includes('potencial')) return 'potential';
  if (text.includes('medio')) return 'medium';
  if (text.includes('bajo')) return 'low';
  return 'neutral';
}

export function emailStatusLabel(status: string | null) {
  if (!status) return null;
  return EMAIL_STATUS[status] ?? status;
}

export function stageLabel(stage: string | null) {
  if (!stage) return 'Procesando búsqueda';
  return STAGE[stage] ?? 'Procesando búsqueda';
}

export function yesNo(value: boolean | null) {
  if (value == null) return '—';
  return value ? 'Sí' : 'No';
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

export function safeHttp(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function telHref(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized ? `tel:${normalized}` : null;
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function splitList(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

export function filtersActive(filters: ResultFilters) {
  return Boolean(
    filters.q.trim()
    || filters.categoryId
    || filters.minScore > 0
    || filters.minReviews > 0
    || filters.hasWhatsapp
    || filters.hasEmail
    || filters.multiBranch
    || filters.noBooking,
  );
}

export function filterProspects(rows: Prospect[], filters: ResultFilters) {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((prospect) => {
    if (q) {
      const haystack = `${prospect.name} ${prospect.address ?? ''} ${prospect.email ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.categoryId) {
      const id = prospect.category_id || prospect.category_name;
      if (id !== filters.categoryId && prospect.category_name !== filters.categoryId) return false;
    }
    if (filters.minScore > 0 && (prospect.lead_score == null || prospect.lead_score < filters.minScore)) return false;
    if (filters.minReviews > 0 && (prospect.review_count == null || prospect.review_count <= filters.minReviews)) return false;
    if (filters.hasWhatsapp && prospect.has_whatsapp !== true) return false;
    if (filters.hasEmail && !prospect.email) return false;
    if (filters.multiBranch && (prospect.branch_count == null || prospect.branch_count < 1)) return false;
    if (filters.noBooking && prospect.booking_system_detected !== false) return false;
    return true;
  });
}

export function sortProspects(rows: Prospect[], sort: ResultFilters['sort'], order: ResultFilters['order']) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'es') * (order === 'asc' ? 1 : -1);
    const left = a[sort];
    const right = b[sort];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return (left - right) * (order === 'asc' ? 1 : -1);
  });
  return copy;
}

export function exportCell(prospect: Prospect, column: string, zoneFallback: string) {
  switch (column) {
    case 'name': return prospect.name;
    case 'category': return prospect.category_name ?? '—';
    case 'phone': return prospect.phone ?? '—';
    case 'email': return prospect.email ?? '—';
    case 'rating': return prospect.rating == null ? '—' : prospect.rating.toFixed(1);
    case 'review_count': return prospect.review_count == null ? '—' : String(prospect.review_count);
    case 'lead_score': return prospect.lead_score == null ? '—' : String(Math.round(prospect.lead_score));
    case 'zone': return prospect.zone_label || zoneFallback || '—';
    case 'address': return prospect.address ?? '—';
    case 'website': return prospect.website ?? '—';
    case 'sales_angle': return prospect.sales_angle ?? '—';
    case 'opportunity': return prospect.opportunity ?? '—';
    default: return '—';
  }
}

export function zoneText(search: { city: string | null; zone: string | null; label: string | null } | undefined) {
  if (!search) return '';
  if (search.city && search.zone) return `${search.city} / ${search.zone}`;
  return search.label || search.zone || search.city || '';
}
