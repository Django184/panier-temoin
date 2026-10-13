import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL } from './config.ts';

// Session conservée dans le stockage du navigateur. Sur iPhone, ce
// stockage peut être vidé si l'app n'est pas utilisée pendant longtemps :
// il suffit alors de se reconnecter.
export const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
