// Recette de Chef Feta dont les articles sont dans la liste de courses :
// lecture en cuisine, portions, et modification à la main. Quand la
// recette change, l'app propose d'adapter la liste de courses.

import { Fragment, useState, type ReactNode } from 'react';
import { ecartsAvecRecette, PARCOURS, rayonDuParcours } from '../lib/courses.ts';
import { adapterQuantite, facteurPortions, type Ingredient, type Recette as TypeRecette } from '../lib/recettes.ts';
import { liste, recetteActive, useRecettesDeLaListe } from '../donnees/local.ts';
import { adapterListe, enregistrerEdition, enregistrerRecette, remettreIngredient, supprimerRecette } from '../lecture/chefFeta.ts';
import type { ArticleCourses } from '../lib/courses.ts';
import { IconeCrayon } from '../composants/Icones.tsx';
import { lien } from '../routeur.ts';

/** « **Sauce :** mélange… » → texte avec passages en gras. */
function avecGras(texte: string): ReactNode {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
    morceau.startsWith('**') && morceau.endsWith('**') ? <strong key={i}>{morceau.slice(2, -2)}</strong> : <Fragment key={i}>{morceau}</Fragment>,
  );
}

export function Recette() {
  const presentes = useRecettesDeLaListe();
  const activeId = recetteActive.utiliser();
  const articles = liste.utiliser();
  const [edition, setEdition] = useState(false);

  const recette = presentes.find((r) => r.id === activeId) ?? presentes[0];
  if (!recette) {
    return (
      <div className="ecran">
        <h1>Recette</h1>
        <p className="vide">
          Aucune recette dans la liste de courses. <a href={lien('courses')}>Ouvrir les courses</a>
        </p>
      </div>
    );
  }

  return (
    <div className="ecran ecran-recette">
      {presentes.length > 1 ? (
        <div className="choix-recettes" role="tablist" aria-label="Recettes de la liste">
          {presentes.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === recette.id}
              className={`puce-recette ${r.id === recette.id ? 'actif' : ''}`}
              onClick={() => {
                recetteActive.modifier(() => r.id);
                setEdition(false);
              }}
            >
              {r.titre}
            </button>
          ))}
        </div>
      ) : null}

      {edition ? (
        <EditionRecette key={recette.id} recette={recette} onFin={() => setEdition(false)} />
      ) : (
        <LectureRecette
          recette={recette}
          articles={articles.filter((a) => a.recetteId === recette.id)}
          ecarts={ecartsAvecRecette(articles, recette)}
          onModifier={() => setEdition(true)}
        />
      )}
    </div>
  );
}

