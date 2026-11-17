import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from "@sentry/react";
import App from './App';
import './index.css';
import { captureAttribution } from './lib/attribution';

// Remember which ad sent this visitor, before any route rewrites the URL
captureAttribution();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN as string,
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/^\//, /^https:\/\/.*\.supabase\.co/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
