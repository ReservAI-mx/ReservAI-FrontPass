import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { circleRing } from '../geo';
import { escapeHtml } from '../format';
import type { FlyTo, LngLat } from '../types';

type MarkerPoint = { id: string; lng: number; lat: number; name: string; category: string; color: string };

type Props = {
  mode: 'polygon' | 'radius';
  polygon: LngLat[];
  center: { lng: number; lat: number } | null;
  radiusM: number;
  markers: MarkerPoint[];
  flyTo: FlyTo | null;
  onAddVertex: (lng: number, lat: number) => void;
  onMoveVertex: (index: number, lng: number, lat: number) => void;
  onSetCenter: (lng: number, lat: number) => void;
};

type ZoneFeature = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry:
    | { type: 'Polygon'; coordinates: LngLat[][] }
    | { type: 'LineString'; coordinates: LngLat[] };
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] as ZoneFeature[] };

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

  function paintZone() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource('zone') as maplibregl.GeoJSONSource | undefined;
    source?.setData(zoneData());
  }

  function paintProspects() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource('prospects') as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: propsRef.current.markers.map((marker) => ({
        type: 'Feature' as const,
        properties: { name: marker.name, category: marker.category, color: marker.color },
        geometry: { type: 'Point' as const, coordinates: [marker.lng, marker.lat] },
      })),
    });
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
      map.addSource('prospects', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'prospects',
        type: 'circle',
        source: 'prospects',
        paint: {
          'circle-radius': 6,
          'circle-color': ['coalesce', ['get', 'color'], '#0983d6'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.on('click', 'prospects', (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const name = String(feature?.properties?.name ?? '');
        const category = String(feature?.properties?.category ?? '');
        new maplibregl.Popup({ offset: 10, closeButton: true })
          .setLngLat(event.lngLat)
          .setHTML(`<strong>${escapeHtml(name)}</strong><div>${escapeHtml(category)}</div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'prospects', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'prospects', () => { map.getCanvas().style.cursor = 'crosshair'; });
      readyRef.current = true;
      map.getCanvas().style.cursor = 'crosshair';
      paintZone();
      paintProspects();
      map.resize();
    });
    map.on('click', (event: maplibregl.MapMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      if (readyRef.current && map.getLayer('prospects')) {
        const hits = map.queryRenderedFeatures(event.point, { layers: ['prospects'] });
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
        const marker = new maplibregl.Marker({ draggable: true, color: '#0983d6' }).setLngLat(point).addTo(map);
        marker.getElement().addEventListener('mousedown', (event: MouseEvent) => event.stopPropagation());
        marker.on('dragend', () => {
          const next = marker.getLngLat();
          propsRef.current.onMoveVertex(index, next.lng, next.lat);
        });
        markers.push(marker);
      });
    } else if (props.center) {
      const marker = new maplibregl.Marker({ draggable: true, color: '#0983d6' })
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
