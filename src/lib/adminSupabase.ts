/**
 * Secondary Supabase client for the admin project, which holds the support
 * threads and messages every tenant writes to. Null when the admin project
 * is not configured (local demo builds).
 */
import { createClient } from '@supabase/supabase-js';

const adminUrl = import.meta.env.VITE_ADMIN_SUPABASE_URL as string | undefined;
const adminKey = import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY as string | undefined;

export const adminSupabase = adminUrl && adminKey ? createClient(adminUrl, adminKey) : null;
