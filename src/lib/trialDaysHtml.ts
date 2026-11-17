/**
 * The marketing pages state the free trial in a few places. The trial is set
 * in the Admin Console (and Chargebee), so the pages must not hard-code it.
 * What is written in the source files is only a fallback:
 *
 *  - at build time, vite.config.ts fetches the current length and rewrites
 *    the pages with it, so search engines and AI crawlers read the right one;
 *  - in the browser, public/trial-days.js fetches it again and updates the
 *    same spots, so a change shows without waiting for a deploy.
 *
 * Both look for the same markers, which is all this function knows:
 *
 *  - `<span data-trial-days>21</span>`: the length, in visible copy;
 *  - `data-no-trial="…"` on an element: what that element should say when
 *    the trial is turned off (an empty value removes its text);
 *  - the phrase "21 day free trial" in plain-text places (meta tags,
 *    JSON-LD, llms.txt).
 *
 * `days` of 0 means the trial is off.
 */
export function applyTrialDays(text: string, days: number): string {
  if (!Number.isInteger(days) || days < 0) return text;

  if (days > 0) {
    return text
      .replace(/(<span data-trial-days>)\d+(<\/span>)/g, `$1${days}$2`)
      .replace(/\b\d+ day free trial\b/g, `${days} day free trial`);
  }

  return text
    // The length no longer appears anywhere, so its markers go first; that
    // also leaves no span nested inside the elements replaced next.
    .replace(/<span data-trial-days>\d+<\/span>/g, '')
    .replace(/(<(\w+)\b[^>]*\sdata-no-trial="([^"]*)"[^>]*>)[\s\S]*?(<\/\2>)/g, '$1$3$4')
    // Plain text: drop the sentence that offers the trial.
    .replace(/Every plan starts with a \d+ day free trial\.\s*/g, '')
    .replace(/ after a \d+ day free trial\b/g, '')
    .replace(/\s+\d+ day free trial\.(?=["<\n]|$)/g, '')
    .replace(/\d+ day free trial\.\s+/g, '')
    .replace(/Start a free trial/g, 'Start today');
}
