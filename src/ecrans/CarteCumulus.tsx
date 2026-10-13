// Carte Cumulus du foyer, en QR code à présenter à la caisse. Le code est
// gardé dans la base (comptes connectés seulement) et copié sur le
// téléphone pour s'afficher même sans réseau au magasin.

import { useEffect, useState } from 'react';
import { carteLocale, enregistrerCarteCumulus, lireCarteCumulus, supprimerCarteCumulus } from '../api.ts';
import { CodeQR } from '../composants/CodeQR.tsx';
import { lien } from '../routeur.ts';

/** Garde l'écran allumé tant que la carte est affichée (si le navigateur le permet). */
function useEcranAllume(actif: boolean) {
  useEffect(() => {
    if (!actif || !('wakeLock' in navigator)) return;
    let verrou: WakeLockSentinel | null = null;
    let fini = false;
    const demander = () => {
      navigator.wakeLock
        .request('screen')
        .then((v) => {
          if (fini) void v.release();
          else verrou = v;
        })
        .catch(() => undefined);
    };
    const auRetour = () => {
      if (document.visibilityState === 'visible') demander();
    };
    demander();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      fini = true;
      document.removeEventListener('visibilitychange', auRetour);
      void verrou?.release();
    };
  }, [actif]);
}

export function CarteCumulus() {
  const [code, setCode] = useState<string | null>(carteLocale);
  const [chargement, setChargement] = useState(code === null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [modifier, setModifier] = useState(false);

  useEcranAllume(code !== null && !modifier);

  useEffect(() => {
    lireCarteCumulus()
      .then((c) => setCode(c))
      .catch((e: Error) => {
        // Hors ligne : la copie locale suffit pour afficher la carte.
        if (carteLocale() === null) setErreur(e.message);
      })
      .finally(() => setChargement(false));
  }, []);

  const enregistrer = async () => {
    setErreur(null);
    try {
      await enregistrerCarteCumulus(saisie);
      setCode(saisie.trim());
      setSaisie('');
      setModifier(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  const formulaire = (
    <div className="formulaire">
      <label className="champ champ-large">
        <span className="champ-etiquette">Code de la carte (texte du QR code Cumulus)</span>
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <button type="button" className="bouton-principal" disabled={saisie.trim().length < 4} onClick={() => void enregistrer()}>
        Enregistrer la carte
      </button>
    </div>
  );

  return (
    <div className="ecran ecran-carte">
      <header className="entete-ecran">
        <h1>Carte Cumulus</h1>
        <p className="discret">À présenter à la caisse. Visible seulement par les comptes connectés.</p>
      </header>

      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {code && !modifier ? (
        <>
          <div className="carte-qr">
            <CodeQR texte={code} titre="QR code de la carte Cumulus" />
            <p className="carte-qr-legende">Cumulus</p>
          </div>
          <p className="discret centre">Montez la luminosité de l’écran si la caisse ne lit pas le code.</p>
          <div className="actions">
            <a className="bouton-secondaire" href={lien('courses')}>
              Liste de courses
            </a>
            <button type="button" className="bouton-lien" onClick={() => setModifier(true)}>
              Changer de carte
            </button>
          </div>
        </>
      ) : chargement ? (
        <p className="discret">Chargement…</p>
      ) : (
        <>
          {formulaire}
          {code ? (
            <div className="actions">
              <button type="button" className="bouton-secondaire" onClick={() => setModifier(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="bouton-lien bouton-danger"
                onClick={async () => {
                  if (!window.confirm('Retirer la carte Cumulus pour tous les comptes ?')) return;
                  try {
                    await supprimerCarteCumulus();
                    setCode(null);
                    setModifier(false);
                  } catch (e) {
                    setErreur(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Retirer la carte
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
