// Prix : recherche d'un produit, favoris, et derniers produits achetés
// avec l'évolution de leur prix depuis l'achat précédent. Ouvert à tous.

import { useEffect, useState } from 'react';
import { derniersAchats, mesFavoris, rechercherProduits, type DernierAchat, type Produit, type ResultatRecherche } from '../api.ts';
import { enFrancs } from '../lib/montants.ts';
import { lien } from '../routeur.ts';
import { useSession } from '../session.tsx';
import { dateSuisse } from '../composants/Champs.tsx';

/** Écart de prix : flèche et signe, la couleur ne fait que doubler l'information. */
function Tendance({ achat }: { achat: DernierAchat }) {
  const v = achat.variation_pct;
  if (v === null) return <span className="tendance tendance-neutre">nouveau</span>;
  if (Math.abs(v) < 0.05) return <span className="tendance tendance-neutre">= stable</span>;
  const hausse = v > 0;
  const texte = `${hausse ? '▲ +' : '▼ −'}${Math.abs(v).toFixed(1).replace('.', ',')} %`;
  return (
    <span
      className={`tendance ${hausse ? 'tendance-hausse' : 'tendance-baisse'}`}
      title={`Achat précédent : ${enFrancs(achat.precedent_prix_centimes ?? 0)} le ${dateSuisse(achat.precedent_date ?? '')}`}
    >
      {texte}
    </span>
  );
}

function LigneAchat({ achat }: { achat: DernierAchat }) {
  const kg = achat.unite === 'kg';
  return (
    <li>
      <a href={lien('produit', achat.produit_id)} className="ligne-achat">
        <span className="achat-nom">{achat.nom}</span>
        <span className="achat-prix chiffre">
          {enFrancs(achat.prix_normal_centimes)}
          {kg ? <span className="discret">/kg</span> : null}
        </span>
        <span className="achat-detail">
          {dateSuisse(achat.date_achat)}
          {achat.est_promo ? ` · payé ${enFrancs(achat.prix_paye_centimes)} en action` : ''}
        </span>
        <Tendance achat={achat} />
      </a>
    </li>
  );
}

export function Explorer() {
  const { session } = useSession();
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const [achats, setAchats] = useState<DernierAchat[] | null>(null);
  const [favoris, setFavoris] = useState<Produit[]>([]);

  useEffect(() => {
    derniersAchats()
      .then(setAchats)
      .catch((e: Error) => {
        setAchats([]);
        setErreur(e.message);
      });
  }, []);

  useEffect(() => {
    if (!session) return;
    mesFavoris().then(setFavoris).catch(() => undefined);
  }, [session]);

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

  const enRecherche = texte.trim().length >= 2;
  const parProduit = new Map((achats ?? []).map((a) => [a.produit_id, a]));
  const hausses = (achats ?? []).filter((a) => (a.variation_pct ?? 0) >= 0.05).length;
  const baisses = (achats ?? []).filter((a) => (a.variation_pct ?? 0) <= -0.05).length;

  return (
    <div className="ecran">
      <header className="entete-ecran entete-avec-lien">
        <h1>Prix</h1>
        <a href={lien('paniers')} className="bouton-lien">
          Paniers types
        </a>
      </header>

      <label className="champ champ-large champ-recherche">
        <span className="invisible">Rechercher un produit</span>
        <input type="search" value={texte} placeholder="Rechercher : linguine, bananes, feta…" onChange={(e) => setTexte(e.target.value)} />
      </label>

      {etat === 'erreur' || (erreur && !enRecherche) ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {enRecherche ? (
        etat === 'repos' && resultats.length === 0 ? (
          <p className="vide">Aucun produit ne correspond. Les produits apparaissent ici dès qu’un ticket les contient.</p>
        ) : (
          <ul className="liste-achats">
            {resultats.map((r) => {
              const achat = parProduit.get(r.produit_id);
              return achat ? (
                <LigneAchat key={r.produit_id} achat={achat} />
              ) : (
                <li key={r.produit_id}>
                  <a href={lien('produit', r.produit_id)} className="ligne-achat">
                    <span className="achat-nom">{r.nom}</span>
                    <span className="achat-prix chiffre">
                      {r.dernier_prix_centimes !== null ? enFrancs(r.dernier_prix_centimes) : ''}
                      {r.derniere_unite === 'kg' ? <span className="discret">/kg</span> : null}
                    </span>
                    <span className="achat-detail">
                      {r.nb_releves} relevé{r.nb_releves > 1 ? 's' : ''}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          {favoris.length > 0 ? (
            <section>
              <h2 className="titre-section">Favoris</h2>
              <ul className="puces-favoris">
                {favoris.map((f) => {
                  const achat = parProduit.get(f.id);
                  return (
                    <li key={f.id}>
                      <a href={lien('produit', f.id)}>
                        <span>{f.nom}</span>
                        {achat ? <span className="chiffre">{enFrancs(achat.prix_normal_centimes)}</span> : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="titre-section">
              Derniers achats
              {achats && achats.length > 0 ? (
                <span className="resume-tendances">
                  {hausses} en hausse · {baisses} en baisse
                </span>
              ) : null}
            </h2>
            {achats === null ? (
              <p className="discret">Chargement…</p>
            ) : achats.length === 0 ? (
              <p className="vide">Les prix des produits apparaissent ici dès le premier ticket enregistré.</p>
            ) : (
              <>
                <ul className="liste-achats">
                  {achats.map((a) => (
                    <LigneAchat key={`${a.produit_id}-${a.unite}`} achat={a} />
                  ))}
                </ul>
                <p className="discret note-bas">Prix normal (hors action) ; écart avec l’achat précédent du même produit.</p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
