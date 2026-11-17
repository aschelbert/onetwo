// Google Ads and Reddit Ads measurement for the signup flow.
//
// (ChatGPT ads are measured by the OpenAI pixel in openaiPixel.ts.) Like that
// pixel, these honor Global Privacy Control: a visitor who sends it is not
// measured. Nothing here may ever throw into checkout.

const REDDIT_PIXEL_ID = (import.meta.env.VITE_REDDIT_PIXEL_ID as string | undefined)?.trim() || '';
const REDDIT_SDK_URL = 'https://www.redditstatic.com/ads/pixel.js';

type RdtQueue = ((...args: unknown[]) => void) & {
  callQueue: IArguments[];
  sendEvent?: (...args: unknown[]) => void;
};

const optedOut = (): boolean =>
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

/**
 * Load the Reddit pixel once and record a page visit. Does nothing until
 * VITE_REDDIT_PIXEL_ID is set, or if the visitor sends Global Privacy Control.
 */
export function loadRedditPixel(pixelId: string = REDDIT_PIXEL_ID): void {
  try {
    if (!pixelId || window.rdt || optedOut()) return;

    // Queue calls until the SDK loads, exactly as Reddit's snippet does
    const p = function () {
      // eslint-disable-next-line prefer-rest-params
      if (p.sendEvent) p.sendEvent.apply(p, Array.from(arguments));
      // eslint-disable-next-line prefer-rest-params
      else p.callQueue.push(arguments);
    } as unknown as RdtQueue;
    p.callQueue = [];
    window.rdt = p;

    const script = document.createElement('script');
    script.async = true;
    script.src = REDDIT_SDK_URL;
    document.head.appendChild(script);

    p('init', pixelId);
    p('track', 'PageVisit');
  } catch {
    // Measurement must never break a page
  }
}

/**
 * A building was created: tell Google Ads and Reddit Ads, so each optimizes
 * for real signups. `eventId` is the signup's shared conversion id, which
 * lets each platform count the signup once.
 *
 * Google: pushes a `building_created` event to the data layer; a Google Ads
 * conversion tag in Google Tag Manager fires on it.
 * Reddit: a SignUp event, if the pixel is loaded.
 */
export function trackBuildingCreated(details: { eventId: string; plan: string; interval: string }): void {
  try {
    if (optedOut()) return;
    (window.dataLayer ??= []).push({
      event: 'building_created',
      transaction_id: details.eventId,
      plan: details.plan,
      billing_interval: details.interval,
    });
    window.rdt?.('track', 'SignUp', { conversionId: details.eventId });
  } catch {
    // Measurement must never break checkout
  }
}
