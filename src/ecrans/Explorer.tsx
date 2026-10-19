// Prix : le catalogue de tous les produits relevés sur les tickets, avec
// leur dernier prix et l'écart depuis l'achat précédent. On le parcourt
// (récents, A–Z, plus fortes variations), on le filtre (hausses, baisses,
// favoris) ou on tape quelques lettres. Ouvert à tous.

import { useEffect, useMemo, useState } from 'react';
import { derniersAchats, mesFavoris, rechercherProduits, type DernierAchat, type ResultatRecherche } from '../api.ts';
import { enFrancs } from '../lib/montants.ts';
import { lien } from '../routeur.ts';
import { useSession } from '../session.tsx';
import { dateSuisse } from '../composants/Champs.tsx';

type Filtre = 'tous' | 'hausse' | 'baisse' | 'favoris';
type Tri = 'recents' | 'az' | 'ecart';

const SEUIL = 0.05; // en %, en dessous : stable

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Écart de prix : flèche et signe ; la couleur ne fait que doubler l'information. */
function Tendance({ achat }: { achat: DernierAchat }) {
  const v = achat.variation_pct;
  if (v === null) return <span className="tendance tendance-neutre">nouveau</span>;
  if (Math.abs(v) < SEUIL) return <span className="tendance tendance-neutre">=</span>;
  const hausse = v > 0;
  return (
    <span
      className={`tendance ${hausse ? 'tendance-hausse' : 'tendance-baisse'}`}
      title={`Achat précédent : ${enFrancs(achat.precedent_prix_centimes ?? 0)} le ${dateSuisse(achat.precedent_date ?? '')}`}
    >
      {hausse ? '▲ +' : '▼ −'}
      {Math.abs(v).toFixed(1).replace('.', ',')} %
    </span>
  );
}

function LigneAchat({ achat, favori, avecDate }: { achat: DernierAchat; favori: boolean; avecDate: boolean }) {
  return (
    <li>
      <a href={lien('produit', achat.produit_id)} className="ligne-achat">
        <span className="achat-nom">
          {favori ? <span className="etoile" aria-label="Favori">★ </span> : null}
          {achat.nom}
        </span>
        <span className="achat-prix chiffre">
          {enFrancs(achat.prix_normal_centimes)}
          {achat.unite === 'kg' ? <span className="unite">/kg</span> : null}
        </span>
        <span className="achat-detail">
          {avecDate ? dateSuisse(achat.date_achat) : null}
          {achat.est_promo ? `${avecDate ? ' · ' : ''}action ${enFrancs(achat.prix_paye_centimes)}` : null}
        </span>
        <Tendance achat={achat} />
      </a>
    </li>
  );
}

