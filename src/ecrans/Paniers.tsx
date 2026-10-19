// Paniers types : une liste de produits et de quantités, dont on suit le
// coût en indice (base 100 le mois choisi), à partir des prix normaux.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ajouterArticle,
  articlesPanier,
  creerPanier,
  indicePanier,
  mesPaniers,
  panier as chargerPanier,
  rechercherProduits,
  retirerArticle,
  supprimerPanier,
  type ArticlePanier,
  type Panier,
  type PointIndice,
  type ResultatRecherche,
} from '../api.ts';
import { useSession } from '../session.tsx';
import { aller, lien } from '../routeur.ts';
import { GraphiqueLigne } from '../composants/GraphiqueLigne.tsx';

export function Paniers() {
  const { session } = useSession();
  const [paniers, setPaniers] = useState<Panier[] | null>(null);
  const [nom, setNom] = useState('');
  const [dateBase, setDateBase] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    mesPaniers().then(setPaniers).catch((e: Error) => setErreur(e.message));
  }, []);

  const creer = async () => {
    if (!session) return;
    try {
      const nouveau = await creerPanier(session.user.id, nom, dateBase);
      aller('paniers', nouveau.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="ecran">
      <h1>Paniers types</h1>
      <p className="discret explication">
        Composez un panier de produits habituels pour suivre son coût dans le temps, promotions exclues.
      </p>
      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      {paniers && paniers.length > 0 ? (
        <ul className="liste-produits">
          {paniers.map((p) => (
            <li key={p.id}>
              <a href={lien('paniers', p.id)} className="ligne-produit">
                <span className="ligne-produit-nom">{p.nom}</span>
                <span className="discret">base 100 en {moisAnnee(p.date_base)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : paniers ? (
        <p className="vide">Aucun panier pour l’instant.</p>
      ) : null}

      <section className="bloc">
        <h2>Nouveau panier</h2>
        <div className="grille-champs">
          <label className="champ champ-large">
            <span className="champ-etiquette">Nom</span>
            <input type="text" value={nom} placeholder="Courses de la semaine" onChange={(e) => setNom(e.target.value)} />
          </label>
          <label className="champ">
            <span className="champ-etiquette">Mois de référence (base 100)</span>
            <input type="date" value={dateBase} onChange={(e) => setDateBase(e.target.value)} />
          </label>
        </div>
        <button type="button" className="bouton-principal" disabled={nom.trim() === ''} onClick={creer}>
          Créer le panier
        </button>
      </section>
    </div>
  );
}

function moisAnnee(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
}

const formatMois = (secondes: number) =>
  new Date(secondes * 1000).toLocaleDateString('fr-CH', { month: 'short', year: '2-digit' });
const formatIndice = (v: number) => v.toFixed(1);

export function DetailPanier({ id }: { id: string }) {
  const [panier, setPanier] = useState<Panier | null | undefined>(undefined);
  const [articles, setArticles] = useState<ArticlePanier[]>([]);
  const [indice, setIndice] = useState<PointIndice[]>([]);
  const [recherche, setRecherche] = useState('');
  const [suggestions, setSuggestions] = useState<ResultatRecherche[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(() => {
    articlesPanier(id).then(setArticles).catch((e: Error) => setErreur(e.message));
    indicePanier(id).then(setIndice).catch((e: Error) => setErreur(e.message));
  }, [id]);

  useEffect(() => {
    chargerPanier(id).then(setPanier).catch((e: Error) => setErreur(e.message));
    recharger();
  }, [id, recharger]);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let actif = true;
    const minuterie = window.setTimeout(() => {
      rechercherProduits(recherche, 8)
        .then((r) => {
          if (actif) setSuggestions(r);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [recherche]);

  const x = useMemo(() => indice.map((p) => Date.parse(`${p.mois}T12:00:00Z`) / 1000), [indice]);
  const y = useMemo(() => indice.map((p) => p.indice), [indice]);
  const dernier = indice[indice.length - 1];

  if (panier === undefined && !erreur) return <div className="ecran"><p>Chargement…</p></div>;
  if (panier === null) return <div className="ecran"><p className="vide">Ce panier n’existe pas.</p></div>;

  return (
    <div className="ecran">
      <header className="entete-ecran">
        <h1>{panier?.nom}</h1>
        {panier ? <p className="discret">Base 100 : {moisAnnee(panier.date_base)}.</p> : null}
      </header>
      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      <section className="bloc">
        <h2>Indice du panier</h2>
        {indice.length === 0 ? (
          <p className="vide">L’indice apparaît dès que les produits du panier ont des prix relevés.</p>
        ) : (
          <>
            <p className="chiffre-cle">
              <span className="chiffre">{dernier.indice.toFixed(1)}</span>
              <span className="discret"> en {moisAnnee(dernier.mois)}</span>
            </p>
            <GraphiqueLigne
              x={x}
              y={y}
              formatX={formatMois}
              formatY={formatIndice}
              reference={100}
              description="Indice mensuel du coût du panier, base 100"
            />
            {dernier.nb_produits_couverts < dernier.nb_produits ? (
              <p className="discret">
                {dernier.nb_produits_couverts} produit{dernier.nb_produits_couverts > 1 ? 's' : ''} sur {dernier.nb_produits} ont
                un prix connu ; les autres sont ignorés dans le calcul.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="bloc">
        <h2>Produits</h2>
        {articles.length === 0 ? <p className="vide">Ajoutez des produits ci-dessous.</p> : null}
        <ul className="articles">
          {articles.map((a) => (
            <li key={a.produit_id} className="article">
              <a href={lien('produit', a.produit_id)}>{a.nom}</a>
              <label className="champ champ-chiffre champ-etroit">
                <span className="champ-etiquette">{a.vendu_au_poids ? 'kg' : 'Quant.'}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={String(a.quantite)}
                  onBlur={(e) => {
                    const v = Number(e.target.value.replace(',', '.'));
                    if (Number.isFinite(v) && v > 0 && v !== a.quantite) {
                      ajouterArticle(id, a.produit_id, v).then(recharger).catch((er: Error) => setErreur(er.message));
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="bouton-icone"
                aria-label={`Retirer ${a.nom}`}
                onClick={() => retirerArticle(id, a.produit_id).then(recharger).catch((er: Error) => setErreur(er.message))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <label className="champ champ-large">
          <span className="champ-etiquette">Ajouter un produit</span>
          <input type="search" value={recherche} placeholder="Chercher…" onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              key={s.produit_id}
              type="button"
              className="suggestion"
              onClick={() => {
                setRecherche('');
                ajouterArticle(id, s.produit_id, 1).then(recharger).catch((er: Error) => setErreur(er.message));
              }}
            >
              {s.nom}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="bouton-lien bouton-danger"
        onClick={async () => {
          if (!window.confirm('Supprimer ce panier ?')) return;
          await supprimerPanier(id);
          aller('paniers');
        }}
      >
        Supprimer ce panier
      </button>
    </div>
  );
}
