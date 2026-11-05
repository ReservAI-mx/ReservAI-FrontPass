import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { createSearch, errorMessage, geocode, getCategories, getUsage } from '../api';
import { assessDraft } from '../geo';
import { colorFor, fmtKm, fmtNum, fmtPct } from '../format';
import { useKpiSet, useProspects, useSearchJob } from '../hooks';
import { MOCK_CATEGORIES } from '../mock';
import { loadDraft, saveDraft, setActiveSearch, useActiveSearch } from '../store';
import { EMPTY_DRAFT, type Draft, type FlyTo } from '../types';
import { MapView } from '../components/MapView';
import { FallbackBanner, KpiRow, Loading } from '../components/ui';

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
  const polling = !job.fallback && (job.search?.status === 'pending' || job.search?.status === 'processing');
  const prospects = useProspects(active?.id, polling);
  const realRows = prospects.query.isSuccess ? prospects.rows : undefined;
  const { kpis } = useKpiSet(active?.id, realRows, polling);
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

  const markers = (prospects.query.data?.items ?? []).flatMap((item) => (
    item.lng == null || item.lat == null ? [] : [{
      id: item.id,
      lng: item.lng,
      lat: item.lat,
      name: item.name,
      category: item.category_name ?? '',
      color: colorFor(item.category_name || item.id),
    }]
  ));

  const kpiItems = kpis ? [
    { label: 'Prospectos encontrados', value: fmtNum(kpis.prospects_total) },
    { label: 'Con WhatsApp', value: fmtPct(kpis.with_whatsapp.count, kpis.with_whatsapp.pct) },
    { label: 'Con correo', value: fmtPct(kpis.with_email.count, kpis.with_email.pct) },
    { label: 'Rating promedio', value: fmtNum(kpis.avg_rating, 1), hint: 'De la búsqueda activa' },
  ] : [
    { label: 'Prospectos encontrados', value: '—' },
    { label: 'Con WhatsApp', value: '—' },
    { label: 'Con correo', value: '—' },
    { label: 'Rating promedio', value: '—' },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Prospección por zona</h1>
          <p className="lede">Dibuja un polígono o elige un radio. La búsqueda y el correo se resuelven en el servidor.</p>
        </div>
      </header>
      {usageQ.data?.places_mode === 'mock' ? (
        <p className="banner warn">
          Esta instalación no consulta Google Maps. Falta <code>GOOGLE_PLACES_API_KEY</code> en <code>Prospeccion/api/.env</code>.
          Hasta que la pongas y reinicies la API, las búsquedas usan negocios de prueba.
        </p>
      ) : null}
      {categoriesQ.isError ? (
        <FallbackBanner
          message="No se pudieron cargar los giros. Los mostrados son de ejemplo y no se pueden usar para buscar."
          onRetry={() => categoriesQ.refetch()}
          retrying={categoriesQ.isFetching}
        />
      ) : null}
      <KpiRow items={kpiItems} />
      {formError ? <p className="banner err">{formError}</p> : null}
      <div className="workspace">
        <div className="map-stage">
          <MapView
            mode={draft.mode}
            polygon={draft.polygon}
            center={draft.center}
            radiusM={draft.radiusM}
            markers={markers}
            flyTo={fly}
            onAddVertex={(lng, lat) => setDraft((current) => ({ ...current, polygon: [...current.polygon, [lng, lat]] }))}
            onMoveVertex={(index, lng, lat) => setDraft((current) => ({
              ...current,
              polygon: current.polygon.map((point, pointIndex) => pointIndex === index ? [lng, lat] : point),
            }))}
            onSetCenter={(lng, lat) => setDraft((current) => ({ ...current, center: { lng, lat } }))}
          />
          <div className="map-overlay">
            <p>
              {draft.mode === 'polygon'
                ? `${draft.polygon.length} vértices`
                : draft.center ? 'Centro fijado' : 'Sin centro'}
              {check.areaKm2 != null ? ` · ${fmtKm(check.areaKm2)} km² · ${fmtKm(check.perimeterKm)} km` : ''}
            </p>
            <div className="row">
              <button type="button" className="ghost" disabled={draft.mode !== 'polygon' || draft.polygon.length === 0} onClick={() => setDraft((current) => ({ ...current, polygon: current.polygon.slice(0, -1) }))}>
                Quitar último
              </button>
              <button type="button" className="ghost" onClick={() => setDraft((current) => ({ ...current, polygon: [], center: null }))}>
                Limpiar zona
              </button>
            </div>
          </div>
        </div>
        <aside className="panel">
          <div className="segment" role="group" aria-label="Modo de zona">
            <button type="button" className={draft.mode === 'polygon' ? 'on' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'polygon' }))}>Polígono</button>
            <button type="button" className={draft.mode === 'radius' ? 'on' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'radius' }))}>Radio</button>
          </div>
          <label className="field">Ciudad
            <input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} />
          </label>
          <label className="field">Zona o colonia
            <input value={draft.zone} onChange={(event) => setDraft((current) => ({ ...current, zone: event.target.value }))} />
          </label>
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
                onChange={(event) => setDraft((current) => ({ ...current, radiusM: Number(event.target.value) }))}
              />
            </label>
          ) : null}
          <div>
            <p className="section-label">Giros</p>
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
          <label className="field">Calificación mínima
            <input type="number" min={0} max={5} step={0.1} value={draft.minimumRating} onChange={(event) => setDraft((current) => ({ ...current, minimumRating: event.target.value }))} />
          </label>
          <label className="field">Mínimo de reseñas
            <input type="number" min={0} step={1} value={draft.minimumReviews} onChange={(event) => setDraft((current) => ({ ...current, minimumReviews: event.target.value }))} />
          </label>
          <label className="switch"><input type="checkbox" checked={draft.requirePhone} onChange={(event) => setDraft((current) => ({ ...current, requirePhone: event.target.checked }))} /> Con teléfono</label>
          <label className="switch"><input type="checkbox" checked={draft.requireWebsite} onChange={(event) => setDraft((current) => ({ ...current, requireWebsite: event.target.checked }))} /> Con sitio web</label>
          <label className="switch"><input type="checkbox" checked={draft.requireEmail} onChange={(event) => setDraft((current) => ({ ...current, requireEmail: event.target.checked }))} /> Con correo</label>
          <label className="switch"><input type="checkbox" checked={draft.includeClosed} onChange={(event) => setDraft((current) => ({ ...current, includeClosed: event.target.checked }))} /> Incluir cerrados</label>
          <p className="hint">{check.reason ?? 'Listo para buscar en esta zona.'}</p>
          <button
            type="button"
            className="primary"
            disabled={!check.ok || mutation.isPending}
            onClick={() => {
              setFormError(null);
              mutation.mutate(undefined, { onError: (err) => setFormError(errorMessage(err)) });
            }}
          >
            {mutation.isPending ? 'Creando búsqueda…' : 'Buscar prospectos en esta zona'}
          </button>
        </aside>
      </div>
    </div>
  );
}
