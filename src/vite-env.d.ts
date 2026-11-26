/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Chargebee site name, e.g. getonetwo-test */
  readonly VITE_CB_SITE?: string;
  /** Chargebee publishable key for the signup page's payment fields. Safe to ship to the browser. */
  readonly VITE_CB_PUBLISHABLE_KEY?: string;
  /** Reddit Ads pixel ID; the Reddit pixel stays off until this is set */
  readonly VITE_REDDIT_PIXEL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


/** OpenAI Ads conversion pixel, loaded in app.html / index.html */
interface Window {
  oaiq?: (...args: unknown[]) => void;
  /** Reddit Ads pixel, loaded by src/lib/adConversions.ts */
  rdt?: (...args: unknown[]) => void;
  /** Google Tag Manager data layer */
  dataLayer?: unknown[];
}