export function Explorer() {
  const { session } = useSession();
  const [achats, setAchats] = useState<DernierAchat[] | null>(null);
  const [favoris, setFavoris] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [texte, setTexte] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [tri, setTri] = useState<Tri>('recents');
  const [autres, setAutres] = useState<ResultatRecherche[]>([]);

  useEffect(() => {
    derniersAchats(1000)
      .then(setAchats)
      .catch((e: Error) => {
        setAchats([]);
        setErreur(e.message);
      });
  }, []);

  useEffect(() => {
    if (!session) return;
    mesFavoris()
      .then((f) => setFavoris(new Set(f.map((p) => p.id))))
      .catch(() => undefined);
  }, [session]);

  const tous = useMemo(() => achats ?? [], [achats]);
  const compte = {
    tous: tous.length,
    hausse: tous.filter((a) => (a.variation_pct ?? 0) >= SEUIL).length,
    baisse: tous.filter((a) => (a.variation_pct ?? 0) <= -SEUIL).length,
    favoris: tous.filter((a) => favoris.has(a.produit_id)).length,
  };

  const visibles = useMemo(() => {
    const q = normaliser(texte.trim());
    const liste = tous.filter((a) => {
      if (q && !normaliser(a.nom).includes(q)) return false;
      if (filtre === 'hausse') return (a.variation_pct ?? 0) >= SEUIL;
      if (filtre === 'baisse') return (a.variation_pct ?? 0) <= -SEUIL;
      if (filtre === 'favoris') return favoris.has(a.produit_id);
      return true;
    });
    if (tri === 'az') return [...liste].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (tri === 'ecart') return [...liste].sort((a, b) => Math.abs(b.variation_pct ?? 0) - Math.abs(a.variation_pct ?? 0));
    return liste; // déjà du plus récent au plus ancien
  }, [tous, texte, filtre, tri, favoris]);

  // Rien dans le catalogue pour ces lettres : recherche élargie (libellés des tickets).
  useEffect(() => {
    const q = texte.trim();
    if (q.length < 2 || visibles.length > 0 || achats === null) {
      setAutres([]);
      return;
    }
    let actif = true;
    const minuterie = window.setTimeout(() => {
      rechercherProduits(q, 20)
        .then((r) => {
          if (actif) setAutres(r);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [texte, visibles.length, achats]);

  // Récents : un intertitre par date d'achat.
  const groupes = useMemo(() => {
    if (tri !== 'recents') return [{ date: null as string | null, achats: visibles }];
    const parDate: Array<{ date: string | null; achats: DernierAchat[] }> = [];
    for (const a of visibles) {
      const dernier = parDate[parDate.length - 1];
      if (dernier && dernier.date === a.date_achat) dernier.achats.push(a);
      else parDate.push({ date: a.date_achat, achats: [a] });
    }
    return parDate;
  }, [visibles, tri]);

  const filtres: Array<[Filtre, string]> = [
    ['tous', 'Tous'],
    ['hausse', '▲ Hausse'],
    ['baisse', '▼ Baisse'],
    ...(session ? ([['favoris', '★ Favoris']] as Array<[Filtre, string]>) : []),
  ];

  return (
    <div className="ecran ecran-prix">
      <header className="entete-ecran entete-avec-lien">
        <h1>Prix</h1>
        <a href={lien('paniers')} className="bouton-lien">
          Paniers types
        </a>
      </header>

      <label className="champ-filtre">
        <span className="invisible">Filtrer les produits</span>
        <input
          type="search"
          value={texte}
          placeholder={compte.tous > 0 ? `Filtrer ${compte.tous} produits…` : 'Rechercher un produit…'}
          onChange={(e) => setTexte(e.target.value)}
        />
      </label>

      {compte.tous > 0 ? (
        <div className="barre-filtres">
          <div className="puces-filtres" role="radiogroup" aria-label="Filtre">
            {filtres.map(([cle, nom]) => (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={filtre === cle}
                className={`puce-filtre ${filtre === cle ? 'actif' : ''}`}
                onClick={() => setFiltre(cle)}
              >
                {nom}
                <span className="puce-compte">{compte[cle]}</span>
              </button>
            ))}
          </div>
          <div className="tri" role="radiogroup" aria-label="Tri">
            {(
              [
                ['recents', 'Récents'],
                ['az', 'A–Z'],
                ['ecart', 'Écart'],
              ] as Array<[Tri, string]>
            ).map(([cle, nom]) => (
              <button key={cle} type="button" role="radio" aria-checked={tri === cle} className={tri === cle ? 'actif' : ''} onClick={() => setTri(cle)}>
                {nom}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {achats === null ? (
        <p className="discret">Chargement…</p>
      ) : compte.tous === 0 ? (
        <p className="vide">Aucun produit pour l’instant : les prix apparaissent ici dès le premier ticket enregistré.</p>
      ) : visibles.length === 0 ? (
        autres.length > 0 ? (
          <ul className="liste-achats">
            {autres.map((r) => (
              <li key={r.produit_id}>
                <a href={lien('produit', r.produit_id)} className="ligne-achat">
                  <span className="achat-nom">{r.nom}</span>
                  <span className="achat-prix chiffre">{r.dernier_prix_centimes !== null ? enFrancs(r.dernier_prix_centimes) : ''}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide">Aucun produit ne correspond.</p>
        )
      ) : (
        <div className="catalogue">
          {groupes.map((g) => (
            <section key={g.date ?? 'tous'}>
              {g.date ? <h2 className="titre-section">{dateSuisse(g.date)}</h2> : null}
              <ul className="liste-achats">
                {g.achats.map((a) => (
                  <LigneAchat key={`${a.produit_id}-${a.unite}`} achat={a} favori={favoris.has(a.produit_id)} avecDate={tri !== 'recents'} />
                ))}
              </ul>
            </section>
          ))}
          <p className="discret note-bas explication">Prix normal, hors action. L’écart compare au précédent achat du même produit.</p>
        </div>
      )}
    </div>
  );
}
