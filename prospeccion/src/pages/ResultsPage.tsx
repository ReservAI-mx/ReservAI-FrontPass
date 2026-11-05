import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { analyzeSearch, errorMessage, getProspect, listSearches } from '../api';
import { DetailDrawer } from '../components/DetailDrawer';
import { ConfirmDialog, EmptyState, FallbackBanner, FitBadge, KpiRow, Loading, Pager, ProgressBanner, ScoreCell } from '../components/ui';
import {
  colorFor, filterProspects, filtersActive, fmtNum, fmtPct, PAGE_SIZE, sortProspects, telHref, yesNo, zoneText,
} from '../format';
import { useInsights, useKpiSet, useProspects, useSearchJob } from '../hooks';
import { MOCK_SEARCHES } from '../mock';
import { getActiveSearch, setActiveSearch, setSelected, toggleSelected, useSelection } from '../store';
import { DEFAULT_FILTERS, type ResultFilters } from '../types';

export function ResultsPage() {
  const { searchId } = useParams();
  const [params] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const history = useQuery({ queryKey: ['searches'], queryFn: listSearches, enabled: !searchId, retry: false });
  const job = useSearchJob(searchId);
  const polling = Boolean(searchId) && !job.fallback && (job.search?.status === 'pending' || job.search?.status === 'processing');
  const prospects = useProspects(searchId, polling);
  const insightsQ = useInsights(searchId, false);
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, q: urlQ });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askAnalyze, setAskAnalyze] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selection = useSelection(searchId);
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ['prospect', selectedId],
    enabled: Boolean(selectedId),
    retry: false,
    queryFn: () => getProspect(selectedId!),
  });
  const analyze = useMutation({
    mutationFn: () => analyzeSearch(searchId!),
    onSuccess: async () => {
      setNotice('Análisis encolado. El progreso se actualiza solo.');
      await qc.invalidateQueries({ queryKey: ['search', searchId] });
      await qc.invalidateQueries({ queryKey: ['prospects', searchId] });
      await qc.invalidateQueries({ queryKey: ['insights', searchId] });
      await qc.invalidateQueries({ queryKey: ['kpis', searchId] });
    },
  });

  useEffect(() => {
    setFilters((current) => (current.q === urlQ ? current : { ...current, q: urlQ }));
  }, [urlQ]);
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { setSelectedId(null); }, [searchId]);
  useEffect(() => {
    if (!job.search || job.fallback) return;
    const label = job.search.label || [job.search.city, job.search.zone].filter(Boolean).join(' — ') || 'Búsqueda';
    const current = getActiveSearch();
    if (current?.id === job.search.id && current.label === label) return;
    setActiveSearch({ id: job.search.id, label, city: job.search.city ?? undefined, zone: job.search.zone ?? undefined });
  }, [job.search, job.fallback]);

  const filtered = useMemo(
    () => sortProspects(filterProspects(prospects.rows, filters), filters.sort, filters.order),
    [prospects.rows, filters],
  );
  const kpiSource = prospects.query.isSuccess || prospects.fallback ? prospects.rows : undefined;
  const { kpis } = useKpiSet(searchId, kpiSource, polling);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageIds = pageRows.map((row) => row.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selection.includes(id));
  const listProspect = prospects.rows.find((row) => row.id === selectedId) ?? null;
  const detail = detailQ.data ?? listProspect;

  if (!searchId) {
    const rows = history.data ?? (history.isError ? MOCK_SEARCHES : []);
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>Resultados</h1>
            <p className="lede">Elige una búsqueda o define una zona en el mapa.</p>
          </div>
        </header>
        {history.isPending ? <Loading label="Cargando búsquedas…" /> : null}
        {history.isError ? (
          <FallbackBanner message="No se pudo consultar el historial." onRetry={() => history.refetch()} retrying={history.isFetching} />
        ) : null}
        {!history.isPending && rows.length === 0 ? (
          <EmptyState title="No hay búsquedas" body="Dibuja una zona y elige al menos un giro." action={<Link className="primary" to="/map">Ir al mapa</Link>} />
        ) : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Zona</th><th>Estado</th><th>Prospectos</th></tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        to={`/searches/${item.id}`}
                        onClick={() => setActiveSearch({ id: item.id, label: item.label || 'Búsqueda', city: item.city ?? undefined, zone: item.zone ?? undefined })}
                      >
                        {item.label || item.zone || item.id}
                      </Link>
                    </td>
                    <td>{item.status}</td>
                    <td>{item.businesses_found == null ? '—' : fmtNum(item.businesses_found)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  if (job.query.isPending) return <Loading label="Cargando búsqueda…" />;
  const search = job.search;
  if (!search) return <EmptyState title="Sin búsqueda" body="No se pudo leer esta búsqueda." action={<Link className="primary" to="/map">Volver al mapa</Link>} />;

  const zone = zoneText(search);
  const showFilterEmpty = prospects.rows.length > 0 && filtered.length === 0;
  const showSearchEmpty = !prospects.query.isPending && prospects.rows.length === 0 && !filtersActive(filters) && (search.status === 'completed' || search.status === 'cancelled');
  const canAnalyze = !job.fallback && !prospects.fallback && search.status !== 'failed' && prospects.rows.length > 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Resultados por perímetro</h1>
          <p className="lede">{zone || 'Zona de la búsqueda'}</p>
        </div>
        <div className="row">
          <button type="button" className="ghost" disabled={!canAnalyze || analyze.isPending} onClick={() => setAskAnalyze(true)}>
            {analyze.isPending ? 'Encolando…' : 'Calcular scores'}
          </button>
          <Link className="primary" to={`/searches/${searchId}/export`}>Exportar</Link>
        </div>
      </header>
      {(job.fallback || prospects.fallback) ? (
        <FallbackBanner
          title="No se cargaron los prospectos."
          message={errorMessage(job.query.error ?? prospects.query.error)}
          onRetry={() => { void job.query.refetch(); void prospects.query.refetch(); }}
          retrying={job.query.isFetching || prospects.query.isFetching}
        />
      ) : null}
      {search.status === 'failed' && !job.fallback ? <p className="banner err">{search.error || 'La búsqueda falló.'} <Link to="/map">Volver al mapa</Link></p> : null}
      {search.status === 'cancelled' && !job.fallback ? <p className="banner warn">Esta búsqueda fue cancelada.</p> : null}
      {notice ? <p className="banner ok">{notice}</p> : null}
      {analyze.isError ? <p className="banner err">{errorMessage(analyze.error)}</p> : null}
      <ProgressBanner search={search} />
      <KpiRow items={[
        { label: 'Prospectos encontrados', value: fmtNum(kpis?.prospects_total ?? search.businesses_found) },
        { label: 'Con WhatsApp', value: kpis ? fmtPct(kpis.with_whatsapp.count, kpis.with_whatsapp.pct) : '—' },
        { label: 'Sin sistema de reservas', value: kpis ? fmtPct(kpis.without_booking_system.count, kpis.without_booking_system.pct) : '—' },
        { label: 'Score promedio', value: fmtNum(kpis?.avg_lead_score, 0) },
      ]} />
      {!prospects.fallback && prospects.total > prospects.rows.length ? (
        <p className="muted">Se cargaron {fmtNum(prospects.rows.length)} de {fmtNum(prospects.total)} prospectos.</p>
      ) : null}
      <div className="workspace">
        <div className="stack">
          <div className="toolbar">
            <label className="field grow">Buscar
              <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} />
            </label>
            <label className="field">Orden
              <select
                value={`${filters.sort}:${filters.order}`}
                onChange={(event) => {
                  const [sort, order] = event.target.value.split(':') as [ResultFilters['sort'], ResultFilters['order']];
                  setFilters((current) => ({ ...current, sort, order }));
                }}
              >
                <option value="lead_score:desc">Score (mayor)</option>
                <option value="lead_score:asc">Score (menor)</option>
                <option value="review_count:desc">Reseñas</option>
                <option value="rating:desc">Calificación</option>
                <option value="name:asc">Nombre</option>
              </select>
            </label>
          </div>
          {prospects.query.isPending ? <Loading label="Cargando prospectos…" /> : null}
          {showSearchEmpty ? <EmptyState title="Sin negocios" body="No se encontraron negocios en esta zona." /> : null}
          {showFilterEmpty ? <EmptyState title="Sin coincidencias" body="Ningún prospecto coincide con los filtros de la tabla." /> : null}
          {(polling && filtered.length === 0 && !showSearchEmpty) ? <p className="hint">Los prospectos irán apareciendo mientras la búsqueda avanza.</p> : null}
          {pageRows.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        aria-label="Seleccionar página"
                        onChange={(event) => {
                          const next = new Set(selection);
                          pageIds.forEach((id) => { if (event.target.checked) next.add(id); else next.delete(id); });
                          setSelected(searchId, [...next]);
                        }}
                      />
                    </th>
                    <th>Negocio</th><th>Giro</th><th>Zona</th><th>Teléfono</th><th>Correo</th><th>WhatsApp</th><th>Reseñas</th><th>Oportunidad</th><th>Sucursales</th><th>Score</th><th>Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const phone = row.phone ? telHref(row.phone) : null;
                    return (
                      <tr key={row.id} onClick={() => setSelectedId(row.id)}>
                        <td onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={selection.includes(row.id)} aria-label={`Seleccionar ${row.name}`} onChange={() => toggleSelected(searchId, row.id)} />
                        </td>
                        <td><strong>{row.name}</strong><div className="muted">{row.address ?? 'Sin dirección'}</div></td>
                        <td>{row.category_name ? <span className="pill" style={{ background: colorFor(row.category_name) }}>{row.category_name}</span> : '—'}</td>
                        <td>{row.zone_label || search.zone || '—'}</td>
                        <td>{phone && row.phone ? <a href={phone} onClick={(event) => event.stopPropagation()}>{row.phone}</a> : '—'}</td>
                        <td>{row.email ?? '—'}</td>
                        <td>{yesNo(row.has_whatsapp)}</td>
                        <td>{row.rating == null ? '—' : `${fmtNum(row.rating, 1)} (${fmtNum(row.review_count)})`}</td>
                        <td>{row.opportunity ?? '—'}</td>
                        <td>{row.branch_count == null ? '—' : fmtNum(row.branch_count)}</td>
                        <td><ScoreCell score={row.lead_score} /></td>
                        <td><FitBadge prospect={row} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
        <aside className="panel">
          <h2>Filtros</h2>
          <label className="field">Giro
            <select value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">Todos</option>
              {[...new Map(prospects.rows.map((row) => [row.category_id || row.category_name || '', row.category_name || ''])).entries()]
                .filter(([id]) => id)
                .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field">Score mínimo: {filters.minScore}
            <input type="range" min={0} max={100} step={1} value={filters.minScore} onChange={(event) => setFilters((current) => ({ ...current, minScore: Number(event.target.value) }))} />
          </label>
          <label className="field">Más de N reseñas
            <input type="number" min={0} step={1} value={filters.minReviews || ''} onChange={(event) => setFilters((current) => ({ ...current, minReviews: Number(event.target.value) || 0 }))} />
          </label>
          <label className="switch"><input type="checkbox" checked={filters.hasWhatsapp} onChange={(event) => setFilters((current) => ({ ...current, hasWhatsapp: event.target.checked }))} /> Con WhatsApp</label>
          <label className="switch"><input type="checkbox" checked={filters.hasEmail} onChange={(event) => setFilters((current) => ({ ...current, hasEmail: event.target.checked }))} /> Con correo</label>
          <label className="switch"><input type="checkbox" checked={filters.multiBranch} onChange={(event) => setFilters((current) => ({ ...current, multiBranch: event.target.checked }))} /> 1+ sucursal</label>
          <label className="switch"><input type="checkbox" checked={filters.noBooking} onChange={(event) => setFilters((current) => ({ ...current, noBooking: event.target.checked }))} /> Sin sistema de reservas</label>
          <section className="insight-card">
            <h2>Insights</h2>
            {search.status !== 'completed' && !job.fallback ? <p className="hint">Disponible cuando la búsqueda termine.</p> : null}
            {insightsQ.isPending && search.status === 'completed' ? <Loading label="Cargando hallazgos…" /> : null}
            {insightsQ.isError ? <p className="hint">No se pudieron cargar los hallazgos.</p> : null}
            {insightsQ.data && insightsQ.data.length > 0 ? (
              <ul>{insightsQ.data.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
            ) : null}
            {insightsQ.data && insightsQ.data.length === 0 && search.status === 'completed' ? <p className="hint">Aún no hay análisis de zona.</p> : null}
            <Link to={`/searches/${searchId}/insights`}>Ver análisis</Link>
          </section>
        </aside>
      </div>
      <DetailDrawer
        prospect={selectedId ? detail : null}
        refreshing={detailQ.isFetching && !detailQ.data}
        partial={detailQ.isError}
        blocked={job.fallback || prospects.fallback}
        onClose={() => setSelectedId(null)}
      />
      <ConfirmDialog
        open={askAnalyze}
        title="Calcular scores"
        body="Se recalculará el score de los prospectos de esta búsqueda."
        confirmLabel="Calcular"
        busy={analyze.isPending}
        onClose={() => setAskAnalyze(false)}
        onConfirm={() => { setAskAnalyze(false); analyze.mutate(); }}
      />
    </div>
  );
}
