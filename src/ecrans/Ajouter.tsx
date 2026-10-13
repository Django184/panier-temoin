// Ajout d'un ticket. Voie principale : le bouton « Photographier le
// ticket » ouvre le projet Claude de l'utilisateur ; Claude lit la photo
// et répond par un lien qui rouvre l'app sur l'écran de vérification
// (voir lecture/claude.ts). Secours : coller la réponse de Claude, ou
// saisir le ticket à la main. Le ticket en cours est gardé en brouillon.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TicketBrouillon } from '../lib/types.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { ErreurImport, lireReponseClaude } from '../lib/importClaude.ts';
import { consulterRetour, effacerRetour, lirePressePapiersSiAutorise, lireProjet, prendreRetour } from '../lecture/claude.ts';
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon } from '../stockageLocal.ts';
import { Validation } from './Validation.tsx';
import { ConfigurationClaude } from '../composants/ConfigurationClaude.tsx';
import type { ResultatEnvoi } from '../api.ts';
import { dateSuisse } from '../composants/Champs.tsx';
import { lien } from '../routeur.ts';

type Etape =
  | { nom: 'depart' }
  | { nom: 'configuration' }
  | { nom: 'coller'; texte: string; erreur: string | null }
  | { nom: 'validation' }
  | { nom: 'envoye'; resultat: ResultatEnvoi };

function brouillonVide(): TicketBrouillon {
  return {
    magasin: { numeroFiliale: '', nom: '', format: '', localite: '', canton: '' },
    date: new Date().toISOString().slice(0, 10),
    heure: '',
    totalCentimes: null,
    rabaisTotalCentimes: 0,
    lignes: [ligneVide()],
    douteux: [],
    methode: 'saisie_manuelle',
  };
}

/** État de départ : ticket arrivé par un lien de Claude, ou écran d'accueil. */
function etatInitial(): { etape: Etape; brouillon: TicketBrouillon | null; erreurLien: string | null } {
  const retour = consulterRetour(); // effacé une fois l'écran affiché
  if (retour && 'ouvrir' in retour) {
    const brouillon = lireBrouillon();
    if (brouillon) return { etape: { nom: 'validation' }, brouillon, erreurLien: null };
  }
  return { etape: { nom: 'depart' }, brouillon: null, erreurLien: retour && 'erreur' in retour ? retour.erreur : null };
}

