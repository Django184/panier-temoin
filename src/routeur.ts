// Routage par fragment d'URL (« #/explorer »). GitHub Pages ne sait pas
// réécrire les adresses : un routage par chemin (« /explorer ») donnerait
// une page 404 au rechargement. Le fragment n'est jamais envoyé au serveur.

import { useEffect, useState } from 'react';

function segmentsActuels(): string[] {
  return window.location.hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s; // « % » isolé dans un lien envoyé par Claude
      }
    });
}

/** Segments du chemin courant : « #/produit/abc » → ['produit', 'abc']. */
export function useChemin(): string[] {
  const [segments, setSegments] = useState<string[]>(segmentsActuels);
  useEffect(() => {
    const surChangement = () => {
      setSegments(segmentsActuels());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);
  return segments;
}

/** Adresse d'un écran, pour un attribut href. */
export function lien(...segments: string[]): string {
  return `#/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
}

/** Navigue vers un écran. */
export function aller(...segments: string[]): void {
  window.location.hash = lien(...segments);
}
