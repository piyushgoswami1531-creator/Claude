export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until Supabase keys are added to .env.local; the site then uses the dummy catalogue. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
