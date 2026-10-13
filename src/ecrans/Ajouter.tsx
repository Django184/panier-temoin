// Ajout d'un ticket : photo ou capture → lecture dans le téléphone →
// validation → envoi. Voies de secours : import depuis l'app Claude,
// saisie à la main. Le ticket en cours est gardé en brouillon local.

import { useEffect, useRef, useState } from 'react';
import type { TicketBrouillon } from '../lib/types.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { CONSIGNE_CLAUDE, ErreurImport, lireReponseClaude } from '../lib/importClaude.ts';
import { lirePhoto, type Progression } from '../ocr/lecture.ts';
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon } from '../stockageLocal.ts';
import { Validation } from './Validation.tsx';
import type { ResultatEnvoi } from '../api.ts';
import { dateSuisse } from '../composants/Champs.tsx';
import { lien } from '../routeur.ts';

type Etape =
  | { nom: 'depart' }
  | { nom: 'lecture'; progression: Progression }
  | { nom: 'import' }
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

export function Ajouter() {
  const [etape, setEtape] = useState<Etape>({ nom: 'depart' });
  const [brouillon, setBrouillon] = useState<TicketBrouillon | null>(null);
  const [enAttente] = useState<TicketBrouillon | null>(lireBrouillon);
  const [erreur, setErreur] = useState<string | null>(null);
  const photo = useRef<{ fichier: Blob; rotation: 0 | 90 | 180 | 270 } | null>(null);

  useEffect(() => {
    if (brouillon && etape.nom === 'validation') enregistrerBrouillon(brouillon);
  }, [brouillon, etape.nom]);

  const modifier = (maj: (b: TicketBrouillon) => TicketBrouillon) => {
    setBrouillon((b) => (b ? maj(b) : b));
  };

  const lire = async (fichier: Blob, rotation?: 0 | 90 | 180 | 270) => {
    setErreur(null);
    setEtape({ nom: 'lecture', progression: { etape: 'Préparation de l’image', part: null } });
    try {
      const resultat = await lirePhoto(
        fichier,
        (progression) => setEtape({ nom: 'lecture', progression }),
        rotation,
      );
      photo.current = { fichier, rotation: resultat.rotation };
      setBrouillon(resultat.brouillon.lignes.length > 0 ? resultat.brouillon : { ...resultat.brouillon, lignes: [ligneVide()] });
      setEtape({ nom: 'validation' });
    } catch (e) {
      setErreur(
        `La lecture a échoué : ${e instanceof Error ? e.message : String(e)}. ` +
          'Essayez une autre photo, l’import depuis Claude ou la saisie à la main.',
      );
      setEtape({ nom: 'depart' });
    }
  };

  const relire = () => {
    if (!photo.current) return;
    const suivante = ((photo.current.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    void lire(photo.current.fichier, suivante);
  };

  const terminer = (resultat: ResultatEnvoi) => {
    if (resultat.statut === 'ok') effacerBrouillon();
    setEtape({ nom: 'envoye', resultat });
  };

  const abandonner = () => {
    effacerBrouillon();
    setBrouillon(null);
    photo.current = null;
    setEtape({ nom: 'depart' });
  };

  // -------------------------------------------------------------------
  if (etape.nom === 'lecture') {
    const part = etape.progression.part;
    return (
      <div className="ecran">
        <h1>Lecture du ticket</h1>
        <p>{etape.progression.etape}…</p>
        <progress max={1} value={part ?? undefined} aria-label="Avancement de la lecture" />
        <p className="discret">
          La lecture se fait dans votre téléphone ; la photo n’est envoyée nulle part. La première fois, le moteur de
          lecture (quelques Mo) est téléchargé puis gardé pour les fois suivantes.
        </p>
      </div>
    );
  }

  if (etape.nom === 'validation' && brouillon) {
    return (
      <Validation
        brouillon={brouillon}
        onChange={modifier}
        onEnvoye={terminer}
        onAbandon={abandonner}
        onRelire={photo.current ? relire : undefined}
      />
    );
  }

  if (etape.nom === 'import') {
    return (
      <ImportClaude
        onLu={(b) => {
          photo.current = null;
          setBrouillon(b);
          setEtape({ nom: 'validation' });
        }}
        onRetour={() => setEtape({ nom: 'depart' })}
      />
    );
  }

  if (etape.nom === 'envoye') {
    const r = etape.resultat;
    return (
      <div className="ecran">
        {r.statut === 'ok' ? (
          <>
            <h1>Ticket enregistré</h1>
            <p>
              {r.nbLignes} ligne{r.nbLignes > 1 ? 's' : ''} ajoutée{r.nbLignes > 1 ? 's' : ''} à la base commune. Merci !
            </p>
            {r.lignesAVerifier.length > 0 ? (
              <p className="alerte-prix">
                {r.lignesAVerifier.length === 1 ? 'Un prix inhabituel est' : `${r.lignesAVerifier.length} prix inhabituels sont`}{' '}
                mis de côté en attendant votre confirmation, dans <a href={lien('profil')}>Profil</a>.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h1>Ticket déjà enregistré</h1>
            <p>Ce ticket (même magasin, date, heure et total) est déjà dans la base. Rien n’a été ajouté.</p>
          </>
        )}
        <div className="actions">
          <button
            type="button"
            className="bouton-principal"
            onClick={() => {
              if (r.statut === 'doublon') effacerBrouillon();
              setBrouillon(null);
              photo.current = null;
              setEtape({ nom: 'depart' });
            }}
          >
            Ajouter un autre ticket
          </button>
        </div>
      </div>
    );
  }

  // Départ ---------------------------------------------------------------
  return (
    <div className="ecran">
      <h1>Ajouter un ticket</h1>

      {enAttente && !brouillon ? (
        <div className="bloc bloc-reprise">
          <p>
            Un ticket est en cours de vérification
            {enAttente.date ? ` (${dateSuisse(enAttente.date)}, ${enAttente.lignes.length} lignes)` : ''}.
          </p>
          <div className="actions">
            <button type="button" className="bouton-secondaire" onClick={abandonner}>
              L’abandonner
            </button>
            <button
              type="button"
              className="bouton-principal"
              onClick={() => {
                setBrouillon(enAttente);
                setEtape({ nom: 'validation' });
              }}
            >
              Le reprendre
            </button>
          </div>
        </div>
      ) : null}

      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      <div className="choix-capture">
        <label className="bouton-principal bouton-grand">
          Photographier le ticket
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="invisible"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              e.target.value = '';
              if (fichier) void lire(fichier);
            }}
          />
        </label>
        <label className="bouton-secondaire bouton-grand">
          Importer une photo ou une capture
          <input
            type="file"
            accept="image/*"
            className="invisible"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              e.target.value = '';
              if (fichier) void lire(fichier);
            }}
          />
        </label>
      </div>

      <section className="bloc">
        <h2>Pour une bonne lecture</h2>
        <ul className="conseils">
          <li>Posez le ticket à plat sur un fond sombre, bien éclairé, sans ombre.</li>
          <li>Cadrez le ticket entier, bords compris, jusqu’à la dernière ligne « Filiale … Date Heure ».</li>
          <li>Repliez le bas du ticket si vous ne voulez pas photographier votre numéro Cumulus : il n’est jamais lu.</li>
        </ul>
      </section>

      <section className="bloc">
        <h2>Autres façons</h2>
        <div className="actions actions-colonne">
          <button type="button" className="bouton-secondaire" onClick={() => setEtape({ nom: 'import' })}>
            Faire lire le ticket par l’app Claude
          </button>
          <button
            type="button"
            className="bouton-secondaire"
            onClick={() => {
              photo.current = null;
              setBrouillon(brouillonVide());
              setEtape({ nom: 'validation' });
            }}
          >
            Saisir le ticket à la main
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Import depuis l'app Claude
// ---------------------------------------------------------------------

function ImportClaude({ onLu, onRetour }: { onLu: (b: TicketBrouillon) => void; onRetour: () => void }) {
  const [reponse, setReponse] = useState('');
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(CONSIGNE_CLAUDE);
      setCopie(true);
    } catch {
      setErreur('Copie impossible : sélectionnez la consigne ci-dessous et copiez-la à la main.');
    }
  };

  const lireReponse = () => {
    setErreur(null);
    try {
      onLu(lireReponseClaude(reponse));
    } catch (e) {
      setErreur(e instanceof ErreurImport ? e.message : 'Réponse illisible.');
    }
  };

  return (
    <div className="ecran">
      <h1>Faire lire le ticket par Claude</h1>
      <p className="discret">
        Utile quand la lecture dans le téléphone peine. La photo est alors envoyée à Claude par votre compte : repliez le bas
        du ticket (Cumulus, paiement) avant de la prendre.
      </p>
      <ol className="etapes">
        <li>
          <button type="button" className="bouton-secondaire" onClick={copier}>
            {copie ? 'Consigne copiée' : 'Copier la consigne'}
          </button>
        </li>
        <li>Ouvrez l’app Claude, joignez la photo du ticket, collez la consigne et envoyez.</li>
        <li>Copiez la réponse de Claude et collez-la ici :</li>
      </ol>
      <label className="champ champ-large">
        <span className="champ-etiquette">Réponse de Claude</span>
        <textarea rows={8} value={reponse} onChange={(e) => setReponse(e.target.value)} />
      </label>
      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}
      <details>
        <summary>Voir la consigne</summary>
        <pre className="consigne">{CONSIGNE_CLAUDE}</pre>
      </details>
      <div className="actions">
        <button type="button" className="bouton-secondaire" onClick={onRetour}>
          Retour
        </button>
        <button type="button" className="bouton-principal" disabled={reponse.trim() === ''} onClick={lireReponse}>
          Vérifier ce ticket
        </button>
      </div>
    </div>
  );
}
