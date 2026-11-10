export type LngLat = [number, number];

export type DrawMode = 'polygon' | 'radius';

export type Draft = {
  mode: DrawMode;
  polygon: LngLat[];
  center: { lng: number; lat: number } | null;
  radiusM: number;
  categoryIds: string[];
  city: string;
  zone: string;
  minimumRating: string;
  minimumReviews: string;
  requirePhone: boolean;
  requireWebsite: boolean;
  requireEmail: boolean;
  includeClosed: boolean;
};

export const EMPTY_DRAFT: Draft = {
  mode: 'polygon',
  polygon: [],
  center: null,
  radiusM: 1500,
  categoryIds: [],
  city: '',
  zone: '',
  minimumRating: '',
  minimumReviews: '',
  requirePhone: false,
  requireWebsite: false,
  requireEmail: false,
  includeClosed: false,
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  google_place_types: string[];
  search_terms: string[];
  is_active: boolean;
};

export type CategoryInput = {
  name: string;
  slug: string;
  google_place_types: string[];
  search_terms: string[];
  is_active: boolean;
};

export type SearchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type SearchJob = {
  id: string;
  status: SearchStatus;
  businesses_found: number | null;
  businesses_processed: number | null;
  progress: number | null;
  stage: string | null;
  error: string | null;
  label: string | null;
  city: string | null;
  zone: string | null;
  created_at: string | null;
  area: SearchArea | null;
  visited_count: number | null;
};

export type SearchArea =
  | { type: 'polygon'; coordinates: LngLat[] }
  | { type: 'radius'; center: { lng: number; lat: number }; radius_m: number };

/** La visita más reciente de la Bitácora al mismo lugar de Google. */
export type ProspectVisit = {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  date: string | null;
  result: string | null;
  shared_with: string | null;
  count: number;
};

/** Visita de la Bitácora dentro de la zona de una búsqueda. */
export type AreaVisit = {
  id: string;
  business: string | null;
  category: string | null;
  date: string | null;
  result: string | null;
  seller_id: string | null;
  seller_name: string | null;
  place_id: string | null;
  interest: number | null;
  lng: number;
  lat: number;
};

export type ZoneVisits = {
  items: AreaVisit[];
  summary: {
    total: number;
    closed: number;
    in_progress: number;
    linked: number;
    last_date: string | null;
    by_seller: { seller_id: string | null; name: string | null; count: number }[];
  };
};

export type Prospect = {
  id: string;
  place_id: string | null;
  name: string;
  address: string | null;
  category_id: string | null;
  category_name: string | null;
  zone_label: string | null;
  phone: string | null;
  email: string | null;
  email_status: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  branch_count: number | null;
  has_whatsapp: boolean | null;
  booking_system_detected: boolean | null;
  lead_score: number | null;
  reservai_fit: string | null;
  status_label: string | null;
  review_summary: string | null;
  pain_points: string[];
  positive_signals: string[];
  sales_angle: string | null;
  opportunity: string | null;
  analyzed_at: string | null;
  lng: number | null;
  lat: number | null;
  visit: ProspectVisit | null;
};

export type Kpis = {
  prospects_total: number;
  with_whatsapp: { count: number; pct: number };
  with_email: { count: number; pct: number };
  without_booking_system: { count: number; pct: number };
  avg_rating: number | null;
  avg_lead_score: number | null;
  visited: { count: number; pct: number };
};

export type ProspectPage = {
  items: Prospect[];
  total: number;
};

export type ResultFilters = {
  q: string;
  categoryId: string;
  minScore: number;
  minReviews: number;
  hasWhatsapp: boolean;
  hasEmail: boolean;
  multiBranch: boolean;
  noBooking: boolean;
  visit: 'all' | 'pending' | 'visited';
  sort: 'lead_score' | 'review_count' | 'rating' | 'name';
  order: 'asc' | 'desc';
};

export const DEFAULT_FILTERS: ResultFilters = {
  q: '',
  categoryId: '',
  minScore: 0,
  minReviews: 0,
  hasWhatsapp: false,
  hasEmail: false,
  multiBranch: false,
  noBooking: false,
  visit: 'all',
  sort: 'lead_score',
  order: 'desc',
};

export type ExportFormat = 'csv' | 'pdf';
export type ExportType = 'full_table' | 'executive_summary' | 'qualified_only';

export type ExportRequest = {
  format: ExportFormat;
  type: ExportType;
  qualified_min_score: number;
  columns: string[];
  include_ai_findings_summary: boolean;
  include_call_recommendations: boolean;
  prospect_ids: string[];
};

export type FlyTo = { lng: number; lat: number; n: number };

export type ActiveSearch = { id: string; label: string; city?: string; zone?: string };

export type GeoHit = { label: string; lng: number; lat: number };
