import { createClient } from '@supabase/supabase-js';

// Obtenemos las variables públicas que Vercel inyecta
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key are not defined in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);