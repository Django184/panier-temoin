// Liste de courses : les ingrédients des recettes de Chef Feta, rangés
// selon le parcours du magasin, à cocher pendant les courses. Gardée sur
// le téléphone, utilisable sans réseau.

import { useEffect, useRef, useState } from 'react';
import { PARCOURS, RAYON_AUTRES, ordreArticles, parRayon, type ArticleCourses } from '../lib/courses.ts';
import { etatSynchro, liste, nouvelId, preferences, recettes, type EtatSynchro } from '../donnees/local.ts';
import { useSession } from '../session.tsx';
import { chargerRecette, prendreMessageCourses, type MessageCourses } from '../lecture/chefFeta.ts';
import { lireProjet } from '../lecture/claude.ts';
import { Aide } from '../composants/Aide.tsx';
import { ConfigurationChefFeta } from '../composants/ConfigurationChefFeta.tsx';
import { IconeCrayon, IconeExterne, IconeHorloge, IconeToque } from '../composants/Icones.tsx';
import { dateSuisse } from '../composants/Champs.tsx';

const ETATS: Record<EtatSynchro, string> = {
  local: 'Sur ce téléphone',
  a_jour: 'Partagée avec le foyer',
  envoi: 'Envoi…',
  hors_ligne: 'Hors ligne : envoi au retour du réseau',
  erreur: 'Partage momentanément indisponible',
};

/** Où en est le partage de la liste, en une ligne discrète. */
function EtatPartage() {
  const etat = etatSynchro.utiliser();
  const { session } = useSession();
  if (!session && etat === 'local') return null;
  return (
    <span className={`etat-synchro etat-${etat}`} role="status">
      {ETATS[etat]}
    </span>
  );
}

