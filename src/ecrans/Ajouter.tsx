// Ajout d'un ticket : le bouton « Photographier le ticket » ouvre le
// projet Claude de l'utilisateur ; Claude lit la photo et répond par un
// lien qui rouvre l'app sur l'écran de vérification (lecture/claude.ts).
// Le ticket en cours est gardé en brouillon.

import { useCallback, useEffect, useState } from 'react';
import type { TicketBrouillon } from '../lib/types.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { consulterRetour, effacerRetour, lireProjet, prendreRetour } from '../lecture/claude.ts';
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon } from '../stockageLocal.ts';
import { Validation } from './Validation.tsx';
import { ConfigurationClaude } from '../composants/ConfigurationClaude.tsx';
import { Aide } from '../composants/Aide.tsx';
import { IconePhoto } from '../composants/Icones.tsx';
import { marquerAideVue } from '../donnees/local.ts';
import type { ResultatEnvoi } from '../api.ts';
import { dateSuisse } from '../composants/Champs.tsx';
import { lien } from '../routeur.ts';

type Etape = { nom: 'depart' } | { nom: 'validation' } | { nom: 'envoye'; resultat: ResultatEnvoi };

/** État de départ : ticket arrivé par un lien de Claude, ou écran d'accueil. */
function etatInitial(): { etape: Etape; brouillon: TicketBrouillon | null; erreurLien: string | null } {
  const retour = consulterRetour(); // effacé une fois l'écran affiché
  if (retour && 'ouvrir' in retour) {
    const brouillon = lireBrouillon();
    if (brouillon) return { etape: { nom: 'validation' }, brouillon, erreurLien: null };
  }
  return { etape: { nom: 'depart' }, brouillon: null, erreurLien: retour && 'erreur' in retour ? retour.erreur : null };
}

export function Ajouter() {
  const [initial] = useState(etatInitial);
  const [etape, setEtape] = useState<Etape>(initial.etape);
  const [brouillon, setBrouillon] = useState<TicketBrouillon | null>(initial.brouillon);
  const [erreurLien, setErreurLien] = useState<string | null>(initial.erreurLien);
  const [enAttente, setEnAttente] = useState<TicketBrouillon | null>(() => (initial.brouillon ? null : lireBrouillon()));
  const [projet, setProjet] = useState<string | null>(lireProjet);
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

  const recommencer = () => {
    effacerBrouillon();
    setEnAttente(null);
    setBrouillon(null);
    setEtape({ nom: 'depart' });
  };

  // -------------------------------------------------------------------
  if (etape.nom === 'validation' && brouillon) {
    return (
      <Validation
        brouillon={brouillon}
        onChange={modifier}
        onEnvoye={(resultat) => {
          if (resultat.statut === 'ok') {
            effacerBrouillon();
            marquerAideVue('ajouter');
          }
          setEtape({ nom: 'envoye', resultat });
        }}
        onAbandon={() => {
          if (window.confirm('Abandonner ce ticket ? Les corrections seront perdues.')) recommencer();
        }}
      />
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
                côté en attendant votre confirmation, dans <a href={lien('reglages')}>Réglages</a>.
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
          <a className="bouton-secondaire" href={lien('explorer')}>
            Voir les prix
          </a>
        </div>
      </div>
    );
  }

  // Départ ---------------------------------------------------------------
  return (
    <div className="ecran ecran-ajouter">
      <h1>Nouveau ticket</h1>

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
          <a className="bouton-photo" href={projet} target="_blank" rel="noopener noreferrer" onClick={() => setErreurLien(null)}>
            <IconePhoto className="icone-photo" />
            <span>Photographier le ticket</span>
            <span className="bouton-photo-detail">dans Claude</span>
          </a>
          <Aide cle="ajouter" titre="Comment ça marche">
            <ol className="etapes etapes-numerotees">
              <li>Dans le projet Claude, touchez « + », puis l’appareil photo, et envoyez la photo du ticket.</li>
              <li>
                Dans la réponse, touchez <strong>Ouvrir dans Panier Témoin</strong> : le ticket s’ouvre ici, prêt à vérifier.
              </li>
              <li>Ticket à plat, cadré jusqu’à la ligne « Filiale … Date Heure ». Repliez le bas pour cacher le numéro Cumulus.</li>
            </ol>
          </Aide>
        </>
      ) : (
        <section className="carte-config">
          <h2>Relier le projet Claude</h2>
          <p className="discret">Une seule fois : Claude lira ensuite chaque photo de ticket selon ces instructions.</p>
          <ConfigurationClaude onTermine={() => setProjet(lireProjet())} />
        </section>
      )}
    </div>
  );
}
