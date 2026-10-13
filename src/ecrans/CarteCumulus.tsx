// Carte Cumulus du foyer, à présenter à la caisse : code Aztec (comme
// dans Google Wallet et l'app Migros) ou code-barres du numéro de carte.
// Gardée dans la base (comptes connectés seulement) et copiée sur le
// téléphone pour s'afficher même sans réseau au magasin.

import { useEffect, useRef, useState } from 'react';
import { carteLocale, enregistrerCarteCumulus, lireCarteCumulus, supprimerCarteCumulus, type Carte } from '../api.ts';
import { CodeAztec, CodeBarres } from '../composants/CodesCarte.tsx';
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
  const [diapo, setDiapo] = useState(0);
  const carrousel = useRef<HTMLDivElement>(null);

  const aztec = carte?.code ?? null;
  const numero = carte?.numero && ean13Valide(carte.numero) ? carte.numero : null;
  const diapos = [
    ...(aztec ? [{ nom: 'Code Aztec', code: <CodeAztec texte={aztec} />, barres: false }] : []),
    ...(numero ? [{ nom: 'Code-barres', code: <CodeBarres numero={numero} />, barres: true }] : []),
  ];

  useEcranAllume(diapos.length > 0 && !modifier);

  useEffect(() => {
    lireCarteCumulus()
      .then(setCarte)
      .catch((e: Error) => {
        // Hors ligne : la copie locale suffit pour afficher la carte.
        if (carteLocale() === null) setErreur(e.message);
      })
      .finally(() => setChargement(false));
  }, []);

  const allerA = (i: number) => {
    const el = carrousel.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="ecran ecran-carte">
      <h1>Carte Cumulus</h1>

      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      {diapos.length > 0 && !modifier ? (
        <>
          <div
            ref={carrousel}
            className="carrousel"
            onScroll={(e) => {
              const el = e.currentTarget;
              setDiapo(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
          >
            {diapos.map((d) => (
              <div key={d.nom} className="diapo" aria-label={d.nom}>
                <div className={`carte-code ${d.barres ? 'carte-code-barres' : ''}`}>
                  {d.code}
                  <p className="carte-code-legende">Cumulus</p>
                </div>
              </div>
            ))}
          </div>
          {diapos.length > 1 ? (
            <div className="points-carrousel" role="tablist" aria-label="Format du code">
              {diapos.map((d, i) => (
                <button key={d.nom} type="button" role="tab" aria-selected={diapo === i} className={diapo === i ? 'actif' : ''} onClick={() => allerA(i)}>
                  {d.nom}
                </button>
              ))}
            </div>
          ) : null}
          <p className="discret centre aide-carte">
            {diapos.length > 1 ? 'Balayez pour changer de format. ' : ''}Montez la luminosité si la caisse ne lit pas le code.
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
  const [code, setCode] = useState(carte?.code ?? '');
  const [numero, setNumero] = useState(carte?.numero ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const numeroPropre = numero.replace(/\s/g, '');

  const enregistrer = async () => {
    if (numeroPropre && !ean13Valide(numeroPropre)) {
      setErreur('Le numéro de carte doit compter 13 chiffres (par exemple 2099…), sans erreur de frappe.');
      return;
    }
    const nouvelle = { code: code.trim() || null, numero: numeroPropre || null };
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
        <span className="champ-etiquette">Code Google Wallet (texte partagé depuis la carte Cumulus de Wallet)</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <label className="champ champ-large">
        <span className="champ-etiquette">Numéro de carte (13 chiffres, partagé depuis l’app Migros)</span>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" autoComplete="off" />
      </label>
      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <button type="button" className="bouton-principal" disabled={!code.trim() && !numeroPropre} onClick={() => void enregistrer()}>
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
