// Session de connexion, partagée par toute l'app.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

interface EtatSession {
  session: Session | null;
  chargement: boolean;
}

const ContexteSession = createContext<EtatSession>({ session: null, chargement: true });

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatSession>({ session: null, chargement: true });

  useEffect(() => {
    let actif = true;
    supabase.auth.getSession().then(({ data }) => {
      if (actif) setEtat({ session: data.session, chargement: false });
    });
    const { data } = supabase.auth.onAuthStateChange((_evenement, session) => {
      setEtat({ session, chargement: false });
    });
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <ContexteSession.Provider value={etat}>{children}</ContexteSession.Provider>;
}

export function useSession(): EtatSession {
  return useContext(ContexteSession);
}
