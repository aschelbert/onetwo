/**
 * Generate a collision-safe local ID with a readable prefix.
 * Uses crypto.randomUUID() for uniqueness instead of Date.now().
 */
export function generateLocalId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
}
