// Encadré d'aide d'un écran : affiché tant qu'il n'a pas été lu et que
// les aides sont actives (Réglages → Aides).

import type { ReactNode } from 'react';
import { useAide } from '../donnees/local.ts';

export function Aide({ cle, titre, children }: { cle: string; titre: string; children: ReactNode }) {
  const { visible, masquer } = useAide(cle);
  if (!visible) return null;
  return (
    <aside className="aide" aria-label={titre}>
      <div className="aide-entete">
        <h2>{titre}</h2>
        <button type="button" className="bouton-lien" onClick={masquer}>
          Compris
        </button>
      </div>
      {children}
    </aside>
  );
}