function LectureRecette({
  recette,
  articles,
  ecarts,
  onModifier,
}: {
  recette: TypeRecette;
  articles: ArticleCourses[];
  ecarts: number;
  onModifier: () => void;
}) {
  const facteur = facteurPortions(recette);
  const parRang = new Map(articles.map((a) => [a.ingredient, a]));
  const parRayons = PARCOURS.map((rayon) => ({
    rayon,
    ingredients: recette.ingredients.map((ing, rang) => ({ ing, rang })).filter(({ ing }) => rayonDuParcours(ing.rayon) === rayon),
  })).filter((g) => g.ingredients.length > 0);
  const horsListe = recette.ingredients.length - recette.ingredients.filter((_, rang) => parRang.has(rang)).length;

  const changerPortions = (delta: number) => {
    const actuelles = recette.portions ?? recette.personnes ?? 1;
    const portions = Math.min(24, Math.max(1, actuelles + delta));
    enregistrerRecette({ ...recette, portions });
  };

  return (
    <>
      <header className="entete-ecran entete-avec-action">
        <div>
          <h1 className="titre-recette">{recette.titre}</h1>
          {recette.infos ? <p className="discret">{recette.infos}</p> : null}
        </div>
        <button type="button" className="bouton-discret" onClick={onModifier}>
          <IconeCrayon className="icone-petite" />
          Modifier
        </button>
      </header>

      {recette.personnes ? (
        <div className="portions" role="group" aria-label="Nombre de personnes">
          <button type="button" className="bouton-rond" aria-label="Une personne de moins" onClick={() => changerPortions(-1)}>
            −
          </button>
          <span className="portions-valeur">
            <strong>{recette.portions ?? recette.personnes}</strong> personne{(recette.portions ?? recette.personnes) > 1 ? 's' : ''}
          </span>
          <button type="button" className="bouton-rond" aria-label="Une personne de plus" onClick={() => changerPortions(1)}>
            +
          </button>
        </div>
      ) : null}

      {ecarts > 0 ? (
        <div className="bandeau-maj" role="status">
          <p>
            La liste de courses ne suit plus la recette : {ecarts} article{ecarts > 1 ? 's changent' : ' change'}.
          </p>
          <button type="button" className="bouton-principal" onClick={() => adapterListe(recette)}>
            Adapter la liste
          </button>
        </div>
      ) : null}

      <section className="bloc-recette">
        <h2>Ingrédients</h2>
        {horsListe > 0 ? (
          <p className="discret note-ingredients">
            {horsListe === 1 ? 'Un ingrédient n’est pas' : `${horsListe} ingrédients ne sont pas`} dans la liste de courses.
          </p>
        ) : null}
        {parRayons.map((g) => (
          <div key={g.rayon} className="ingredients-rayon">
            <h3 className="rayon-titre">{g.rayon}</h3>
            <ul className="ingredients">
              {g.ingredients.map(({ ing, rang }) => {
                const article = parRang.get(rang);
                return (
                  <li key={rang} className={article ? (article.coche ? 'ingredient-pris' : undefined) : 'ingredient-hors-liste'}>
                    <span>{adapterQuantite(ing.texte, facteur)}</span>
                    {article ? null : (
                      <button
                        type="button"
                        className="bouton-remettre"
                        aria-label={`Remettre ${ing.texte} dans la liste de courses`}
                        onClick={() => remettreIngredient(recette, rang)}
                      >
                        + Liste
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="bloc-recette">
        <h2>Préparation</h2>
        {recette.etapes.length > 0 ? (
          <ol className="etapes-recette">
            {recette.etapes.map((e, i) => (
              <li key={i}>{avecGras(e)}</li>
            ))}
          </ol>
        ) : (
          <p className="discret">
            Chef Feta n’a pas transmis les étapes. Copiez le nouveau complément dans ses instructions (Réglages → Chef Feta), ou
            ajoutez-les avec « Modifier ».
          </p>
        )}
      </section>

      {recette.astuces.length > 0 ? (
        <section className="bloc-recette">
          <h2>Astuces</h2>
          <ul className="astuces">
            {recette.astuces.map((a, i) => (
              <li key={i}>{avecGras(a)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {recette.nutrition ? (
        <section className="bloc-recette">
          <h2>Par portion</h2>
          <p className="nutrition">{recette.nutrition}</p>
        </section>
      ) : null}
    </>
  );
}

function EditionRecette({ recette, onFin }: { recette: TypeRecette; onFin: () => void }) {
  const [brouillon, setBrouillon] = useState<TypeRecette>(recette);
  // Rang d'origine de chaque ingrédient (null : ajouté), pour que la liste suive.
  const [origines, setOrigines] = useState<Array<number | null>>(() => recette.ingredients.map((_, i) => i));
  const maj = (patch: Partial<TypeRecette>) => setBrouillon((b) => ({ ...b, ...patch }));
  const majIngredient = (i: number, patch: Partial<Ingredient>) =>
    maj({ ingredients: brouillon.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const majListe = (cle: 'etapes' | 'astuces', i: number, texte: string) =>
    maj({ [cle]: brouillon[cle].map((x, j) => (j === i ? texte : x)) } as Partial<TypeRecette>);

  const enregistrer = () => {
    const personnes = brouillon.personnes && brouillon.personnes > 0 ? brouillon.personnes : null;
    const gardes = brouillon.ingredients.map((ing, i) => ({ ing, origine: origines[i] ?? null })).filter(({ ing }) => ing.texte.trim());
    enregistrerEdition({
      ...brouillon,
      titre: brouillon.titre.trim() || recette.titre,
      personnes,
      portions: personnes ? (brouillon.portions ?? personnes) : null,
      ingredients: gardes.map(({ ing }) => ing),
      etapes: brouillon.etapes.filter((e) => e.trim()),
      astuces: brouillon.astuces.filter((a) => a.trim()),
      modifieLe: new Date().toISOString(),
    }, gardes.map(({ origine }) => origine));
    onFin();
  };

  return (
    <div className="edition-recette">
      <header className="entete-ecran">
        <h1>Modifier la recette</h1>
        <p className="discret">Les quantités de la liste de courses pourront ensuite être adaptées.</p>
      </header>

      <label className="champ champ-large">
        <span className="champ-etiquette">Nom du plat</span>
        <input value={brouillon.titre} onChange={(e) => maj({ titre: e.target.value })} />
      </label>
      <div className="grille-deux">
        <label className="champ">
          <span className="champ-etiquette">Personnes</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            value={brouillon.personnes ?? ''}
            onChange={(e) => maj({ personnes: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className="champ">
          <span className="champ-etiquette">Temps et saison</span>
          <input value={brouillon.infos} onChange={(e) => maj({ infos: e.target.value })} />
        </label>
      </div>

      <fieldset className="groupe-edition">
        <legend>Ingrédients</legend>
        {brouillon.ingredients.map((ing, i) => (
          <div key={i} className="ligne-edition ligne-edition-ingredient">
            <input value={ing.texte} aria-label={`Ingrédient ${i + 1}`} onChange={(e) => majIngredient(i, { texte: e.target.value })} />
            <select value={rayonDuParcours(ing.rayon)} aria-label={`Rayon de l’ingrédient ${i + 1}`} onChange={(e) => majIngredient(i, { rayon: e.target.value })}>
              {PARCOURS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bouton-icone"
              aria-label={`Retirer l’ingrédient ${i + 1}`}
              onClick={() => {
                maj({ ingredients: brouillon.ingredients.filter((_, j) => j !== i) });
                setOrigines((o) => o.filter((_, j) => j !== i));
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="bouton-ajout"
          onClick={() => {
            maj({ ingredients: [...brouillon.ingredients, { rayon: 'Autres', texte: '' }] });
            setOrigines((o) => [...o, null]);
          }}
        >
          + Ingrédient
        </button>
      </fieldset>

      {(['etapes', 'astuces'] as const).map((cle) => (
        <fieldset key={cle} className="groupe-edition">
          <legend>{cle === 'etapes' ? 'Préparation' : 'Astuces'}</legend>
          {brouillon[cle].map((texte, i) => (
            <div key={i} className="ligne-edition ligne-edition-texte">
              {cle === 'etapes' ? <span className="numero-etape">{i + 1}</span> : null}
              <textarea rows={3} value={texte} aria-label={`${cle === 'etapes' ? 'Étape' : 'Astuce'} ${i + 1}`} onChange={(e) => majListe(cle, i, e.target.value)} />
              <button
                type="button"
                className="bouton-icone"
                aria-label={`Retirer ${cle === 'etapes' ? 'l’étape' : 'l’astuce'} ${i + 1}`}
                onClick={() => maj({ [cle]: brouillon[cle].filter((_, j) => j !== i) } as Partial<TypeRecette>)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="bouton-ajout" onClick={() => maj({ [cle]: [...brouillon[cle], ''] } as Partial<TypeRecette>)}>
            {cle === 'etapes' ? '+ Étape' : '+ Astuce'}
          </button>
        </fieldset>
      ))}

      <label className="champ champ-large">
        <span className="champ-etiquette">Valeurs nutritionnelles par portion</span>
        <input value={brouillon.nutrition} onChange={(e) => maj({ nutrition: e.target.value })} />
      </label>

      <div className="pied-edition">
        <button type="button" className="bouton-secondaire" onClick={onFin}>
          Annuler
        </button>
        <button type="button" className="bouton-principal" onClick={enregistrer}>
          Enregistrer
        </button>
      </div>
      <button
        type="button"
        className="bouton-lien bouton-danger"
        onClick={() => {
          if (window.confirm('Supprimer cette recette et ses articles de la liste de courses ?')) {
            supprimerRecette(recette.id);
            onFin();
          }
        }}
      >
        Supprimer la recette
      </button>
    </div>
  );
}
