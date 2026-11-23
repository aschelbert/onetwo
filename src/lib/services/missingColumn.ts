/**
 * PostgREST's "that column isn't in the table": the app is ahead of a database
 * whose latest migration has not been applied yet. Callers retry without the
 * new column so the rest of the record still saves.
 */
export const missingColumn = (error: { code?: string; message?: string }, column: string) =>
  error.code === 'PGRST204' || error.code === '42703' || new RegExp(`\\b${column}\\b.*column|column.*\\b${column}\\b`, 'i').test(error.message || '');
