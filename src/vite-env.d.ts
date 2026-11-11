/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


/** OpenAI Ads conversion pixel, loaded in app.html / index.html */
interface Window {
  oaiq?: (...args: unknown[]) => void;
}
