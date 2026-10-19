// Carte Cumulus du foyer, à présenter à la caisse : code-barres EAN-13 du
// numéro de carte, identique à celui de l'app Migros (vérifié en caisse).
// Gardée dans la base (comptes connectés seulement) et copiée sur le
// téléphone pour s'afficher même sans réseau au magasin.

import { useEffect, useState } from 'react';
import { carteLocale, enregistrerCarteCumulus, lireCarteCumulus, supprimerCarteCumulus, type Carte } from '../api.ts';
import { CodeBarres } from '../composants/CodesCarte.tsx';
import { ean13Valide } from '../lib/ean13.ts';

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
  const [carte, setCarte] = useState<Carte | null>(carteLocale);
  const [chargement, setChargement] = useState(carte === null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modifier, setModifier] = useState(false);

  const numero = carte?.numero && ean13Valide(carte.numero) ? carte.numero : null;

  useEcranAllume(numero !== null && !modifier);

  useEffect(() => {
    lireCarteCumulus()
      .then(setCarte)
      .catch((e: Error) => {
        // Hors ligne : la copie locale suffit pour afficher la carte.
        if (carteLocale() === null) setErreur(e.message);
      })
      .finally(() => setChargement(false));
  }, []);

  return (
    <div className="ecran ecran-carte">
      <h1>Carte Cumulus</h1>

      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {numero && !modifier ? (
        <>
          <div className="carte-code carte-code-barres carte-seule">
            <CodeBarres numero={numero} />
            <p className="carte-code-legende">Cumulus</p>
          </div>
          <p className="discret centre aide-carte">
            Points Cumulus crédités comme avec l’app Migros. Les bons bleus, eux, demandent l’app Migros. Montez la luminosité si
            la caisse ne lit pas le code.
          </p>
          <button type="button" className="bouton-lien lien-bas" onClick={() => setModifier(true)}>
            Modifier la carte
          </button>
        </>
      ) : chargement ? (
        <p className="discret">Chargement…</p>
      ) : (
        <FormulaireCarte
          carte={carte}
          onEnregistre={(c) => {
            setCarte(c);
            setModifier(false);
          }}
          onAnnule={carte ? () => setModifier(false) : undefined}
          onSupprime={
            carte
              ? async () => {
                  if (!window.confirm('Retirer la carte Cumulus pour tous les comptes ?')) return;
                  try {
                    await supprimerCarteCumulus();
                    setCarte(null);
                    setModifier(false);
                  } catch (e) {
                    setErreur(e instanceof Error ? e.message : String(e));
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function FormulaireCarte({
  carte,
  onEnregistre,
  onAnnule,
  onSupprime,
}: {
  carte: Carte | null;
  onEnregistre: (c: Carte) => void;
  onAnnule?: () => void;
  onSupprime?: () => void;
}) {
  const [numero, setNumero] = useState(carte?.numero ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const numeroPropre = numero.replace(/\s/g, '');

  const enregistrer = async () => {
    if (numeroPropre && !ean13Valide(numeroPropre)) {
      setErreur('Le numéro de carte doit compter 13 chiffres (par exemple 2099…), sans erreur de frappe.');
      return;
    }
    const nouvelle = { code: null, numero: numeroPropre || null };
    try {
      await enregistrerCarteCumulus(nouvelle);
      onEnregistre(nouvelle);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="formulaire">
      <label className="champ champ-large">
        <span className="champ-etiquette">Numéro de carte (13 chiffres, au dos de la carte ou partagé depuis l’app Migros)</span>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" autoComplete="off" />
      </label>
      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <button type="button" className="bouton-principal" disabled={!numeroPropre} onClick={() => void enregistrer()}>
        Enregistrer la carte
      </button>
      {onAnnule || onSupprime ? (
        <div className="actions">
          {onAnnule ? (
            <button type="button" className="bouton-secondaire" onClick={onAnnule}>
              Annuler
            </button>
          ) : null}
          {onSupprime ? (
            <button type="button" className="bouton-lien bouton-danger" onClick={onSupprime}>
              Retirer la carte
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