export function Courses() {
  const articles = liste.utiliser();
  const historique = recettes.utiliser();
  const [message, setMessage] = useState<MessageCourses | null>(prendreMessageCourses);
  const [projet, setProjet] = useState<string | null>(() => lireProjet('recettes'));
  const [edition, setEdition] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  // Lien de Chef Feta reçu alors que la liste est déjà affichée.
  useEffect(() => {
    const auLien = () => {
      const m = prendreMessageCourses();
      if (m) setMessage(m);
    };
    window.addEventListener('hashchange', auLien);
    return () => window.removeEventListener('hashchange', auLien);
  }, []);

  const restants = articles.filter((a) => !a.coche).length;
  const recettesDansListe = new Set(articles.map((a) => a.recetteId));
  const plusieursRecettes = new Set(articles.map((a) => a.recette).filter(Boolean)).size > 1;

  return (
    <div className="ecran ecran-courses">
      <header className="entete-ecran entete-avec-action">
        <div>
          <h1>Courses</h1>
          <p className="discret">
            {articles.length === 0
              ? 'Rangées selon le parcours du magasin.'
              : restants === 0
                ? 'Tout est dans le panier.'
                : `${restants} article${restants > 1 ? 's' : ''} à prendre sur ${articles.length}`}
          </p>
          <EtatPartage />
        </div>
        {articles.length > 0 ? (
          <button type="button" className={`bouton-discret ${edition ? 'actif' : ''}`} aria-pressed={edition} onClick={() => setEdition(!edition)}>
            <IconeCrayon className="icone-petite" />
            {edition ? 'Terminé' : 'Modifier'}
          </button>
        ) : null}
      </header>

      {message ? (
        <p className={message.ok ? 'message-ok' : 'erreur'} role="status">
          {message.ok ? '✓ ' : ''}
          {message.message}
        </p>
      ) : null}

      {projet ? null : (
        <section className="carte-config">
          <h2>Relier Chef Feta</h2>
          <ConfigurationChefFeta onChange={setProjet} />
        </section>
      )}

      <Aide cle="courses" titre="Comment ça marche">
        <ol className="etapes etapes-numerotees">
          <li>Dans Chef Feta, demandez une recette complète.</li>
          <li>
            Touchez <strong>🛒 Ajouter à ma liste de courses</strong> : la liste arrive ici, et la recette dans l’onglet Recette.
          </li>
          <li>En magasin, cochez les articles. « Recettes » reprend une recette déjà reçue.</li>
        </ol>
      </Aide>

      {projet || historique.length > 0 ? (
        <div className="actions-courses">
          {projet ? (
            <a className="bouton-principal" href={projet} target="_blank" rel="noopener noreferrer">
              <IconeToque className="icone-petite" />
              Chef Feta
              <IconeExterne className="icone-petite icone-discrete" />
            </a>
          ) : null}
          {historique.length > 0 ? (
            <button
              type="button"
              className="bouton-secondaire"
              aria-expanded={historiqueOuvert}
              onClick={() => setHistoriqueOuvert(!historiqueOuvert)}
            >
              <IconeHorloge className="icone-petite" />
              Recettes
            </button>
          ) : null}
        </div>
      ) : null}

      {historiqueOuvert ? (
        <ul className="historique" aria-label="Recettes déjà reçues">
          {historique.map((r) => {
            const presente = recettesDansListe.has(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="historique-recette"
                  onClick={() => {
                    chargerRecette(r);
                    setHistoriqueOuvert(false);
                    setMessage({ ok: true, message: `${r.titre} : ${r.ingredients.length} articles dans la liste.` });
                  }}
                >
                  <span className="historique-titre">{r.titre}</span>
                  <span className="historique-detail">
                    {r.portions ? `${r.portions} pers. · ` : ''}
                    {r.ingredients.length} ingrédients · {dateSuisse(r.importeLe.slice(0, 10))}
                  </span>
                  <span className={`historique-etat ${presente ? 'present' : ''}`}>{presente ? 'Dans la liste' : 'Ajouter'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {articles.length === 0 ? (
        <p className="vide">
          Liste vide. {projet ? 'Ouvrez Chef Feta et touchez « 🛒 Ajouter à ma liste de courses » dans une recette.' : ''}
        </p>
      ) : (
        <ListeArticles articles={articles} edition={edition} plusieursRecettes={plusieursRecettes} />
      )}

      {edition || articles.length === 0 ? <AjoutArticle /> : null}

      {edition ? (
        <div className="actions">
          <button
            type="button"
            className="bouton-secondaire"
            disabled={restants === articles.length}
            onClick={() => liste.modifier((l) => l.filter((a) => !a.coche))}
          >
            Retirer les articles pris
          </button>
          <button
            type="button"
            className="bouton-lien bouton-danger"
            onClick={() => {
              if (window.confirm('Vider toute la liste de courses ?')) {
                liste.modifier(() => []);
                setEdition(false);
              }
            }}
          >
            Vider la liste
          </button>
        </div>
      ) : null}
    </div>
  );
}

const DUREE_SORTIE = 280;
const RANG_RAYON = new Map(PARCOURS.map((r, i) => [r, i]));

function mouvementReduit(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Articles par rayon. Par défaut (Réglages → Articles pris : En bas), un
 * article coché glisse hors de son rayon et rejoint « Dans le panier »,
 * en bas, grisé et barré ; un rayon sans article à prendre disparaît.
 */
function ListeArticles({ articles, edition, plusieursRecettes }: { articles: ArticleCourses[]; edition: boolean; plusieursRecettes: boolean }) {
  const { coches } = preferences.utiliser();
  const enBas = coches === 'en_bas' && !edition;
  const [sortants, setSortants] = useState<Set<string>>(new Set());
  const [entrants, setEntrants] = useState<Set<string>>(new Set());
  const minuteries = useRef<number[]>([]);
  useEffect(() => () => minuteries.current.forEach((m) => window.clearTimeout(m)), []);

  const plusTard = (f: () => void, delai: number) => {
    minuteries.current.push(window.setTimeout(f, delai));
  };
  const changerCoche = (id: string, coche: boolean) =>
    liste.modifier((l) => l.map((x) => (x.id === id ? { ...x, coche } : x)));

  const basculer = (a: ArticleCourses) => {
    if (!enBas || mouvementReduit()) return changerCoche(a.id, !a.coche);
    if (!a.coche) {
      // Coché : l'article s'efface de son rayon, puis rejoint le panier.
      if (sortants.has(a.id)) return;
      setSortants((s) => new Set(s).add(a.id));
      plusTard(() => {
        changerCoche(a.id, true);
        setSortants((s) => {
          const n = new Set(s);
          n.delete(a.id);
          return n;
        });
      }, DUREE_SORTIE);
    } else {
      // Décoché depuis le panier : il réapparaît doucement dans son rayon.
      changerCoche(a.id, false);
      setEntrants((s) => new Set(s).add(a.id));
      plusTard(() => {
        setEntrants((s) => {
          const n = new Set(s);
          n.delete(a.id);
          return n;
        });
      }, 400);
    }
  };

  const ligne = (a: ArticleCourses) =>
    edition ? (
      <li key={a.id}>
        <div className="article-edition">
          <input
            value={a.texte}
            aria-label={`Article : ${a.texte}`}
            onChange={(e) =>
              liste.modifier((l) => l.map((x) => (x.id === a.id ? { ...x, texte: e.target.value, manuel: x.recetteId !== null } : x)))
            }
          />
          <button
            type="button"
            className="bouton-icone"
            aria-label={`Retirer ${a.texte}`}
            onClick={() => liste.modifier((l) => l.filter((x) => x.id !== a.id))}
          >
            ×
          </button>
        </div>
      </li>
    ) : (
      <li key={a.id} className={sortants.has(a.id) ? 'article-sortant' : entrants.has(a.id) ? 'article-entrant' : undefined}>
        <label className={`article-courses ${a.coche || sortants.has(a.id) ? 'article-pris' : ''}`}>
          <input type="checkbox" checked={a.coche || sortants.has(a.id)} onChange={() => basculer(a)} />
          <span className="article-texte">
            {a.texte}
            {plusieursRecettes && a.recette ? <span className="article-recette">{a.recette}</span> : null}
          </span>
        </label>
      </li>
    );

  const groupes = parRayon(enBas ? articles.filter((a) => !a.coche) : articles);
  const pris = enBas
    ? articles
        .filter((a) => a.coche)
        .sort((x, y) => (RANG_RAYON.get(x.rayon) ?? 99) - (RANG_RAYON.get(y.rayon) ?? 99) || ordreArticles(x, y))
    : [];

  return (
    <div className="liste-courses">
      {groupes.map((g) => {
        const restants = g.articles.filter((a) => !a.coche && !sortants.has(a.id)).length;
        // Le dernier article du rayon s'en va : le rayon s'efface avec lui.
        const rayonSortant = enBas && restants === 0;
        return (
          <section key={g.rayon} className={`rayon ${rayonSortant ? 'rayon-sortant' : ''}`}>
            <h2 className="rayon-titre">
              {g.rayon}
              <span className="rayon-compte">{restants || '✓'}</span>
            </h2>
            <ul>{g.articles.map(ligne)}</ul>
          </section>
        );
      })}
      {pris.length > 0 ? (
        <section className="rayon rayon-panier">
          <h2 className="rayon-titre">
            Dans le panier
            <span className="rayon-compte">{pris.length}</span>
          </h2>
          <ul>{pris.map(ligne)}</ul>
        </section>
      ) : null}
    </div>
  );
}

function AjoutArticle() {
  const [texte, setTexte] = useState('');
  const [rayon, setRayon] = useState(RAYON_AUTRES);
  return (
    <form
      className="ajout-article"
      onSubmit={(e) => {
        e.preventDefault();
        const t = texte.trim();
        if (!t) return;
        liste.modifier((l) => [
          ...l,
          { id: nouvelId(), creeLe: new Date().toISOString(), texte: t, rayon, recetteId: null, recette: '', ingredient: null, coche: false },
        ]);
        setTexte('');
      }}
    >
      <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ajouter un article" aria-label="Article à ajouter" />
      <select value={rayon} onChange={(e) => setRayon(e.target.value)} aria-label="Rayon">
        {PARCOURS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button type="submit" className="bouton-principal" disabled={!texte.trim()}>
        Ajouter
      </button>
    </form>
  );
}
