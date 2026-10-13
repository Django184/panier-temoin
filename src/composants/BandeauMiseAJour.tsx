// Bandeau proposant de charger une nouvelle version de l'app. La mise à
// jour n'est jamais forcée : un ticket peut être en cours de saisie.

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

let mettreAJour: ((recharger?: boolean) => Promise<void>) | null = null;
const abonnes = new Set<() => void>();

if (typeof window !== 'undefined') {
  mettreAJour = registerSW({
    onNeedRefresh() {
      abonnes.forEach((f) => f());
    },
  });
}

export function BandeauMiseAJour() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const montrer = () => setVisible(true);
    abonnes.add(montrer);
    return () => {
      abonnes.delete(montrer);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="bandeau" role="status">
      <span>Une nouvelle version est disponible.</span>
      <button type="button" className="bouton-secondaire" onClick={() => void mettreAJour?.(true)}>
        Recharger
      </button>
      <button type="button" className="bouton-lien" onClick={() => setVisible(false)}>
        Plus tard
      </button>
    </div>
  );
}
