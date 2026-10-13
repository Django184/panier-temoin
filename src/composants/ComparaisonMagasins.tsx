// Comparaison des magasins : un point par magasin sur une même échelle,
// du moins cher au plus cher. Les écarts de prix entre magasins sont de
// quelques centimes : des barres partant de zéro les rendraient
// invisibles, alors qu'un point sur une échelle resserrée les montre.

import type { PrixMagasin } from '../api.ts';
import { enFrancs } from '../lib/montants.ts';
import { dateSuisse } from './Champs.tsx';

export function ComparaisonMagasins({ lignes }: { lignes: PrixMagasin[] }) {
  if (lignes.length === 0) return null;

  const valeurs = lignes.map((l) => l.mediane_centimes);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = Math.max(5, Math.round((max - min) * 0.15));
  const bas = Math.max(0, min - marge);
  const haut = max + marge;
  const position = (v: number) => (haut === bas ? 50 : ((v - bas) / (haut - bas)) * 100);
  const parKilo = lignes[0].unite === 'kg';

  return (
    <div className="comparaison">
      <ul className="comparaison-liste">
        {lignes.map((l) => (
          <li
            key={`${l.magasin_id}-${l.unite}`}
            className="comparaison-ligne"
            title={`Dernier prix : ${enFrancs(l.dernier_prix_centimes)} le ${dateSuisse(l.dernier_releve)}`}
          >
            <div className="comparaison-nom">
              <span>{l.magasin_nom}</span>
              <span className="discret">
                {l.nb_releves} relevé{l.nb_releves > 1 ? 's' : ''}, dernier le {dateSuisse(l.dernier_releve)}
              </span>
            </div>
            <div className="comparaison-piste" aria-hidden="true">
              <span className="comparaison-point" style={{ left: `${position(l.mediane_centimes)}%` }} />
            </div>
            <div className="comparaison-valeur chiffre">
              {enFrancs(l.mediane_centimes)}
              {parKilo ? <span className="discret">/kg</span> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="discret comparaison-echelle">
        Échelle de {enFrancs(bas)} à {enFrancs(haut)} : prix normal médian, promotions exclues.
      </p>
    </div>
  );
}
