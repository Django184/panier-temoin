// Recherche de produits, ouverte à tous sans compte.

import { useEffect, useState } from 'react';
import { rechercherProduits, type ResultatRecherche } from '../api.ts';
import { enFrancs } from '../lib/montants.ts';
import { lien } from '../routeur.ts';

export function Explorer() {
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (texte.trim().length < 2) {
      setResultats([]);
      setEtat('repos');
      return;
    }
    let actif = true;
    setEtat('recherche');
    const minuterie = window.setTimeout(() => {
      rechercherProduits(texte, 30)
        .then((r) => {
          if (!actif) return;
          setResultats(r);
          setEtat('repos');
        })
        .catch((e: Error) => {
          if (!actif) return;
          setErreur(e.message);
          setEtat('erreur');
        });
    }, 250);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [texte]);

  return (
    <div className="ecran">
      <header className="entete-ecran entete-avec-lien">
        <h1>Explorer les prix</h1>
        <a href={lien('paniers')} className="bouton-lien">
          Paniers types
        </a>
      </header>
      <label className="champ champ-large champ-recherche">
        <span className="champ-etiquette">Produit</span>
        <input
          type="search"
          value={texte}
          placeholder="Linguine, bananes, feta…"
          autoFocus
          onChange={(e) => setTexte(e.target.value)}
        />
      </label>

      {etat === 'erreur' ? <p className="erreur" role="alert">{erreur}</p> : null}

      {texte.trim().length >= 2 && etat === 'repos' && resultats.length === 0 ? (
        <p className="vide">Aucun produit ne correspond. Les produits apparaissent ici dès qu’un ticket les contient.</p>
      ) : null}

      <ul className="liste-produits">
        {resultats.map((r) => (
          <li key={r.produit_id}>
            <a href={lien('produit', r.produit_id)} className="ligne-produit">
              <span className="ligne-produit-nom">{r.nom}</span>
              <span className="ligne-produit-prix chiffre">
                {r.dernier_prix_centimes !== null ? enFrancs(r.dernier_prix_centimes) : ''}
                {r.derniere_unite === 'kg' ? <span className="discret">/kg</span> : null}
              </span>
              <span className="discret">
                {r.nb_releves} relevé{r.nb_releves > 1 ? 's' : ''}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
