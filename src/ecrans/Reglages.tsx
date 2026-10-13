// Réglages : compte, projets Claude (tickets et Chef Feta), aides, prix
// mis de côté, tickets envoyés, installation et confidentialité.

import { useEffect, useState, type ReactNode } from 'react';
import {
  confirmerObservation,
  deconnecter,
  lignesAVerifier,
  mesTickets,
  supprimerTicket,
  type LigneAVerifier,
  type MonTicket,
} from '../api.ts';
import { useSession } from '../session.tsx';
import { enFrancs } from '../lib/montants.ts';
import { dateSuisse } from '../composants/Champs.tsx';
import { MENTION_NON_AFFILIATION } from '../config.ts';
import { ConfigurationClaude } from '../composants/ConfigurationClaude.tsx';
import { ConfigurationChefFeta } from '../composants/ConfigurationChefFeta.tsx';
import { Connexion } from './Connexion.tsx';
import { lireProjet } from '../lecture/claude.ts';
import { preferences } from '../donnees/local.ts';

/** Section repliable avec un état résumé à droite du titre. */
function Repli({ titre, etat, ouvert = false, children }: { titre: string; etat?: ReactNode; ouvert?: boolean; children: ReactNode }) {
  return (
    <details className="repli" open={ouvert}>
      <summary>
        <span>{titre}</span>
        {etat ? <span className="repli-etat">{etat}</span> : null}
      </summary>
      <div className="repli-contenu">{children}</div>
    </details>
  );
}

export function Reglages() {
  const { session } = useSession();
  const prefs = preferences.utiliser();
  const [tickets, setTickets] = useState<MonTicket[] | null>(null);
  const [aVerifier, setAVerifier] = useState<LigneAVerifier[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toutVoir, setToutVoir] = useState(false);
  const [projetTickets] = useState(() => lireProjet('tickets'));
  const [projetRecettes] = useState(() => lireProjet('recettes'));

  const recharger = () => {
    if (!session) return;
    mesTickets().then(setTickets).catch((e: Error) => setErreur(e.message));
    lignesAVerifier().then(setAVerifier).catch((e: Error) => setErreur(e.message));
  };

  useEffect(recharger, [session]);

  const ticketsAffiches = toutVoir ? tickets : tickets?.slice(0, 5);

  return (
    <div className="ecran ecran-reglages">
      <h1>Réglages</h1>
      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      {session ? null : <Connexion integre raison="Pour ajouter des tickets et afficher la carte Cumulus du foyer." />}

      {aVerifier.length > 0 ? (
        <section className="bloc alerte-bloc">
          <h2>Prix à confirmer</h2>
          <p className="discret">
            Ces prix s’écartent nettement des relevés récents et sont exclus des statistiques. Confirmez-les s’ils sont justes ;
            sinon, supprimez le ticket et envoyez-le à nouveau.
          </p>
          <ul className="liste-simple">
            {aVerifier.map((l) => (
              <li key={l.id} className="ligne-a-verifier">
                <span>
                  {l.libelle_brut}, le {dateSuisse(l.date_achat)} :{' '}
                  <span className="chiffre">{enFrancs(l.prix_normal_centimes)}</span>
                  {l.unite === 'kg' ? '/kg' : ''}
                  {l.mediane_reference_centimes !== null ? (
                    <span className="discret"> (habituellement {enFrancs(l.mediane_reference_centimes)})</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="bouton-secondaire"
                  onClick={() => confirmerObservation(l.id).then(recharger).catch((e: Error) => setErreur(e.message))}
                >
                  Confirmer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="groupe-reglages">
        <label className="reglage-interrupteur">
          <span>
            <strong>Aides</strong>
            <span className="discret">Explications affichées sur les écrans</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs.aides}
            onChange={(e) => {
              const actives = e.target.checked;
              // Réactiver les aides les montre toutes à nouveau.
              preferences.modifier(() => ({ aides: actives, aidesVues: [] }));
            }}
          />
        </label>
        <Repli titre="Projet Claude des tickets" etat={projetTickets ? 'Relié ✓' : 'À relier'}>
          <ConfigurationClaude />
        </Repli>
        <Repli titre="Projet Chef Feta" etat={projetRecettes ? 'Relié ✓' : 'À relier'}>
          <ConfigurationChefFeta />
        </Repli>
      </div>

      {session ? (
        <section className="bloc">
          <h2>Mes tickets</h2>
          {tickets === null ? (
            <p className="discret">Chargement…</p>
          ) : tickets.length === 0 ? (
            <p className="vide">Aucun ticket envoyé pour l’instant.</p>
          ) : (
            <>
              <ul className="liste-simple">
                {ticketsAffiches?.map((t) => (
                  <li key={t.id} className="ticket-resume">
                    <span>
                      {dateSuisse(t.date_achat)} à {t.heure_ticket.slice(0, 5)}, {t.magasin}
                    </span>
                    <span className="chiffre">{enFrancs(t.total_centimes)}</span>
                    <button
                      type="button"
                      className="bouton-lien bouton-danger"
                      onClick={async () => {
                        if (!window.confirm('Supprimer ce ticket et ses prix ?')) return;
                        try {
                          await supprimerTicket(t.id);
                          recharger();
                        } catch (e) {
                          setErreur(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
              {tickets.length > 5 && !toutVoir ? (
                <button type="button" className="bouton-lien" onClick={() => setToutVoir(true)}>
                  Voir les {tickets.length} tickets
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="groupe-reglages">
        <Installer />
        <Repli titre="Confidentialité">
          <ul className="conseils">
            <li>
              La photo du ticket est lue par Claude, dans votre propre compte Claude ; elle n’est jamais envoyée à Panier Témoin.
              Repliez le bas du ticket pour ne pas y montrer votre numéro Cumulus.
            </li>
            <li>
              Seuls le magasin, la date, l’heure, les totaux et les lignes d’articles sont enregistrés. La carte Cumulus du foyer
              n’est visible que par les comptes connectés et n’est jamais liée aux tickets.
            </li>
            <li>
              Les données sont hébergées en Suisse (Supabase, région Zurich). Liste de courses et recettes sont partagées
              entre les comptes du foyer, avec une copie sur chaque téléphone pour les courses sans réseau. Les statistiques
              publiques ne montrent aucun contributeur.
            </li>
          </ul>
        </Repli>
      </div>

      {session ? (
        <div className="compte">
          <span className="discret">Connecté avec {session.user.email}</span>
          <button type="button" className="bouton-lien" onClick={() => void deconnecter()}>
            Se déconnecter
          </button>
        </div>
      ) : null}

      <p className="discret mention">{MENTION_NON_AFFILIATION}</p>
    </div>
  );
}

/** Explique comment installer l'app sur l'écran d'accueil. */
function Installer() {
  const installee = window.matchMedia('(display-mode: standalone)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (installee) return null;

  return (
    <Repli titre="Installer l’app" etat="Conseillé">
      {ios ? (
        <ol className="etapes">
          <li>Dans Safari, touchez le bouton Partager.</li>
          <li>Choisissez « Sur l’écran d’accueil ».</li>
          <li>Laissez « Ouvrir comme app web » activé, puis touchez « Ajouter ».</li>
        </ol>
      ) : (
        <ol className="etapes">
          <li>Dans Chrome, ouvrez le menu ⋮.</li>
          <li>Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».</li>
        </ol>
      )}
      <p className="discret">Installée, l’app s’ouvre en plein écran et la carte et la liste restent utilisables sans réseau.</p>
    </Repli>
  );
}