const IconePhoto = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-photo">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export function Ajouter() {
  const [initial] = useState(etatInitial);
  const [etape, setEtape] = useState<Etape>(initial.etape);
  const [brouillon, setBrouillon] = useState<TicketBrouillon | null>(initial.brouillon);
  const [erreurLien, setErreurLien] = useState<string | null>(initial.erreurLien);
  const [enAttente, setEnAttente] = useState<TicketBrouillon | null>(() => (initial.brouillon ? null : lireBrouillon()));
  const [projet, setProjet] = useState<string | null>(lireProjet);
  const [chezClaude, setChezClaude] = useState(false);
  const etapeCourante = useRef(etape.nom);
  etapeCourante.current = etape.nom;

  useEffect(effacerRetour, []);

  useEffect(() => {
    if (brouillon && etape.nom === 'validation') enregistrerBrouillon(brouillon);
  }, [brouillon, etape.nom]);

  const modifier = (maj: (b: TicketBrouillon) => TicketBrouillon) => {
    setBrouillon((b) => (b ? maj(b) : b));
  };

  const ouvrir = (b: TicketBrouillon) => {
    setBrouillon(b.lignes.length > 0 ? b : { ...b, lignes: [ligneVide()] });
    setErreurLien(null);
    setEtape({ nom: 'validation' });
  };

  /** Réponse de Claude (lien, bloc de code ou message entier) → vérification. */
  const lireTexte = (texte: string): boolean => {
    try {
      ouvrir(lireReponseClaude(texte));
      return true;
    } catch (e) {
      setEtape({ nom: 'coller', texte, erreur: e instanceof ErreurImport ? e.message : 'Réponse illisible.' });
      return false;
    }
  };

  const coller = async () => {
    try {
      const texte = await navigator.clipboard.readText();
      if (texte.trim() === '') throw new Error('vide');
      lireTexte(texte);
    } catch {
      // Presse-papiers vide ou refusé : champ de collage manuel.
      setEtape({ nom: 'coller', texte: '', erreur: null });
    }
  };

  // Lien de Claude reçu alors que cet écran est déjà affiché.
  const verifierRetour = useCallback(() => {
    const retour = prendreRetour();
    if (!retour) return;
    if ('ouvrir' in retour) {
      const b = lireBrouillon();
      if (b) ouvrir(b);
    } else {
      setErreurLien(retour.erreur);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', verifierRetour);
    return () => window.removeEventListener('hashchange', verifierRetour);
  }, [verifierRetour]);

  // Retour dans l'app après Claude : si le navigateur l'autorise, la
  // réponse copiée est reprise sans rien toucher.
  useEffect(() => {
    if (!chezClaude) return;
    const auRetour = async () => {
      if (document.visibilityState !== 'visible' || etapeCourante.current !== 'depart') return;
      const texte = await lirePressePapiersSiAutorise();
      if (!texte || !texte.includes('{')) return;
      try {
        ouvrir(lireReponseClaude(texte));
        setChezClaude(false);
      } catch {
        // Le presse-papiers contient autre chose : on attend « Coller ».
      }
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [chezClaude]);

  const recommencer = () => {
    effacerBrouillon();
    setEnAttente(null);
    setBrouillon(null);
    setChezClaude(false);
    setEtape({ nom: 'depart' });
  };

  const saisirAlaMain = () => {
    setBrouillon(brouillonVide());
    setEtape({ nom: 'validation' });
  };

  // -------------------------------------------------------------------
  if (etape.nom === 'validation' && brouillon) {
    return (
      <Validation
        brouillon={brouillon}
        onChange={modifier}
        onEnvoye={(resultat) => {
          if (resultat.statut === 'ok') effacerBrouillon();
          setEtape({ nom: 'envoye', resultat });
        }}
        onAbandon={() => {
          if (window.confirm('Abandonner ce ticket ? Les corrections seront perdues.')) recommencer();
        }}
      />
    );
  }

  if (etape.nom === 'configuration') {
    return (
      <div className="ecran">
        <header className="entete-ecran">
          <h1>Projet Claude</h1>
          <p className="discret">À faire une seule fois. Claude lira ensuite chaque photo de ticket selon ces instructions.</p>
        </header>
        <ConfigurationClaude
          onTermine={() => {
            setProjet(lireProjet());
            setEtape({ nom: 'depart' });
          }}
        />
        <button type="button" className="bouton-secondaire" onClick={() => setEtape({ nom: 'depart' })}>
          Retour
        </button>
      </div>
    );
  }

  if (etape.nom === 'coller') {
    return (
      <div className="ecran">
        <header className="entete-ecran">
          <h1>Coller la réponse de Claude</h1>
          <p className="discret">Dans Claude, touchez l’icône de copie du bloc de code, puis collez ici.</p>
        </header>
        <label className="champ champ-large">
          <span className="champ-etiquette">Réponse de Claude</span>
          <textarea
            rows={8}
            value={etape.texte}
            onChange={(e) => setEtape({ nom: 'coller', texte: e.target.value, erreur: null })}
          />
        </label>
        {etape.erreur ? (
          <p className="erreur" role="alert">
            {etape.erreur}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="bouton-secondaire" onClick={() => setEtape({ nom: 'depart' })}>
            Retour
          </button>
          <button
            type="button"
            className="bouton-principal"
            disabled={etape.texte.trim() === ''}
            onClick={() => lireTexte(etape.texte)}
          >
            Vérifier ce ticket
          </button>
        </div>
      </div>
    );
  }

  if (etape.nom === 'envoye') {
    const r = etape.resultat;
    return (
      <div className="ecran ecran-fin">
        {r.statut === 'ok' ? (
          <>
            <p className="marque-fin" aria-hidden="true">
              ✓
            </p>
            <h1>Ticket enregistré</h1>
            <p>
              {r.nbLignes} prix ajouté{r.nbLignes > 1 ? 's' : ''} à la base. Merci !
            </p>
            {r.lignesAVerifier.length > 0 ? (
              <p className="alerte-prix">
                {r.lignesAVerifier.length === 1 ? 'Un prix inhabituel est mis' : `${r.lignesAVerifier.length} prix inhabituels sont mis`} de
                côté en attendant votre confirmation, dans <a href={lien('profil')}>Profil</a>.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h1>Déjà enregistré</h1>
            <p>Ce ticket (même magasin, date, heure et total) est déjà dans la base. Rien n’a été ajouté.</p>
          </>
        )}
        <div className="actions actions-colonne">
          <button
            type="button"
            className="bouton-principal"
            onClick={() => {
              effacerBrouillon();
              recommencer();
            }}
          >
            Ajouter un autre ticket
          </button>
          <a className="bouton-secondaire" href={lien('')}>
            Retour à l’accueil
          </a>
        </div>
      </div>
    );
  }

  // Départ ---------------------------------------------------------------
  return (
    <div className="ecran">
      <header className="entete-ecran">
        <h1>Nouveau ticket</h1>
        <p className="discret">Claude lit la photo du ticket, puis vous vérifiez chaque ligne avant l’envoi.</p>
      </header>

      {erreurLien ? (
        <p className="erreur" role="alert">
          {erreurLien}
        </p>
      ) : null}

      {enAttente && !brouillon ? (
        <div className="carte-reprise">
          <p>
            Un ticket attend votre vérification
            {enAttente.date ? ` (${dateSuisse(enAttente.date)}, ${enAttente.lignes.length} lignes)` : ''}.
          </p>
          <div className="actions">
            <button type="button" className="bouton-principal" onClick={() => ouvrir(enAttente)}>
              Reprendre
            </button>
            <button type="button" className="bouton-lien" onClick={recommencer}>
              L’abandonner
            </button>
          </div>
        </div>
      ) : null}

      {projet ? (
        <>
          <div className="zone-photo">
            <a
              className="bouton-photo"
              href={projet}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setErreurLien(null);
                setChezClaude(true);
              }}
            >
              <IconePhoto />
              <span>Photographier le ticket</span>
              <span className="bouton-photo-detail">dans Claude</span>
            </a>
            <button
              type="button"
              className={chezClaude ? 'bouton-principal bouton-large' : 'bouton-secondaire bouton-large'}
              onClick={() => void coller()}
            >
              Coller la réponse de Claude
            </button>
          </div>

          <ol className="etapes etapes-numerotees">
            <li>Dans le projet Claude, touchez « + », puis l’appareil photo, et envoyez la photo du ticket.</li>
            <li>
              Dans la réponse, touchez <strong>Ouvrir dans Panier Témoin</strong> : le ticket s’ouvre ici, prêt à vérifier.
            </li>
            <li>Si le lien ne s’ouvre pas, copiez le bloc de code de la réponse et touchez « Coller la réponse de Claude ».</li>
          </ol>

          <p className="discret">
            Ticket à plat, bien éclairé, cadré jusqu’à la dernière ligne « Filiale … Date Heure ». Repliez le bas du ticket pour ne
            pas montrer votre numéro Cumulus.
          </p>
        </>
      ) : (
        <div className="carte-reprise">
          <p>
            <strong>Une seule fois :</strong> créez le projet Claude qui lira vos tickets, avec les instructions fournies par
            l’app.
          </p>
          <button type="button" className="bouton-principal bouton-large" onClick={() => setEtape({ nom: 'configuration' })}>
            Configurer le projet Claude
          </button>
        </div>
      )}

      <section className="bloc autres-voies">
        <h2>Autres façons</h2>
        <div className="actions actions-colonne">
          <button type="button" className="bouton-secondaire" onClick={saisirAlaMain}>
            Saisir le ticket à la main
          </button>
          {projet ? (
            <button type="button" className="bouton-lien" onClick={() => setEtape({ nom: 'configuration' })}>
              Revoir le projet Claude et ses instructions
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
