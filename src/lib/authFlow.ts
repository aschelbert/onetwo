/**
 * Whether a signup is mid-flight in this tab.
 *
 * Signing up with an email that already has an account signs that account in
 * so the checkout can run. Until the checkout finishes, that session belongs
 * to the signup, not to the app: the global auth listener must not treat it
 * as "the user logged in" and open their existing building under the form.
 *
 * It starts out true when the page loads from Chargebee's "back to site" link
 * (?checkout=canceled): the session left over from that unfinished signup is
 * still the signup's, until the signup page has dealt with it.
 */
let signupInProgress = (() => {
  try { return new URLSearchParams(window.location.search).get('checkout') === 'canceled'; }
  catch { return false; }
})();

export function setSignupInProgress(value: boolean): void { signupInProgress = value; }
export function isSignupInProgress(): boolean { return signupInProgress; }
