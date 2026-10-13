// Mise en place du projet Claude qui lit les tickets : à faire une fois.
// Utilisé dans « Ajouter » (premier usage) et dans « Profil ».

import { useState } from 'react';
import { INSTRUCTIONS_PROJET } from '../lib/importClaude.ts';
import { ADRESSE_PROJETS, enregistrerProjet, lireProjet, oublierProjet } from '../lecture/claude.ts';

export function ConfigurationClaude({ onTermine }: { onTermine?: () => void }) {
  const [projet, setProjet] = useState<string | null>(lireProjet);
  const [saisie, setSaisie] = useState('');
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(INSTRUCTIONS_PROJET);
      setCopie(true);
      setErreur(null);
    } catch {
      setErreur('Copie impossible : ouvrez « Voir les instructions » et copiez-les à la main.');
    }
  };

  const enregistrer = () => {
    const adresse = enregistrerProjet(saisie);
    if (!adresse) {
      setErreur('Adresse non reconnue. Elle commence par https://claude.ai/project/');
      return;
    }
    setProjet(adresse);
    setSaisie('');
    setErreur(null);
    onTermine?.();
  };

  return (
    <div className="configuration-claude">
      <ol className="etapes etapes-numerotees">
        <li>
          <p>
            Dans le navigateur du téléphone, ouvrez Claude et créez un projet nommé « Panier Témoin ».
          </p>
          <a className="bouton-secondaire" href={ADRESSE_PROJETS} target="_blank" rel="noopener noreferrer">
            Ouvrir les projets Claude
          </a>
        </li>
        <li>
          <p>Copiez les instructions, puis collez-les dans les instructions du projet (« Instructions » ou « Set project instructions »).</p>
          <button type="button" className="bouton-secondaire" onClick={() => void copier()}>
            {copie ? 'Instructions copiées ✓' : 'Copier les instructions'}
          </button>
          <details>
            <summary>Voir les instructions</summary>
            <pre className="consigne">{INSTRUCTIONS_PROJET}</pre>
          </details>
        </li>
        <li>
          <p>Copiez l’adresse de la page du projet (elle commence par https://claude.ai/project/) et collez-la ici.</p>
          {projet ? (
            <p className="projet-enregistre">
              <span>Projet enregistré ✓</span>
              <button
                type="button"
                className="bouton-lien"
                onClick={() => {
                  oublierProjet();
                  setProjet(null);
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
                aria-label="Adresse du projet Claude"
              />
              <button type="button" className="bouton-principal" disabled={saisie.trim() === ''} onClick={enregistrer}>
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
    </div>
  );
}
