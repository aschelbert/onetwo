// OpenAI Ads measurement pixel for the app.
//
// The marketing site (index.html) loads the pixel in its <head>. The app
// loads it only when a visitor enters the signup steps, so residents and
// board members using the app are never tracked. Same loader as OpenAI's
// snippet, including the Global Privacy Control opt-out the privacy policy
// promises. Each load records one page_viewed event; a completed signup is
// recorded separately as trial_started.

const PIXEL_ID = 'EeUAjrxrWJtnf5M7tToTws';
const SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

type OaiqQueue = ((...args: unknown[]) => void) & { q: IArguments[] };

/** Load the pixel once. Safe to call repeatedly; later calls do nothing. */
export function loadOpenAIPixel(): void {
  if (typeof window === 'undefined' || window.oaiq) return;

  // Queue calls until the SDK loads, exactly as OpenAI's snippet does
  const q = function () {
    // eslint-disable-next-line prefer-rest-params
    q.q.push(arguments);
  } as unknown as OaiqQueue;
  q.q = [];
  window.oaiq = q;

  const script = document.createElement('script');
  script.async = true;
  script.src = SDK_URL;
  document.head.appendChild(script);

  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true) q('consent', false);
  q('init', { pixelId: PIXEL_ID });
  q('measure', 'page_viewed', { type: 'contents' });
}
