import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { circleRing } from '../geo';
import { bitacoraHref, fmtDay, resultTone, TONE_COLOR, TONE_LABEL, type VisitTone } from '../format';
import type { AreaVisit, FlyTo, LngLat, SearchArea } from '../types';

/** Un prospecto en el mapa: el color dice cómo va su visita en la Bitácora. */
export type MarkerPoint = {
  id: string;
  lng: number;
  lat: number;
  name: string;
  category: string;
  score: number | null;
  rating: number | null;
  tone: VisitTone;
  visitText: string;
};

type Props = {
  mode: 'polygon' | 'radius';
  polygon: LngLat[];
  center: { lng: number; lat: number } | null;
  radiusM: number;
  markers: MarkerPoint[];
  /** Zona de la búsqueda activa (punteada, aparte de la que se está trazando). */
  searchArea?: SearchArea | null;
  /** Visitas de la Bitácora en la zona que no son de un prospecto (sólo GPS). */
  visits?: AreaVisit[];
  flyTo: FlyTo | null;
  /** Al cambiar, la vista se ajusta a la zona de la búsqueda. */
  fitKey?: string | null;
  onAddVertex: (lng: number, lat: number) => void;
  onMoveVertex: (index: number, lng: number, lat: number) => void;
  onSetCenter: (lng: number, lat: number) => void;
  onSelectProspect?: (id: string) => void;
};

type ZoneFeature = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry:
    | { type: 'Polygon'; coordinates: LngLat[][] }
    | { type: 'LineString'; coordinates: LngLat[] };
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] as ZoneFeature[] };

function areaRing(area: SearchArea): LngLat[] {
  if (area.type === 'radius') return circleRing(area.center, area.radius_m);
  return [...area.coordinates, area.coordinates[0]];
}

