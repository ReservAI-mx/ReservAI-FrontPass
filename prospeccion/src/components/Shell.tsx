import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage, geocode, listSearches } from '../api';
import { useSearchJob } from '../hooks';
import { setActiveSearch, useActiveSearch } from '../store';
import type { GeoHit } from '../types';
import { useDialog } from './ui';

const NAV = [
  { key: 'map', label: 'Mapa', icon: 'M9 20l-6-3V5l6 3m0 12l6-3m-6 3V8m6 9V5l6 3v12l-6-3m-6-9l6-3 6 3' },
  { key: 'results', label: 'Resultados', icon: 'M4 6h16M4 12h16M4 18h10' },
  { key: 'export', label: 'Exportar', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14' },
  { key: 'insights', label: 'Análisis', icon: 'M12 3a6 6 0 00-3.5 10.9V19h7v-5.1A6 6 0 0012 3z' },
  { key: 'settings', label: 'Configuración', icon: 'M4 7h16M4 17h16M8 5v4M16 15v4' },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const stored = useActiveSearch();
  const routeId = location.pathname.match(/^\/searches\/([^/]+)/)?.[1];
  const id = routeId ? decodeURIComponent(routeId) : stored?.id ?? null;
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const path = location.pathname;
    const name = path.startsWith('/settings') ? 'Giros'
      : path.includes('/export') ? 'Exportar'
      : path.includes('/insights') ? 'Análisis'
      : path.includes('/searches') ? 'Resultados'
      : 'Mapa';
    document.title = `${name} · Prospección`;
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const links: Record<(typeof NAV)[number]['key'], string> = {
    map: '/map',
    results: id ? `/searches/${id}` : '/searches',
    export: id ? `/searches/${id}/export` : '/export',
    insights: id ? `/searches/${id}/insights` : '/insights',
    settings: '/settings',
  };

  return (
    <div className="shell">
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon d="M9 20l-6-3V5l6 3m0 12l6-3m-6 3V8m6 9V5l6 3v12l-6-3" />
          </span>
          <strong>Prospección</strong>
        </div>
        <nav aria-label="Secciones de prospección">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              to={links[item.key]}
              end={item.key === 'map' || item.key === 'results' || item.key === 'settings'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${!id && item.key !== 'map' && item.key !== 'settings' ? ' quiet' : ''}`}
              title={!id && item.key !== 'map' && item.key !== 'settings' ? 'Sin búsqueda activa' : undefined}
            >
              <Icon d={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace-col">
        <header className="topbar">
          <button type="button" className="search-launch" onClick={() => setPalette(true)}>
            <span>Buscar colonia, ciudad o negocio</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="top-actions">
            <ActiveChip id={id} />
            <button type="button" className="primary" onClick={() => navigate('/map', { state: { reset: Date.now() } })}>
              + Nueva zona
            </button>
          </div>
        </header>
        <main id="contenido" className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette
        open={palette}
        searchId={id}
        onClose={() => setPalette(false)}
      />
    </div>
  );
}

/* La zona con la que se está trabajando, a un clic de su lista. */
function ActiveChip({ id }: { id: string | null }) {
  const { search, fallback } = useSearchJob(id ?? undefined);
  const shown = fallback ? undefined : search;
  if (!id || !shown) return null;
  const name = shown.zone || shown.label || shown.city || 'Zona';
  return (
    <NavLink to={`/searches/${id}`} end className="active-chip" title="Zona activa">
      <span className="active-chip-dot" aria-hidden="true" />
      <span className="active-chip-name">{name}</span>
      {shown.businesses_found != null ? <span className="muted">{shown.businesses_found.toLocaleString('es-MX')}</span> : null}
    </NavLink>
  );
}

function CommandPalette({ open, searchId, onClose }: { open: boolean; searchId: string | null; onClose: () => void }) {
  const ref = useDialog(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const searches = useQuery({ queryKey: ['searches'], queryFn: listSearches, enabled: open, retry: false });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setHits([]);
      setGeoError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      geocode(query.trim()).then((rows) => {
        setHits(rows);
        setGeoError(rows.length ? null : 'Sin resultados para esa zona.');
      }).catch((err: unknown) => {
        setHits([]);
        setGeoError(errorMessage(err));
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  function goFly(hit: GeoHit) {
    onClose();
    navigate('/map', { state: { fly: { lng: hit.lng, lat: hit.lat, n: Date.now() } } });
  }

  return (
    <dialog ref={ref} className="palette" onClose={onClose}>
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Colonia, ciudad o nombre para filtrar"
        aria-label="Buscar zona o negocio"
      />
      <div className="palette-body">
        {searchId && query.trim() ? (
          <button
            type="button"
            className="palette-item"
            onClick={() => {
              onClose();
              navigate(`/searches/${searchId}?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            Filtrar prospectos por “{query.trim()}”
          </button>
        ) : null}
        {geoError ? <p className="muted">{geoError}</p> : null}
        {hits.map((hit) => (
          <button type="button" key={`${hit.lng}-${hit.lat}-${hit.label}`} className="palette-item" onClick={() => goFly(hit)}>
            {hit.label}
          </button>
        ))}
        <p className="section-label">Búsquedas recientes</p>
        {searches.isPending ? <p className="muted">Cargando…</p> : null}
        {searches.isError ? <p className="muted">No se pudo cargar el historial.</p> : null}
        {searches.data?.slice(0, 8).map((item) => (
          <button
            type="button"
            key={item.id}
            className="palette-item"
            onClick={() => {
              setActiveSearch({
                id: item.id,
                label: item.label || 'Búsqueda',
                city: item.city ?? undefined,
                zone: item.zone ?? undefined,
              });
              onClose();
              navigate(`/searches/${item.id}`);
            }}
          >
            {item.label || item.zone || item.id}
            <span className="muted">{item.status}</span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
