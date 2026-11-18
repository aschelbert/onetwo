/**
 * What a new ONE two password must contain. Applied wherever someone chooses
 * a password (signup, accepting an invitation, resetting), never where they
 * type an existing one to sign in: accounts created before this rule keep
 * working with the password they have.
 */
export const PASSWORD_MIN_LENGTH = 16;

export interface PasswordRule {
  id: 'length' | 'lower' | 'upper' | 'number' | 'special';
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: p => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'lower', label: 'One lowercase letter', test: p => /[a-z]/.test(p) },
  { id: 'upper', label: 'One uppercase letter', test: p => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character, such as ! @ # $ %', test: p => /[^A-Za-z0-9\s]/.test(p) },
];

/** The rules this password does not meet yet, in display order. */
export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter(r => !r.test(password));
}

/** One sentence saying what is missing, or null when the password is acceptable. */
export function passwordError(password: string): string | null {
  if (!password) return 'Please enter a password.';
  const missing = unmetPasswordRules(password);
  if (missing.length === 0) return null;
  const parts = missing.map(r => r.label.replace(/, such as.*$/, '').replace(/^./, c => c.toLowerCase()));
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Your password needs ${list}.`;
}
