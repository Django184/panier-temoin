// Accueil : ajouter un ticket, retrouver ses favoris, et ce qui attend
// une confirmation.

import { useEffect, useState } from 'react';
import { comparaisonMagasins, lignesAVerifier, mesFavoris, type Produit } from '../api.ts';
import { useSession } from '../session.tsx';
import { lien } from '../routeur.ts';
import { enFrancs } from '../lib/montants.ts';
import { MENTION_NON_AFFILIATION } from '../config.ts';

interface Fourchette {
  produit: Produit;
  min: number | null;
  max: number | null;
  nbMagasins: number;
}

export function Accueil() {
  const { session } = useSession();
  const [favoris, setFavoris] = useState<Fourchette[] | null>(null);
  const [aVerifier, setAVerifier] = useState(0);

  useEffect(() => {
    if (!session) {
      setFavoris(null);
      return;
    }
    let actif = true;
    lignesAVerifier()
      .then((l) => {
        if (actif) setAVerifier(l.length);
      })
      .catch(() => undefined);
    mesFavoris()
      .then(async (produits) => {
        const fourchettes = await Promise.all(
          produits.map(async (p) => {
            const prix = await comparaisonMagasins(p.id, p.vendu_au_poids ? 60 : 180).catch(() => []);
            const valeurs = prix.map((x) => x.mediane_centimes);
            return {
              produit: p,
              min: valeurs.length ? Math.min(...valeurs) : null,
              max: valeurs.length ? Math.max(...valeurs) : null,
              nbMagasins: valeurs.length,
            };
          }),
        );
        if (actif) setFavoris(fourchettes);
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [session]);

  return (
    <div className="ecran accueil">
      <header className="entete-accueil">
        <h1>Panier Témoin</h1>
        <p>Les prix de vos courses, relevés sur vos tickets de caisse, suivis dans le temps et comparés d’un magasin à l’autre.</p>
      </header>

      {session ? (
        <a href={lien('ajouter')} className="bouton-principal bouton-grand">
          Ajouter un ticket
        </a>
      ) : (
        <div className="actions actions-colonne">
          <a href={lien('explorer')} className="bouton-principal bouton-grand">
            Explorer les prix
          </a>
          <a href={lien('connexion')} className="bouton-secondaire">
            Se connecter pour ajouter des tickets
          </a>
        </div>
      )}

      <div className="tuiles-acces">
        {session ? (
          <a className="tuile-acces tuile-sombre" href={lien('cumulus')}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-tuile">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
              <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" className="plein" />
            </svg>
            <span>Carte Cumulus</span>
          </a>
        ) : null}
        <a className="tuile-acces" href={lien('courses')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-tuile">
            <path d="M9 6h11M9 12h11M9 18h11" />
            <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
          </svg>
          <span>Liste de courses</span>
        </a>
      </div>

      {aVerifier > 0 ? (
        <p className="alerte-prix">
          {aVerifier === 1 ? 'Un prix inhabituel attend' : `${aVerifier} prix inhabituels attendent`} votre confirmation dans{' '}
          <a href={lien('profil')}>Profil</a>.
        </p>
      ) : null}

      {session ? (
        <section className="bloc">
          <h2>Vos favoris</h2>
          {favoris === null ? (
            <p className="discret">Chargement…</p>
          ) : favoris.length === 0 ? (
            <p className="vide">
              Ajoutez des favoris depuis la fiche d’un produit, dans <a href={lien('explorer')}>Explorer</a>.
            </p>
          ) : (
            <ul className="liste-produits">
              {favoris.map((f) => (
                <li key={f.produit.id}>
                  <a href={lien('produit', f.produit.id)} className="ligne-produit">
                    <span className="ligne-produit-nom">{f.produit.nom}</span>
                    <span className="ligne-produit-prix chiffre">
                      {f.min === null ? '' : f.min === f.max ? enFrancs(f.min) : `${enFrancs(f.min)} à ${enFrancs(f.max)}`}
                      {f.produit.vendu_au_poids && f.min !== null ? <span className="discret">/kg</span> : null}
                    </span>
                    <span className="discret">
                      {f.nbMagasins === 0 ? 'pas de relevé récent' : `${f.nbMagasins} magasin${f.nbMagasins > 1 ? 's' : ''}`}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="discret mention">{MENTION_NON_AFFILIATION}</p>
    </div>
  );
}
