import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
// MapLibre 6: el worker es un .mjs aparte. Sin setWorkerUrl Vite no lo
// resuelve y en /prospeccion/map el worker 404 → mapa blanco.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './App';

setWorkerUrl(maplibreWorkerUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
