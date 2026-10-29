import { createClient } from '@supabase/supabase-js';

// Só URL e chave pública (anon). Nenhuma chave secreta no front.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
);
