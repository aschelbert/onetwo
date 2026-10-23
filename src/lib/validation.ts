/** Letters, spaces, hyphens, apostrophes only. Unicode-aware for accented names. */
export function isValidName(name: string): boolean {
  return /^[\p{L}][\p{L}\s'\-]*$/u.test(name.trim());
}

/** Must have local-part@domain.tld (TLD ≥ 2 chars) */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Uppercase + lowercase + number + special char, min 16 chars */
export function isStrongPassword(pw: string): boolean {
  return pw.length >= 16 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)
    && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

/** Returns unmet password requirement strings for UI feedback */
export function passwordErrors(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 16) e.push('At least 16 characters');
  if (!/[A-Z]/.test(pw)) e.push('One uppercase letter');
  if (!/[a-z]/.test(pw)) e.push('One lowercase letter');
  if (!/[0-9]/.test(pw)) e.push('One number');
  if (!/[^A-Za-z0-9]/.test(pw)) e.push('One special character');
  return e;
}
