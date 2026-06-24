import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  const missingVariables = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ');

  throw new Error(
    `TradieHubAU Supabase configuration is missing: ${missingVariables}. ` +
    'Copy frontend/.env.example to frontend/.env.local and provide the intended project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
