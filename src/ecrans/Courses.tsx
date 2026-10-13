// Liste de courses : les ingrédients des recettes de Chef Feta, rangés
// selon le parcours du magasin, à cocher pendant les courses. Gardée sur
// le téléphone, utilisable sans réseau.

import { useEffect, useState } from 'react';
import { PARCOURS, RAYON_AUTRES, parRayon } from '../lib/courses.ts';
import { liste, nouvelId, recettes } from '../donnees/local.ts';
import { chargerRecette, prendreMessageCourses, type MessageCourses } from '../lecture/chefFeta.ts';
import { lireProjet } from '../lecture/claude.ts';
import { Aide } from '../composants/Aide.tsx';
import { ConfigurationChefFeta } from '../composants/ConfigurationChefFeta.tsx';
import { IconeCrayon, IconeExterne, IconeHorloge, IconeToque } from '../composants/Icones.tsx';
import { dateSuisse } from '../composants/Champs.tsx';

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

  const groupes = parRayon(articles);
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
        <div className="liste-courses">
          {groupes.map((g) => (
            <section key={g.rayon} className="rayon">
              <h2 className="rayon-titre">
                {g.rayon}
                <span className="rayon-compte">{g.articles.filter((a) => !a.coche).length || '✓'}</span>
              </h2>
              <ul>
                {g.articles.map((a) => (
                  <li key={a.id}>
                    {edition ? (
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
                    ) : (
                      <label className={`article-courses ${a.coche ? 'article-pris' : ''}`}>
                        <input
                          type="checkbox"
                          checked={a.coche}
                          onChange={() => liste.modifier((l) => l.map((x) => (x.id === a.id ? { ...x, coche: !x.coche } : x)))}
                        />
                        <span className="article-texte">
                          {a.texte}
                          {plusieursRecettes && a.recette ? <span className="article-recette">{a.recette}</span> : null}
                        </span>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
        liste.modifier((l) => [...l, { id: nouvelId(), texte: t, rayon, recetteId: null, recette: '', ingredient: null, coche: false }]);
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
