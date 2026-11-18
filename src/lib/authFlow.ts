/**
 * Whether a signup is mid-flight in this tab.
 *
 * Signing up with an email that already has an account signs that account in
 * so the checkout can run. Until the checkout finishes, that session belongs
 * to the signup, not to the app: the global auth listener must not treat it
 * as "the user logged in" and open their existing building under the form.
 */
let signupInProgress = false;

export function setSignupInProgress(value: boolean): void { signupInProgress = value; }
export function isSignupInProgress(): boolean { return signupInProgress; }
