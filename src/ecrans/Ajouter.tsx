// Ajout d'un ticket. Voie principale : photo → lecture automatique
// (fonction « lire-ticket », modèle d'image Mistral) → vérification →
// envoi. Voies de secours : app Claude (copier-coller), saisie à la main.
// Le ticket en cours est gardé en brouillon local.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TicketBrouillon } from '../lib/types.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { CONSIGNE_CLAUDE, ErreurImport, lireReponseClaude } from '../lib/importClaude.ts';
import { lirePhotoParIA, preparerPhoto } from '../lecture/analyse.ts';
import { effacerBrouillon, enregistrerBrouillon, lireBrouillon } from '../stockageLocal.ts';
import { Validation } from './Validation.tsx';
import type { ResultatEnvoi } from '../api.ts';
import { dateSuisse } from '../composants/Champs.tsx';
import { lien } from '../routeur.ts';

type Etape =
  | { nom: 'depart' }
  | { nom: 'lecture'; texte: string }
  | { nom: 'echec'; message: string }
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

/** Bouton qui ouvre l'appareil photo ou la photothèque. */
function BoutonPhoto({
  libelle,
  classe,
  camera,
  onFichier,
  children,
}: {
  libelle: string;
  classe: string;
  camera: boolean;
  onFichier: (f: File) => void;
  children?: ReactNode;
}) {
  return (
    <label className={classe}>
      {children}
      <span>{libelle}</span>
      <input
        type="file"
        accept="image/*"
        capture={camera ? 'environment' : undefined}
        className="invisible"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          e.target.value = '';
          if (fichier) onFichier(fichier);
        }}
      />
    </label>
  );
}

