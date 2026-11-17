/**
 * The marketing pages state the free trial length in a few places. The
 * length is set in the Admin Console (and Chargebee), so the pages must not
 * hard-code it. The number in the source files is only a fallback:
 *
 *  - at build time, vite.config.ts fetches the current length and rewrites
 *    the pages with it, so search engines and AI crawlers read the right one;
 *  - in the browser, public/trial-days.js fetches it again and updates the
 *    same spots, so a change shows without waiting for a deploy.
 *
 * Both look for the same two markers, which is all this function knows:
 * `<span data-trial-days>21</span>` in visible copy, and the phrase
 * "21 day free trial" in plain-text places (meta tags, JSON-LD, llms.txt).
 */
export function applyTrialDays(text: string, days: number): string {
  if (!Number.isInteger(days) || days <= 0) return text;
  return text
    .replace(/(<span data-trial-days>)\d+(<\/span>)/g, `$1${days}$2`)
    .replace(/\b\d+ day free trial\b/g, `${days} day free trial`);
}
