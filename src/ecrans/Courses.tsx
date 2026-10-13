// Liste de courses : les ingrédients des recettes de Chef Feta, triés
// selon le parcours du magasin, à cocher pendant les courses. La liste
// est gardée sur le téléphone et fonctionne sans réseau.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AJOUT_INSTRUCTIONS_CHEF_FETA, PARCOURS, RAYON_AUTRES, parRayon, type ArticleCourses } from '../lib/courses.ts';
import { enregistrerListe, importerRecette, lireListe, nouvelId, prendreMessageCourses, type MessageCourses } from '../lecture/listeCourses.ts';
import { enregistrerProjet, lirePressePapiersSiAutorise, lireProjet, oublierProjet } from '../lecture/claude.ts';
import { lien } from '../routeur.ts';

const IconeQR = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-tuile">
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
    <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" className="plein" />
  </svg>
);

const IconeChef = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-tuile">
    <path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 6a4 4 0 0 1 1 8v5H7z" />
    <path d="M7 17h10" />
  </svg>
);

export function Courses() {
  const [liste, setListe] = useState<ArticleCourses[]>(lireListe);
  const [message, setMessage] = useState<MessageCourses | null>(prendreMessageCourses);
  const [collage, setCollage] = useState<string | null>(null);
  const [nouvelArticle, setNouvelArticle] = useState('');
  const [rayonNouveau, setRayonNouveau] = useState(RAYON_AUTRES);
  const [projet, setProjet] = useState<string | null>(() => lireProjet('recettes'));
  const [chezClaude, setChezClaude] = useState(false);
  const enCollage = useRef(false);
  enCollage.current = collage !== null;

  const modifier = (maj: (l: ArticleCourses[]) => ArticleCourses[]) => {
    setListe((l) => {
      const suivante = maj(l);
      enregistrerListe(suivante);
      return suivante;
    });
  };

  const importer = useCallback((texte: string): boolean => {
    const r = importerRecette(texte);
    setMessage(r);
    if (r.ok) {
      setListe(lireListe());
      setCollage(null);
    }
    return r.ok;
  }, []);

  // Lien de Chef Feta reçu alors que la liste est déjà affichée.
  useEffect(() => {
    const auLien = () => {
      const m = prendreMessageCourses();
      if (m) {
        setMessage(m);
        setListe(lireListe());
      }
    };
    window.addEventListener('hashchange', auLien);
    return () => window.removeEventListener('hashchange', auLien);
  }, []);

  // Retour depuis Claude : recette copiée reprise sans rien toucher, si le
  // navigateur l'autorise (Chrome sur Android, après un premier « Coller »).
  useEffect(() => {
    if (!chezClaude) return;
    const auRetour = async () => {
      if (document.visibilityState !== 'visible' || enCollage.current) return;
      const texte = await lirePressePapiersSiAutorise();
      if (texte && /ingr[ée]dients|#\/courses\//i.test(texte) && importer(texte)) setChezClaude(false);
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [chezClaude, importer]);

  const coller = async () => {
    try {
      const texte = await navigator.clipboard.readText();
      if (!texte.trim() || !importer(texte)) setCollage(texte);
    } catch {
      setCollage('');
    }
  };

  const groupes = parRayon(liste);
  const restants = liste.filter((a) => !a.coche).length;
  const recettes = [...new Set(liste.map((a) => a.recette))];
  const plusieursRecettes = recettes.length > 1;

  return (
    <div className="ecran ecran-courses">
      <header className="entete-ecran">
        <h1>Liste de courses</h1>
        <p className="discret">
          {liste.length === 0
            ? 'Triée selon le parcours du Migros MM Métropole Renens.'
            : restants === 0
              ? 'Tout est dans le panier.'
              : `${restants} article${restants > 1 ? 's' : ''} à prendre sur ${liste.length}.`}
        </p>
      </header>

      <div className="tuiles-acces">
        <a className="tuile-acces tuile-sombre" href={lien('cumulus')}>
          <IconeQR />
          <span>Carte Cumulus</span>
        </a>
        {projet ? (
          <a
            className="tuile-acces"
            href={projet}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setChezClaude(true)}
          >
            <IconeChef />
            <span>Ouvrir Chef Feta</span>
          </a>
        ) : (
          <button
            type="button"
            className="tuile-acces"
            onClick={() => document.getElementById('reglages-chef-feta')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <IconeChef />
            <span>Relier Chef Feta</span>
          </button>
        )}
      </div>

      {message ? (
        <p className={message.ok ? 'message-ok' : 'erreur'} role="status">
          {message.ok ? '✓ ' : ''}
          {message.message}
        </p>
      ) : null}

      {collage !== null ? (
        <section className="bloc-collage">
          <label className="champ champ-large">
            <span className="champ-etiquette">Recette copiée depuis Claude</span>
            <textarea rows={6} value={collage} onChange={(e) => setCollage(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="bouton-secondaire" onClick={() => setCollage(null)}>
              Annuler
            </button>
            <button type="button" className="bouton-principal" disabled={!collage.trim()} onClick={() => importer(collage)}>
              Ajouter à la liste
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className={chezClaude ? 'bouton-principal bouton-large' : 'bouton-secondaire bouton-large'} onClick={() => void coller()}>
          Coller une recette copiée depuis Claude
        </button>
      )}

      {liste.length === 0 ? (
        <p className="vide">
          Liste vide. Dans une recette de Chef Feta, touchez « 🛒 Ajouter à ma liste de courses », ou copiez la recette puis
          touchez « Coller une recette ».
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
                    <label className={`article-courses ${a.coche ? 'article-pris' : ''}`}>
                      <input
                        type="checkbox"
                        checked={a.coche}
                        onChange={() => modifier((l) => l.map((x) => (x.id === a.id ? { ...x, coche: !x.coche } : x)))}
                      />
                      <span className="article-texte">
                        {a.texte}
                        {plusieursRecettes && a.recette ? <span className="article-recette">{a.recette}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <form
        className="ajout-article"
        onSubmit={(e) => {
          e.preventDefault();
          const texte = nouvelArticle.trim();
          if (!texte) return;
          modifier((l) => [...l, { id: nouvelId(), texte, rayon: rayonNouveau, recette: '', coche: false }]);
          setNouvelArticle('');
        }}
      >
        <input
          value={nouvelArticle}
          onChange={(e) => setNouvelArticle(e.target.value)}
          placeholder="Ajouter un article"
          aria-label="Article à ajouter"
        />
        <select value={rayonNouveau} onChange={(e) => setRayonNouveau(e.target.value)} aria-label="Rayon">
          {PARCOURS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" className="bouton-principal" disabled={!nouvelArticle.trim()}>
          Ajouter
        </button>
      </form>

      {liste.length > 0 ? (
        <section className="bloc">
          {recettes.filter(Boolean).length > 0 ? (
            <>
              <h2>Recettes dans la liste</h2>
              <ul className="puces-recettes">
                {recettes.filter(Boolean).map((r) => (
                  <li key={r}>
                    <span>{r}</span>
                    <button
                      type="button"
                      className="bouton-icone"
                      aria-label={`Retirer ${r}`}
                      onClick={() => modifier((l) => l.filter((a) => a.recette !== r))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="bouton-secondaire"
              disabled={restants === liste.length}
              onClick={() => modifier((l) => l.filter((a) => !a.coche))}
            >
              Retirer les articles pris
            </button>
            <button
              type="button"
              className="bouton-lien bouton-danger"
              onClick={() => {
                if (window.confirm('Vider toute la liste de courses ?')) modifier(() => []);
              }}
            >
              Vider la liste
            </button>
          </div>
        </section>
      ) : null}

      <ReglagesChefFeta projet={projet} onChange={setProjet} />
    </div>
  );
}

function ReglagesChefFeta({ projet, onChange }: { projet: string | null; onChange: (p: string | null) => void }) {
  const [saisie, setSaisie] = useState('');
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <details className="bloc reglages" id="reglages-chef-feta" open={projet === null}>
      <summary>Relier le projet Chef Feta</summary>
      <ol className="etapes etapes-numerotees">
        <li>
          <p>
            Copiez ce complément et collez-le à la fin des instructions du projet Chef Feta : chaque recette complète finira par
            un lien « 🛒 Ajouter à ma liste de courses ».
          </p>
          <button
            type="button"
            className="bouton-secondaire"
            onClick={() =>
              navigator.clipboard
                .writeText(AJOUT_INSTRUCTIONS_CHEF_FETA)
                .then(() => setCopie(true))
                .catch(() => setErreur('Copie impossible : ouvrez « Voir le complément » et copiez-le à la main.'))
            }
          >
            {copie ? 'Complément copié ✓' : 'Copier le complément'}
          </button>
          <details>
            <summary>Voir le complément</summary>
            <pre className="consigne">{AJOUT_INSTRUCTIONS_CHEF_FETA}</pre>
          </details>
        </li>
        <li>
          <p>Collez l’adresse du projet Chef Feta (https://claude.ai/project/…) pour l’ouvrir d’ici en un geste.</p>
          {projet ? (
            <p className="projet-enregistre">
              <span>Projet enregistré ✓</span>
              <button
                type="button"
                className="bouton-lien"
                onClick={() => {
                  oublierProjet('recettes');
                  onChange(null);
                }}
              >
                Changer
              </button>
            </p>
          ) : (
            <div className="saisie-projet">
              <input
                type="url"
                inputMode="url"
                placeholder="https://claude.ai/project/…"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                aria-label="Adresse du projet Chef Feta"
              />
              <button
                type="button"
                className="bouton-principal"
                disabled={!saisie.trim()}
                onClick={() => {
                  const adresse = enregistrerProjet(saisie, 'recettes');
                  if (adresse) {
                    onChange(adresse);
                    setSaisie('');
                    setErreur(null);
                  } else {
                    setErreur('Adresse non reconnue. Elle commence par https://claude.ai/project/');
                  }
                }}
              >
                Enregistrer
              </button>
            </div>
          )}
        </li>
      </ol>
      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}
    </details>
  );
}