export function Ajouter() {
  const [etape, setEtape] = useState<Etape>({ nom: 'depart' });
  const [brouillon, setBrouillon] = useState<TicketBrouillon | null>(null);
  const [enAttente] = useState<TicketBrouillon | null>(lireBrouillon);
  const [apercu, setApercu] = useState<string | null>(null);
  const derniereLecture = useRef(0);
  const photoPreparee = useRef<string | null>(null);

  useEffect(() => {
    if (brouillon && etape.nom === 'validation') enregistrerBrouillon(brouillon);
  }, [brouillon, etape.nom]);

  const modifier = (maj: (b: TicketBrouillon) => TicketBrouillon) => {
    setBrouillon((b) => (b ? maj(b) : b));
  };

  const lire = async (base64: string) => {
    const numero = ++derniereLecture.current;
    setEtape({ nom: 'lecture', texte: 'Lecture du ticket' });
    try {
      const lu = await lirePhotoParIA(base64);
      if (numero !== derniereLecture.current) return; // lecture annulée entre-temps
      setBrouillon(lu.lignes.length > 0 ? lu : { ...lu, lignes: [ligneVide()] });
      setEtape({ nom: 'validation' });
    } catch (e) {
      if (numero !== derniereLecture.current) return;
      setEtape({ nom: 'echec', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const nouvellePhoto = async (fichier: File) => {
    setEtape({ nom: 'lecture', texte: 'Préparation de la photo' });
    try {
      const { base64, apercu: image } = await preparerPhoto(fichier);
      photoPreparee.current = base64;
      setApercu(image);
      await lire(base64);
    } catch (e) {
      setEtape({ nom: 'echec', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const recommencer = () => {
    derniereLecture.current += 1;
    effacerBrouillon();
    setBrouillon(null);
    setApercu(null);
    photoPreparee.current = null;
    setEtape({ nom: 'depart' });
  };

  const saisirAlaMain = () => {
    setBrouillon(brouillonVide());
    setEtape({ nom: 'validation' });
  };

  // -------------------------------------------------------------------
  if (etape.nom === 'lecture') {
    return (
      <div className="ecran ecran-lecture">
        {apercu ? <img className="apercu-lecture" src={apercu} alt="Photo du ticket en cours de lecture" /> : null}
        <h1>{etape.texte}…</h1>
        <div className="barre-attente" role="progressbar" aria-label={etape.texte} />
        <p className="discret">Comptez une dizaine de secondes. Vous vérifierez chaque ligne avant l’envoi.</p>
        <button type="button" className="bouton-secondaire" onClick={recommencer}>
          Annuler
        </button>
      </div>
    );
  }

  if (etape.nom === 'echec') {
    return (
      <div className="ecran">
        <h1>La lecture n’a pas abouti</h1>
        <p className="erreur" role="alert">
          {etape.message}
        </p>
        <div className="actions actions-colonne">
          {photoPreparee.current ? (
            <button type="button" className="bouton-principal" onClick={() => void lire(photoPreparee.current as string)}>
              Réessayer avec la même photo
            </button>
          ) : null}
          <BoutonPhoto libelle="Prendre une autre photo" classe="bouton-secondaire" camera onFichier={(f) => void nouvellePhoto(f)} />
          <button type="button" className="bouton-secondaire" onClick={saisirAlaMain}>
            Saisir le ticket à la main
          </button>
          <button type="button" className="bouton-lien" onClick={() => setEtape({ nom: 'import' })}>
            Passer par l’app Claude
          </button>
        </div>
      </div>
    );
  }

  if (etape.nom === 'validation' && brouillon) {
    return (
      <Validation
        brouillon={brouillon}
        onChange={modifier}
        apercu={apercu}
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

  if (etape.nom === 'import') {
    return (
      <ImportClaude
        onLu={(b) => {
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
        <p className="discret">Photographiez le ticket : il est lu automatiquement, puis vous vérifiez avant l’envoi.</p>
      </header>

      {enAttente && !brouillon ? (
        <div className="carte-reprise">
          <p>
            Un ticket attend votre vérification
            {enAttente.date ? ` (${dateSuisse(enAttente.date)}, ${enAttente.lignes.length} lignes)` : ''}.
          </p>
          <div className="actions">
            <button
              type="button"
              className="bouton-principal"
              onClick={() => {
                setBrouillon(enAttente);
                setEtape({ nom: 'validation' });
              }}
            >
              Reprendre
            </button>
            <button type="button" className="bouton-lien" onClick={recommencer}>
              L’abandonner
            </button>
          </div>
        </div>
      ) : null}

      <div className="zone-photo">
        <BoutonPhoto libelle="Photographier le ticket" classe="bouton-photo" camera onFichier={(f) => void nouvellePhoto(f)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-photo">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </BoutonPhoto>
        <BoutonPhoto
          libelle="Choisir une photo ou une capture"
          classe="bouton-secondaire bouton-large"
          camera={false}
          onFichier={(f) => void nouvellePhoto(f)}
        />
      </div>

      <ul className="conseils">
        <li>Ticket à plat, bien éclairé, cadré en entier jusqu’à la dernière ligne « Filiale … Date Heure ».</li>
        <li>La photo est envoyée au service de lecture (Mistral, en Europe) puis oubliée. Repliez le bas du ticket si vous ne voulez pas y montrer votre numéro Cumulus.</li>
      </ul>

      <section className="bloc autres-voies">
        <h2>Autres façons</h2>
        <div className="actions actions-colonne">
          <button type="button" className="bouton-secondaire" onClick={saisirAlaMain}>
            Saisir le ticket à la main
          </button>
          <button type="button" className="bouton-secondaire" onClick={() => setEtape({ nom: 'import' })}>
            Faire lire le ticket par l’app Claude
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Voie de secours : app Claude
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
      setErreur('Copie impossible : ouvrez « Voir la consigne » et copiez-la à la main.');
    }
  };

  return (
    <div className="ecran">
      <header className="entete-ecran">
        <h1>Passer par l’app Claude</h1>
        <p className="discret">Utile si la lecture automatique n’est pas disponible.</p>
      </header>
      <ol className="etapes">
        <li>
          <button type="button" className="bouton-secondaire" onClick={copier}>
            {copie ? 'Consigne copiée' : 'Copier la consigne'}
          </button>
        </li>
        <li>Dans l’app Claude, joignez la photo du ticket, collez la consigne et envoyez.</li>
        <li>Copiez la réponse de Claude et collez-la ci-dessous.</li>
      </ol>
      <label className="champ champ-large">
        <span className="champ-etiquette">Réponse de Claude</span>
        <textarea rows={8} value={reponse} onChange={(e) => setReponse(e.target.value)} />
      </label>
      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <details>
        <summary>Voir la consigne</summary>
        <pre className="consigne">{CONSIGNE_CLAUDE}</pre>
      </details>
      <div className="actions">
        <button type="button" className="bouton-secondaire" onClick={onRetour}>
          Retour
        </button>
        <button
          type="button"
          className="bouton-principal"
          disabled={reponse.trim() === ''}
          onClick={() => {
            setErreur(null);
            try {
              onLu(lireReponseClaude(reponse));
            } catch (e) {
              setErreur(e instanceof ErreurImport ? e.message : 'Réponse illisible.');
            }
          }}
        >
          Vérifier ce ticket
        </button>
      </div>
    </div>
  );
}
