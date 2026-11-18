import { PASSWORD_RULES } from '@/lib/passwordPolicy';

/**
 * The password requirements, ticked off as they are met. Shown under every
 * field where someone chooses a new password, so the rules are visible
 * before the form is submitted rather than discovered from an error.
 */
export default function PasswordRules({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} aria-label="Password requirements" className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        return (
          <li key={rule.id} data-met={met} className={met ? 'flex items-start gap-1.5 text-sage-700' : 'flex items-start gap-1.5 text-ink-500'}>
            <span aria-hidden className="mt-px w-3 flex-none text-center font-bold">{met ? '✓' : '○'}</span>
            <span>{rule.label}<span className="sr-only">{met ? ' (met)' : ' (not met yet)'}</span></span>
          </li>
        );
      })}
    </ul>
  );
}