/* Las ventanitas se arman con nodos y textContent: los nombres vienen de Google. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function MapView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  function zoneData() {
    const { mode, polygon, center, radiusM } = propsRef.current;
    let feature: ZoneFeature | null = null;
    if (mode === 'radius' && center) {
      feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(center, radiusM)] } };
    } else if (mode === 'polygon' && polygon.length >= 3) {
      feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...polygon, polygon[0]]] } };
    } else if (mode === 'polygon' && polygon.length >= 2) {
      feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: polygon } };
    }
    return feature ? { type: 'FeatureCollection' as const, features: [feature] } : EMPTY;
  }

  function source(id: string) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return undefined;
    return map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  }

  function paintZone() {
    source('zone')?.setData(zoneData());
  }

  function paintSearchArea() {
    const area = propsRef.current.searchArea;
    source('search-area')?.setData(area ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [areaRing(area)] } }],
    } : EMPTY);
  }

  function paintProspects() {
    source('prospects')?.setData({
      type: 'FeatureCollection',
      features: propsRef.current.markers.map((marker) => ({
        type: 'Feature' as const,
        properties: { id: marker.id, color: TONE_COLOR[marker.tone], visited: marker.tone !== 'none' },
        geometry: { type: 'Point' as const, coordinates: [marker.lng, marker.lat] },
      })),
    });
  }

  function paintVisits() {
    source('visits')?.setData({
      type: 'FeatureCollection',
      features: (propsRef.current.visits ?? []).map((visit) => ({
        type: 'Feature' as const,
        properties: { id: visit.id, color: TONE_COLOR[resultTone(visit.result)] },
        geometry: { type: 'Point' as const, coordinates: [visit.lng, visit.lat] },
      })),
    });
  }

  function fitArea() {
    const map = mapRef.current;
    const area = propsRef.current.searchArea;
    if (!map || !area) return;
    const ring = areaRing(area);
    const bounds = ring.reduce(
      (b, point) => b.extend(point as [number, number]),
      new maplibregl.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]),
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 600 });
  }

  /* Ventanita del prospecto: datos, cómo va la visita y qué hacer. */
  function prospectPopup(marker: MarkerPoint) {
    const box = el('div', 'pop');
    box.append(el('strong', 'pop-title', marker.name));
    const meta = [
      marker.category,
      marker.rating != null ? `★ ${marker.rating.toFixed(1)}` : '',
      marker.score != null ? `score ${Math.round(marker.score)}` : '',
    ].filter(Boolean).join(' · ');
    if (meta) box.append(el('div', 'pop-meta', meta));
    box.append(el('div', `pop-visit tone-${marker.tone}`, marker.visitText));
    const actions = el('div', 'pop-actions');
    if (propsRef.current.onSelectProspect) {
      const ver = el('button', 'ghost', 'Ver ficha');
      ver.type = 'button';
      ver.addEventListener('click', () => propsRef.current.onSelectProspect?.(marker.id));
      actions.append(ver);
    }
    const ir = el('a', 'primary', marker.tone === 'none' ? 'Registrar visita' : 'Otra visita');
    ir.setAttribute('href', bitacoraHref(marker.id));
    actions.append(ir);
    box.append(actions);
    return box;
  }

  function visitPopup(visit: AreaVisit) {
    const box = el('div', 'pop');
    box.append(el('strong', 'pop-title', visit.business || 'Sin nombre'));
    box.append(el('div', 'pop-meta', [visit.category, 'registrada con el GPS'].filter(Boolean).join(' · ')));
    const tone = resultTone(visit.result);
    box.append(el('div', `pop-visit tone-${tone}`,
      [visit.seller_name, fmtDay(visit.date), visit.result || TONE_LABEL[tone]].filter(Boolean).join(' · ')));
    return box;
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // OpenFreeMap: vector tiles gratis, sin API key (OSM.org y Carto ya no
    // sirven para apps: 403 / "API KEY REQUIRED").
    const map = new maplibregl.Map({
      container: host,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-103.3912, 20.6732],
      zoom: 12.5,
      // Compacta (un botón "i"): completa tapa la leyenda en el teléfono.
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const geo = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    });
    map.addControl(geo, 'bottom-right');
    geo.on('geolocate', (event) => {
      if (propsRef.current.mode !== 'radius') return;
      propsRef.current.onSetCenter(event.coords.longitude, event.coords.latitude);
    });
    map.on('load', () => {
      map.addSource('search-area', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'search-area-fill',
        type: 'fill',
        source: 'search-area',
        paint: { 'fill-color': '#0983d6', 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'search-area-line',
        type: 'line',
        source: 'search-area',
        paint: { 'line-color': '#0a2a44', 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.8 },
      });
      map.addSource('zone', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: 'zone',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#0983d6', 'fill-opacity': 0.16 },
      });
      map.addLayer({
        id: 'zone-line',
        type: 'line',
        source: 'zone',
        paint: { 'line-color': '#0983d6', 'line-width': 2 },
      });
      map.addSource('visits', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'visits',
        type: 'circle',
        source: 'visits',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-stroke-color': ['coalesce', ['get', 'color'], '#a0a0a0'],
        },
      });
      map.addSource('prospects', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'prospects',
        type: 'circle',
        source: 'prospects',
        paint: {
          'circle-radius': ['case', ['get', 'visited'], 7.5, 6],
          'circle-color': ['coalesce', ['get', 'color'], '#0983d6'],
          'circle-stroke-width': ['case', ['get', 'visited'], 2.5, 1.5],
          'circle-stroke-color': ['case', ['get', 'visited'], '#0d0d0d', '#ffffff'],
        },
      });
      map.on('click', 'prospects', (event: maplibregl.MapLayerMouseEvent) => {
        const id = String(event.features?.[0]?.properties?.id ?? '');
        const marker = propsRef.current.markers.find((item) => item.id === id);
        if (!marker) return;
        new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '280px' })
          .setLngLat([marker.lng, marker.lat])
          .setDOMContent(prospectPopup(marker))
          .addTo(map);
      });
      map.on('click', 'visits', (event: maplibregl.MapLayerMouseEvent) => {
        if (map.queryRenderedFeatures(event.point, { layers: ['prospects'] }).length) return;
        const id = String(event.features?.[0]?.properties?.id ?? '');
        const visit = (propsRef.current.visits ?? []).find((item) => item.id === id);
        if (!visit) return;
        new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '280px' })
          .setLngLat([visit.lng, visit.lat])
          .setDOMContent(visitPopup(visit))
          .addTo(map);
      });
      for (const layer of ['prospects', 'visits']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = 'crosshair'; });
      }
      readyRef.current = true;
      // La atribución compacta abre sola al cargar; cerrada sólo es el botón "i".
      host.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      map.getCanvas().style.cursor = 'crosshair';
      paintSearchArea();
      paintZone();
      paintVisits();
      paintProspects();
      fitArea();
      map.resize();
    });
    map.on('click', (event: maplibregl.MapMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      if (readyRef.current && map.getLayer('prospects')) {
        const hits = map.queryRenderedFeatures(event.point, { layers: ['prospects', 'visits'] });
        if (hits.length) return;
      }
      const current = propsRef.current;
      if (current.mode === 'polygon') current.onAddVertex(event.lngLat.lng, event.lngLat.lat);
      else current.onSetCenter(event.lngLat.lng, event.lngLat.lat);
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(host);
    return () => {
      observer.disconnect();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => { paintZone(); }, [props.mode, props.polygon, props.center, props.radiusM]);
  useEffect(() => { paintProspects(); }, [props.markers]);
  useEffect(() => { paintVisits(); }, [props.visits]);
  useEffect(() => { paintSearchArea(); }, [props.searchArea]);
  useEffect(() => { if (readyRef.current) fitArea(); }, [props.fitKey]);
  useEffect(() => {
    if (!props.flyTo || !mapRef.current) return;
    mapRef.current.flyTo({ center: [props.flyTo.lng, props.flyTo.lat], zoom: 14, essential: true });
  }, [props.flyTo]);

  const vertexKey = props.mode === 'polygon' ? props.polygon.map((point) => point.join(',')).join('|') : '';
  const centerKey = props.center ? `${props.center.lng},${props.center.lat}` : '';

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    if (props.mode === 'polygon') {
      props.polygon.forEach((point, index) => {
        const marker = new maplibregl.Marker({ draggable: true, color: '#0983d6', scale: 0.8 }).setLngLat(point).addTo(map);
        marker.getElement().addEventListener('mousedown', (event: MouseEvent) => event.stopPropagation());
        marker.on('dragend', () => {
          const next = marker.getLngLat();
          propsRef.current.onMoveVertex(index, next.lng, next.lat);
        });
        markers.push(marker);
      });
    } else if (props.center) {
      const marker = new maplibregl.Marker({ draggable: true, color: '#0983d6', scale: 0.8 })
        .setLngLat([props.center.lng, props.center.lat])
        .addTo(map);
      marker.getElement().addEventListener('mousedown', (event: MouseEvent) => event.stopPropagation());
      marker.on('dragend', () => {
        const next = marker.getLngLat();
        propsRef.current.onSetCenter(next.lng, next.lat);
      });
      markers.push(marker);
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [props.mode, vertexKey, centerKey]);

  return <div ref={hostRef} className="map-canvas" />;
}

/** Qué significa cada color del mapa. */
export function MapLegend({ withVisits }: { withVisits: boolean }) {
  const tones: VisitTone[] = ['none', 'open', 'won', 'lost', 'done'];
  return (
    <div className="map-legend" aria-label="Leyenda del mapa">
      {tones.map((tone) => (
        <span key={tone}><i style={{ background: TONE_COLOR[tone] }} />{TONE_LABEL[tone]}</span>
      ))}
      {withVisits ? <span><i className="ring" />Visita con GPS</span> : null}
    </div>
  );
}
