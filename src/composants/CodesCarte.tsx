// Codes de la carte Cumulus, dessinés en SVG, noir sur blanc dans tous
// les thèmes (les lecteurs de caisse lisent mal un code inversé).

import { useMemo } from 'react';
import { genererAztec } from '../lib/aztec.ts';
import { genererEan13 } from '../lib/ean13.ts';

/** Code Aztec (format de Google Wallet et de l'app Migros). */
export function CodeAztec({ texte }: { texte: string }) {
  const { taille, chemin } = useMemo(() => {
    const marge = 2;
    const modules = genererAztec(texte);
    let d = '';
    modules.forEach((rangee, y) =>
      rangee.forEach((sombre, x) => {
        if (sombre) d += `M${x + marge} ${y + marge}h1v1h-1z`;
      }),
    );
    return { taille: modules.length + 2 * marge, chemin: d };
  }, [texte]);

  return (
    <svg className="code-carte code-aztec" viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label="Code Aztec de la carte Cumulus" shapeRendering="crispEdges">
      <rect width={taille} height={taille} fill="#fff" />
      <path d={chemin} fill="#000" />
    </svg>
  );
}

/** Code-barres EAN-13 du numéro de carte, avec les chiffres dessous. */
export function CodeBarres({ numero }: { numero: string }) {
  const { chemin } = useMemo(() => {
    let d = '';
    genererEan13(numero).forEach((barre, i) => {
      if (barre) d += `M${i + 11} 0h1v60h-1z`;
    });
    return { chemin: d };
  }, [numero]);
  const largeur = 95 + 11 + 7;

  return (
    <svg className="code-carte code-barres" viewBox={`0 0 ${largeur} 72`} role="img" aria-label={`Code-barres de la carte Cumulus ${numero}`} shapeRendering="crispEdges">
      <rect width={largeur} height={72} fill="#fff" />
      <path d={chemin} fill="#000" />
      <text x={largeur / 2} y={70} textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="1.5" fill="#000">
        {numero}
      </text>
    </svg>
  );
}
