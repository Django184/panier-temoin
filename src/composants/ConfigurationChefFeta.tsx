// Liaison avec le projet Chef Feta : complément d'instructions à coller
// dans le projet, et adresse du projet pour l'ouvrir depuis l'app.

import { useState } from 'react';
import { AJOUT_INSTRUCTIONS_CHEF_FETA } from '../lib/recettes.ts';
import { enregistrerProjet, lireProjet, oublierProjet } from '../lecture/claude.ts';

export function ConfigurationChefFeta({ onChange }: { onChange?: (projet: string | null) => void }) {
  const [projet, setProjet] = useState<string | null>(() => lireProjet('recettes'));
  const [saisie, setSaisie] = useState('');
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (p: string | null) => {
    setProjet(p);
    onChange?.(p);
  };

  return (
    <div className="configuration-claude">
      <ol className="etapes etapes-numerotees">
        <li>
          <p>
            Collez ce complément à la fin des instructions du projet Chef Feta : chaque recette complète finira par un lien
            « 🛒 Ajouter à ma liste de courses », qui apporte aussi la recette dans l’app.
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
          <p>Adresse du projet Chef Feta (https://claude.ai/project/…), pour l’ouvrir d’ici en un geste.</p>
          {projet ? (
            <p className="projet-enregistre">
              <span>Projet relié ✓</span>
              <button
                type="button"
                className="bouton-lien"
                onClick={() => {
                  oublierProjet('recettes');
                  changer(null);
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
                    changer(adresse);
                    setSaisie('');
                    setErreur(null);
                  } else {
                    setErreur('Adresse non reconnue. Elle commence par https://claude.ai/project/');
                  }
                }}
              >
                Relier
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
    </div>
  );
}
