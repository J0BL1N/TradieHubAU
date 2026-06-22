import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Missing Supabase environment variables! Check frontend/.env.local');
}

export const supabase = createClient(
  supabaseUrl || 'https://phiurjqqfgbtauztqtxx.supabase.co',
  supabaseAnonKey || 'sb_publishable__USgww9VQ_IgavTXVuQtvQ_7DZF-V2m'
);

export default supabase;
