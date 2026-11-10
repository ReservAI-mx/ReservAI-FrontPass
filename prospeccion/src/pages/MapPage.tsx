import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createSearch, errorMessage, geocode, getCategories, getProspect, getUsage } from '../api';
import { assessDraft } from '../geo';
import { fmtKm, fmtNum, visitText, visitTone } from '../format';
import { useProspects, useSearchJob, useZoneVisits } from '../hooks';
import { MOCK_CATEGORIES } from '../mock';
import { loadDraft, saveDraft, setActiveSearch, useActiveSearch } from '../store';
import { EMPTY_DRAFT, type Draft, type FlyTo } from '../types';
import { MapLegend, MapView, type MarkerPoint } from '../components/MapView';
import { DetailDrawer } from '../components/DetailDrawer';
import { FallbackBanner, Loading, StatusBadge, VisitedBar } from '../components/ui';

function freshDraft(): Draft {
  return { ...EMPTY_DRAFT, polygon: [], categoryIds: [] };
}

export function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = useActiveSearch();
  const [draft, setDraft] = useState<Draft>(() => {
    const state = location.state as { reset?: number } | null;
    return state?.reset ? freshDraft() : loadDraft();
  });
  const [fly, setFly] = useState<FlyTo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ['categories', 'active'],
    queryFn: () => getCategories(true),
    retry: false,
    staleTime: 30_000,
  });
  const categories = categoriesQ.data ?? (categoriesQ.isError ? MOCK_CATEGORIES : []);
  const usageQ = useQuery({
    queryKey: ['usage'],
    queryFn: getUsage,
    retry: false,
    staleTime: 30_000,
  });
  const job = useSearchJob(active?.id);
  const search = job.fallback ? undefined : job.search;
  const polling = !job.fallback && (search?.status === 'pending' || search?.status === 'processing');
  const prospects = useProspects(active?.id, polling);
  const zoneVisits = useZoneVisits(search ? active?.id : undefined);
  const detailQ = useQuery({
    queryKey: ['prospect', selectedId],
    enabled: Boolean(selectedId),
    retry: false,
    queryFn: () => getProspect(selectedId!),
  });
  const check = assessDraft(draft, {
    categoryCount: draft.categoryIds.length,
    categoriesFallback: categoriesQ.isError,
  });

  useEffect(() => { saveDraft(draft); }, [draft]);

  useEffect(() => {
    const state = location.state as { reset?: number; fly?: FlyTo } | null;
    if (!state) return;
    if (state.reset) setDraft(freshDraft());
    if (state.fly) {
      setFly(state.fly);
      setDraft((current) => (
        current.mode === 'radius' ? { ...current, center: { lng: state.fly!.lng, lat: state.fly!.lat } } : current
      ));
    }
  }, [location.state]);

  useEffect(() => {
    if (!categoriesQ.data) return;
    const ids = new Set(categoriesQ.data.map((item) => item.id));
    setDraft((current) => {
      const next = current.categoryIds.filter((id) => ids.has(id));
      return next.length === current.categoryIds.length ? current : { ...current, categoryIds: next };
    });
  }, [categoriesQ.data]);

  const mutation = useMutation({
    mutationFn: () => createSearch(draft),
    onSuccess: (created) => {
      const label = [draft.city.trim(), draft.zone.trim()].filter(Boolean).join(' — ') || created.label || 'Zona';
      setActiveSearch({
        id: created.id,
        label,
        city: draft.city.trim() || undefined,
        zone: draft.zone.trim() || undefined,
      });
      navigate(`/searches/${created.id}`);
    },
  });

  async function locate() {
    const query = [draft.zone.trim(), draft.city.trim()].filter(Boolean).join(', ');
    if (!query) return;
    setLocating(true);
    setFormError(null);
    try {
      const hits = await geocode(query);
      const hit = hits[0];
      if (!hit) {
        setFormError('No se encontró esa zona.');
        return;
      }
      setFly({ lng: hit.lng, lat: hit.lat, n: Date.now() });
      if (draft.mode === 'radius') setDraft((current) => ({ ...current, center: { lng: hit.lng, lat: hit.lat } }));
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setLocating(false);
    }
  }

  const rows = useMemo(() => prospects.query.data?.items ?? [], [prospects.query.data]);
  const markers = useMemo<MarkerPoint[]>(() => rows.flatMap((item) => (
    item.lng == null || item.lat == null ? [] : [{
      id: item.id,
      lng: item.lng,
      lat: item.lat,
      name: item.name,
      category: item.category_name ?? '',
      score: item.lead_score,
      rating: item.rating,
      tone: visitTone(item.visit),
      visitText: visitText(item.visit),
    }]
  )), [rows]);
  // Las que ya pintan un prospecto no se repiten como visita suelta.
  const linkedPlaces = useMemo(() => new Set(rows.map((row) => row.place_id).filter(Boolean)), [rows]);
  const gpsVisits = useMemo(
    () => (zoneVisits.data?.items ?? []).filter((visit) => !visit.place_id || !linkedPlaces.has(visit.place_id)),
    [zoneVisits.data, linkedPlaces],
  );
  const visitedCount = rows.filter((row) => row.visit).length;
  const detail = detailQ.data ?? rows.find((row) => row.id === selectedId) ?? null;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const extraFilters = [
    draft.minimumRating && `★ ${draft.minimumRating}+`,
    draft.minimumReviews && `${draft.minimumReviews}+ reseñas`,
    draft.requirePhone && 'teléfono',
    draft.requireWebsite && 'sitio web',
    draft.requireEmail && 'correo',
    draft.includeClosed && 'con cerrados',
  ].filter(Boolean);

  return (
    <div className="page page-map">
      {usageQ.data?.places_mode === 'mock' ? (
        <div className="banner warn compact">
          <p>Modo de prueba: esta instalación no consulta Google Maps (falta <code>GOOGLE_PLACES_API_KEY</code>) y las búsquedas traen negocios de ejemplo.</p>
        </div>
      ) : null}
      {categoriesQ.isError ? (
        <FallbackBanner
          message="No se pudieron cargar los giros. Los mostrados son de ejemplo y no se pueden usar para buscar."
          onRetry={() => categoriesQ.refetch()}
          retrying={categoriesQ.isFetching}
        />
      ) : null}
      {formError ? <p className="banner err compact">{formError}</p> : null}
      <div className="map-layout">
        <div className="map-stage">
          <MapView
            mode={draft.mode}
            polygon={draft.polygon}
            center={draft.center}
            radiusM={draft.radiusM}
            markers={markers}
            searchArea={search?.area ?? null}
            visits={gpsVisits}
            fitKey={search?.area ? search.id : null}
            flyTo={fly}
            onAddVertex={(lng, lat) => setDraft((current) => ({ ...current, polygon: [...current.polygon, [lng, lat]] }))}
            onMoveVertex={(index, lng, lat) => setDraft((current) => ({
              ...current,
              polygon: current.polygon.map((point, pointIndex) => pointIndex === index ? [lng, lat] : point),
            }))}
            onSetCenter={(lng, lat) => setDraft((current) => ({ ...current, center: { lng, lat } }))}
            onSelectProspect={setSelectedId}
          />
          <div className="map-overlay">
            <p>
              {draft.mode === 'polygon'
                ? draft.polygon.length ? `${draft.polygon.length} vértices` : 'Toca el mapa para marcar la zona'
                : draft.center ? 'Centro fijado' : 'Toca el mapa para fijar el centro'}
              {check.areaKm2 != null ? ` · ${fmtKm(check.areaKm2)} km²` : ''}
            </p>
            <div className="row">
              <button type="button" className="ghost sm" disabled={draft.mode !== 'polygon' || draft.polygon.length === 0} onClick={() => setDraft((current) => ({ ...current, polygon: current.polygon.slice(0, -1) }))}>
                Deshacer
              </button>
              <button type="button" className="ghost sm" disabled={!draft.polygon.length && !draft.center} onClick={() => set({ polygon: [], center: null })}>
                Limpiar
              </button>
            </div>
          </div>
          {markers.length || gpsVisits.length ? <MapLegend withVisits={gpsVisits.length > 0} /> : null}
        </div>
        <aside className="panel map-panel">
          {active ? (
            <section className="active-card">
              <div className="active-card-head">
                <div>
                  <p className="eyebrow">Búsqueda activa</p>
                  <strong>{active.label}</strong>
                </div>
                {search ? <StatusBadge status={search.status} /> : null}
              </div>
              {job.query.isPending ? <Loading label="Cargando…" /> : null}
              {search ? (
                <>
                  <div className="active-card-nums">
                    <span><strong>{fmtNum(prospects.total || search.businesses_found)}</strong> negocios</span>
                    <span><strong>{fmtNum(zoneVisits.data?.summary.total ?? 0)}</strong> visitas en la zona</span>
                  </div>
                  <VisitedBar visited={visitedCount} total={rows.length} />
                </>
              ) : null}
              {job.fallback ? <p className="hint">No se pudo cargar la búsqueda activa.</p> : null}
              <div className="row">
                <Link className="primary sm" to={`/searches/${active.id}`}>Ver lista</Link>
                <button type="button" className="ghost sm" onClick={() => setActiveSearch(null)}>Quitar del mapa</button>
              </div>
            </section>
          ) : null}

          <div className="panel-title">
            <h2>Nueva zona</h2>
            <p className="hint">Marca la zona en el mapa, elige giros y busca.</p>
          </div>
          <div className="segment" role="group" aria-label="Modo de zona">
            <button type="button" className={draft.mode === 'polygon' ? 'on' : ''} onClick={() => set({ mode: 'polygon' })}>Polígono</button>
            <button type="button" className={draft.mode === 'radius' ? 'on' : ''} onClick={() => set({ mode: 'radius' })}>Radio</button>
          </div>
          <div className="two">
            <label className="field">Ciudad
              <input value={draft.city} placeholder="Guadalajara" onChange={(event) => set({ city: event.target.value })} />
            </label>
            <label className="field">Zona o colonia
              <input value={draft.zone} placeholder="Chapalita" onChange={(event) => set({ zone: event.target.value })} />
            </label>
          </div>
          <button type="button" className="ghost" disabled={locating || (!draft.city.trim() && !draft.zone.trim())} onClick={() => void locate()}>
            {locating ? 'Ubicando…' : 'Ubicar en el mapa'}
          </button>
          {draft.mode === 'radius' ? (
            <label className="field">Radio: {fmtKm(draft.radiusM / 1000)} km
              <input
                type="range"
                min={500}
                max={10000}
                step={100}
                value={draft.radiusM}
                onChange={(event) => set({ radiusM: Number(event.target.value) })}
              />
            </label>
          ) : null}
          <div>
            <div className="label-row">
              <p className="section-label">Giros</p>
              {categories.length > 1 ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => set({ categoryIds: draft.categoryIds.length === categories.length ? [] : categories.map((c) => c.id) })}
                >
                  {draft.categoryIds.length === categories.length ? 'Ninguno' : 'Todos'}
                </button>
              ) : null}
            </div>
            {categoriesQ.isPending ? <Loading label="Cargando giros…" /> : null}
            {!categoriesQ.isPending && categories.length === 0 ? <p className="hint">No hay giros activos. Créalos en Configuración.</p> : null}
            <div className="chips">
              {categories.map((category) => {
                const on = draft.categoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      categoryIds: on ? current.categoryIds.filter((id) => id !== category.id) : [...current.categoryIds, category.id],
                    }))}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
          <details className="more">
            <summary>
              Más filtros
              {extraFilters.length ? <span className="muted"> · {extraFilters.join(', ')}</span> : null}
            </summary>
            <div className="two">
              <label className="field">Calificación mínima
                <input type="number" min={0} max={5} step={0.1} value={draft.minimumRating} placeholder="4.0" onChange={(event) => set({ minimumRating: event.target.value })} />
              </label>
              <label className="field">Mínimo de reseñas
                <input type="number" min={0} step={1} value={draft.minimumReviews} placeholder="20" onChange={(event) => set({ minimumReviews: event.target.value })} />
              </label>
            </div>
            <label className="switch"><input type="checkbox" checked={draft.requirePhone} onChange={(event) => set({ requirePhone: event.target.checked })} /> Con teléfono</label>
            <label className="switch"><input type="checkbox" checked={draft.requireWebsite} onChange={(event) => set({ requireWebsite: event.target.checked })} /> Con sitio web</label>
            <label className="switch"><input type="checkbox" checked={draft.requireEmail} onChange={(event) => set({ requireEmail: event.target.checked })} /> Con correo</label>
            <label className="switch"><input type="checkbox" checked={draft.includeClosed} onChange={(event) => set({ includeClosed: event.target.checked })} /> Incluir cerrados</label>
          </details>
          <div className="submit-box">
            <p className={check.ok ? 'hint ok-text' : 'hint'}>{check.reason ?? 'Listo para buscar en esta zona.'}</p>
            <button
              type="button"
              className="primary block"
              disabled={!check.ok || mutation.isPending}
              onClick={() => {
                setFormError(null);
                mutation.mutate(undefined, { onError: (err) => setFormError(errorMessage(err)) });
              }}
            >
              {mutation.isPending ? 'Creando búsqueda…' : 'Buscar negocios en esta zona'}
            </button>
          </div>
        </aside>
      </div>
      <DetailDrawer
        prospect={selectedId ? detail : null}
        refreshing={detailQ.isFetching && !detailQ.data}
        partial={detailQ.isError}
        blocked={job.fallback || prospects.fallback}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
