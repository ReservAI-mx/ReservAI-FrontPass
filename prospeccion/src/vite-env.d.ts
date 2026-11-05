/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const url: string;
  export default url;
}
