import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { analyzeSearch, errorMessage, getProspect, listSearches } from '../api';
import { DetailDrawer } from '../components/DetailDrawer';
import { Bullets, Funnel } from '../components/charts';
import {
  ConfirmDialog, EmptyState, FallbackBanner, Loading, Pager, ProgressBanner, ScoreCell, StatusBadge,
  VisitBadge, VisitedBar, ZoneWork,
} from '../components/ui';
import {
  bitacoraHref, colorFor, filterProspects, filtersActive, fmtDay, fmtNum, PAGE_SIZE, sortProspects, telHref, visitTone, waHref, zoneText,
} from '../format';
import { useInsights, useKpiSet, useNarrow, useProspects, useSearchJob, useZoneVisits } from '../hooks';
import { MOCK_SEARCHES } from '../mock';
import { getActiveSearch, setActiveSearch, setSelected, toggleSelected, useSelection } from '../store';
import { DEFAULT_FILTERS, type Prospect, type ResultFilters, type SearchJob } from '../types';

function activate(item: SearchJob) {
  setActiveSearch({ id: item.id, label: item.label || 'Búsqueda', city: item.city ?? undefined, zone: item.zone ?? undefined });
}

/* Sin búsqueda elegida: el historial, con cuánto de cada zona ya se visitó. */
function SearchHistory() {
  const history = useQuery({ queryKey: ['searches'], queryFn: listSearches, retry: false });
  const rows = history.data ?? (history.isError ? MOCK_SEARCHES : []);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Zonas buscadas</h1>
          <p className="lede">Cada búsqueda es una zona. La barra dice cuántos de sus negocios ya visitó el equipo.</p>
        </div>
        <Link className="primary" to="/map" state={{ reset: Date.now() }}>Nueva zona</Link>
      </header>
      {history.isPending ? <Loading label="Cargando búsquedas…" /> : null}
      {history.isError ? (
        <FallbackBanner message="No se pudo consultar el historial." onRetry={() => history.refetch()} retrying={history.isFetching} />
      ) : null}
      {!history.isPending && rows.length === 0 ? (
        <EmptyState title="No hay búsquedas" body="Dibuja una zona en el mapa y elige al menos un giro." action={<Link className="primary" to="/map">Ir al mapa</Link>} />
      ) : null}
      {rows.length > 0 ? (
        <div className="search-grid">
          {rows.map((item) => (
            <Link key={item.id} to={`/searches/${item.id}`} className="search-card" onClick={() => activate(item)}>
              <div className="search-card-head">
                <strong>{item.label || item.zone || 'Zona sin nombre'}</strong>
                <StatusBadge status={item.status} />
              </div>
              <p className="muted">{item.created_at ? `Buscada el ${fmtDay(item.created_at)}` : '—'}</p>
              <p><strong>{fmtNum(item.businesses_found ?? 0)}</strong> <span className="muted">negocios</span></p>
              {item.status === 'completed' ? <VisitedBar visited={item.visited_count ?? 0} total={item.businesses_found ?? 0} /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* Teléfono: una tarjeta por negocio en lugar de la tabla. */
function ProspectCard({ row, onOpen }: { row: Prospect; onOpen: () => void }) {
  const phone = row.phone ? telHref(row.phone) : null;
  const wa = row.has_whatsapp !== false ? waHref(row.phone) : null;
  return (
    <article className="prospect-card">
      <button type="button" className="prospect-card-main" onClick={onOpen}>
        <span className="prospect-card-top">
          <strong>{row.name}</strong>
          <ScoreCell score={row.lead_score} />
        </span>
        <span className="muted">{[row.category_name, row.rating != null ? `★ ${fmtNum(row.rating, 1)} (${fmtNum(row.review_count)})` : null].filter(Boolean).join(' · ')}</span>
        <span className="muted small">{row.address ?? 'Sin dirección'}</span>
        <VisitBadge visit={row.visit} />
      </button>
      <div className="action-row">
        <a className="primary sm" href={bitacoraHref(row.id)}>{row.visit ? 'Otra visita' : 'Registrar visita'}</a>
        {phone ? <a className="ghost sm" href={phone}>Llamar</a> : null}
        {wa ? <a className="ghost sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}
      </div>
    </article>
  );
}

export function ResultsPage() {
  const { searchId } = useParams();
  if (!searchId) return <SearchHistory />;
  return <SearchResults searchId={searchId} />;
}

function SearchResults({ searchId }: { searchId: string }) {
  const [params] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const job = useSearchJob(searchId);
  const polling = !job.fallback && (job.search?.status === 'pending' || job.search?.status === 'processing');
  const prospects = useProspects(searchId, polling);
  const zoneVisits = useZoneVisits(searchId);
  const insightsQ = useInsights(searchId, false);
  const narrow = useNarrow();
  const [filters, setFilters] = useState<ResultFilters>({ ...DEFAULT_FILTERS, q: urlQ });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askAnalyze, setAskAnalyze] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const selection = useSelection(searchId);
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ['prospect', selectedId],
    enabled: Boolean(selectedId),
    retry: false,
    queryFn: () => getProspect(selectedId!),
  });
  const analyze = useMutation({
    mutationFn: () => analyzeSearch(searchId),
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
  const visitedCount = prospects.rows.filter((row) => row.visit).length;
  const categoriesInResults = [...new Map(prospects.rows.map((row) => [row.category_id || row.category_name || '', row.category_name || ''])).entries()]
    .filter(([id]) => id);

  if (job.query.isPending) return <Loading label="Cargando búsqueda…" />;
  const search = job.search;
  if (!search) return <EmptyState title="Sin búsqueda" body="No se pudo leer esta búsqueda." action={<Link className="primary" to="/map">Volver al mapa</Link>} />;

  const zone = zoneText(search);
  const showFilterEmpty = prospects.rows.length > 0 && filtered.length === 0;
  const showSearchEmpty = !prospects.query.isPending && prospects.rows.length === 0 && !filtersActive(filters) && (search.status === 'completed' || search.status === 'cancelled');
  const canAnalyze = !job.fallback && !prospects.fallback && search.status !== 'failed' && prospects.rows.length > 0;
  const setF = (patch: Partial<ResultFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const total = kpis?.prospects_total ?? search.businesses_found ?? prospects.rows.length;

  const filterPanel = (
    <>
      <label className="field">Giro
        <select value={filters.categoryId} onChange={(event) => setF({ categoryId: event.target.value })}>
          <option value="">Todos</option>
          {categoriesInResults.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="field">Score mínimo: {filters.minScore}
        <input type="range" min={0} max={100} step={1} value={filters.minScore} onChange={(event) => setF({ minScore: Number(event.target.value) })} />
      </label>
      <label className="field">Más de N reseñas
        <input type="number" min={0} step={1} value={filters.minReviews || ''} onChange={(event) => setF({ minReviews: Number(event.target.value) || 0 })} />
      </label>
      <label className="switch"><input type="checkbox" checked={filters.hasWhatsapp} onChange={(event) => setF({ hasWhatsapp: event.target.checked })} /> Con WhatsApp</label>
      <label className="switch"><input type="checkbox" checked={filters.hasEmail} onChange={(event) => setF({ hasEmail: event.target.checked })} /> Con correo</label>
      <label className="switch"><input type="checkbox" checked={filters.multiBranch} onChange={(event) => setF({ multiBranch: event.target.checked })} /> 1+ sucursal</label>
      <label className="switch"><input type="checkbox" checked={filters.noBooking} onChange={(event) => setF({ noBooking: event.target.checked })} /> Sin sistema de reservas</label>
      {filtersActive(filters) ? (
        <button type="button" className="ghost sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Quitar filtros</button>
      ) : null}
    </>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Zona <StatusBadge status={search.status} /></p>
          <h1>{zone || 'Zona de la búsqueda'}</h1>
          <p className="lede">
            {fmtNum(total)} negocios · {fmtNum(visitedCount)} ya visitados por el equipo
            {search.created_at ? ` · buscada el ${fmtDay(search.created_at)}` : ''}
          </p>
        </div>
        <div className="row">
          <Link className="ghost" to="/map">Ver en el mapa</Link>
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
      {prospects.rows.length > 0 ? (
        <section className="card funnel-card">
          <header className="card-head">
            <div>
              <h2>Cómo va la zona</h2>
              <p className="hint">De todo lo que encontró la búsqueda hasta lo que ya se cerró con la Bitácora.</p>
            </div>
          </header>
          <Funnel steps={[
            { label: 'Encontrados', value: prospects.rows.length, hint: 'negocios en la zona' },
            { label: 'Con contacto', value: prospects.rows.filter((row) => row.phone || row.has_whatsapp).length, hint: 'teléfono o WhatsApp' },
            { label: 'Visitados', value: visitedCount, hint: 'alguien del equipo fue' },
            { label: 'En seguimiento', value: prospects.rows.filter((row) => ['open', 'won'].includes(visitTone(row.visit))).length, hint: 'demo, propuesta o cierre' },
            { label: 'Cerrados', value: prospects.rows.filter((row) => visitTone(row.visit) === 'won').length, hint: 'ya son clientes' },
          ]}
          />
        </section>
      ) : null}
      {!prospects.fallback && prospects.total > prospects.rows.length ? (
        <p className="muted">Se cargaron {fmtNum(prospects.rows.length)} de {fmtNum(prospects.total)} prospectos.</p>
      ) : null}
      <div className="workspace">
        <div className="stack">
          <div className="toolbar">
            <input
              className="grow"
              type="search"
              value={filters.q}
              placeholder="Buscar por nombre o dirección"
              aria-label="Buscar negocio"
              onChange={(event) => setF({ q: event.target.value })}
            />
            <div className="segment seg-3" role="group" aria-label="Visitas">
              {([['all', `Todos ${fmtNum(prospects.rows.length)}`], ['pending', `Sin visitar ${fmtNum(prospects.rows.length - visitedCount)}`], ['visited', `Visitados ${fmtNum(visitedCount)}`]] as const)
                .map(([value, label]) => (
                  <button key={value} type="button" className={filters.visit === value ? 'on' : ''} onClick={() => setF({ visit: value })}>{label}</button>
                ))}
            </div>
            <select
              aria-label="Orden"
              className="sort"
              value={`${filters.sort}:${filters.order}`}
              onChange={(event) => {
                const [sort, order] = event.target.value.split(':') as [ResultFilters['sort'], ResultFilters['order']];
                setF({ sort, order });
              }}
            >
              <option value="lead_score:desc">Mejor score</option>
              <option value="review_count:desc">Más reseñas</option>
              <option value="rating:desc">Mejor calificación</option>
              <option value="name:asc">Nombre</option>
            </select>
            {narrow ? (
              <button type="button" className="ghost" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
                Filtros{filtersActive({ ...filters, q: '', visit: 'all' }) ? ' •' : ''}
              </button>
            ) : null}
          </div>
          {narrow && showFilters ? <div className="panel flat filters-inline">{filterPanel}</div> : null}
          {prospects.query.isPending ? <Loading label="Cargando prospectos…" /> : null}
          {showSearchEmpty ? <EmptyState title="Sin negocios" body="No se encontraron negocios en esta zona." /> : null}
          {showFilterEmpty ? <EmptyState title="Sin coincidencias" body="Ningún negocio coincide con los filtros." /> : null}
          {(polling && filtered.length === 0 && !showSearchEmpty) ? <p className="hint">Los negocios irán apareciendo mientras la búsqueda avanza.</p> : null}
          {pageRows.length > 0 && narrow ? (
            <div className="prospect-list">
              {pageRows.map((row) => <ProspectCard key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />)}
            </div>
          ) : null}
          {pageRows.length > 0 && !narrow ? (
            <div className="table-wrap">
              <table className="results">
                <thead>
                  <tr>
                    <th className="check">
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
                    <th>Negocio</th><th>Contacto</th><th>Reseñas</th><th>Score</th><th>Visita</th><th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const phone = row.phone ? telHref(row.phone) : null;
                    const wa = row.has_whatsapp ? waHref(row.phone) : null;
                    return (
                      <tr key={row.id} onClick={() => setSelectedId(row.id)} className={row.visit ? 'is-visited' : undefined}>
                        <td className="check" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={selection.includes(row.id)} aria-label={`Seleccionar ${row.name}`} onChange={() => toggleSelected(searchId, row.id)} />
                        </td>
                        <td>
                          <strong>{row.name}</strong>
                          <div className="muted small">
                            {row.category_name ? <span className="dot" style={{ background: colorFor(row.category_name) }} /> : null}
                            {[row.category_name, row.address?.split(',')[0]].filter(Boolean).join(' · ') || 'Sin dirección'}
                          </div>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          {phone && row.phone ? <a className="nowrap" href={phone}>{row.phone}</a> : <span className="muted">—</span>}
                          <div className="small">
                            {wa ? <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}
                            {row.email ? <span className="muted">{wa ? ' · ' : ''}correo</span> : null}
                          </div>
                        </td>
                        <td className="nowrap">{row.rating == null ? '—' : <>★ {fmtNum(row.rating, 1)} <span className="muted">({fmtNum(row.review_count)})</span></>}</td>
                        <td title={row.status_label ?? undefined}><ScoreCell score={row.lead_score} /></td>
                        <td><VisitBadge visit={row.visit} /></td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <a className="ghost sm nowrap" href={bitacoraHref(row.id)}>{row.visit ? 'Otra visita' : 'Registrar'}</a>
                        </td>
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
          <ZoneWork data={zoneVisits.data} loading={zoneVisits.isPending} error={zoneVisits.isError} />
          {!narrow ? (
            <section className="panel-section">
              <h2>Filtros</h2>
              {filterPanel}
            </section>
          ) : null}
          <section className="insight-card">
            <h2>Hallazgos</h2>
            {search.status !== 'completed' && !job.fallback ? <p className="hint">Disponible cuando la búsqueda termine.</p> : null}
            {insightsQ.isPending && search.status === 'completed' ? <Loading label="Cargando hallazgos…" /> : null}
            {insightsQ.isError ? <p className="hint">No se pudieron cargar los hallazgos.</p> : null}
            {insightsQ.data && insightsQ.data.length > 0 ? (
              <Bullets icon="→" items={insightsQ.data.slice(0, 3)} />
            ) : null}
            {insightsQ.data && insightsQ.data.length === 0 && search.status === 'completed' ? <p className="hint">Aún no hay análisis de zona.</p> : null}
            <Link to={`/searches/${searchId}/insights`}>Ver análisis completo</Link>
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
