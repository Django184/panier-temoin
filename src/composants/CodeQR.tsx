// QR code dessiné en SVG, noir sur blanc dans tous les thèmes (les
// lecteurs de caisse lisent mal un QR inversé), avec sa marge blanche.

import { useMemo } from 'react';
import { genererQR } from '../lib/qr.ts';

const MARGE = 4;

export function CodeQR({ texte, titre }: { texte: string; titre: string }) {
  const { taille, chemin } = useMemo(() => {
    const modules = genererQR(texte);
    let d = '';
    modules.forEach((rangee, y) =>
      rangee.forEach((sombre, x) => {
        if (sombre) d += `M${x + MARGE} ${y + MARGE}h1v1h-1z`;
      }),
    );
    return { taille: modules.length + 2 * MARGE, chemin: d };
  }, [texte]);

  return (
    <svg className="code-qr" viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={titre} shapeRendering="crispEdges">
      <rect width={taille} height={taille} fill="#fff" />
      <path d={chemin} fill="#000" />
    </svg>
  );
}
