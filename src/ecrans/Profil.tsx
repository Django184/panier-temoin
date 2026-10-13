// Profil : prix mis de côté à confirmer, tickets envoyés, installation
// de l'app, confidentialité et déconnexion.

import { useEffect, useState } from 'react';
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

export function Profil() {
  const { session } = useSession();
  const [tickets, setTickets] = useState<MonTicket[] | null>(null);
  const [aVerifier, setAVerifier] = useState<LigneAVerifier[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = () => {
    mesTickets().then(setTickets).catch((e: Error) => setErreur(e.message));
    lignesAVerifier().then(setAVerifier).catch((e: Error) => setErreur(e.message));
  };

  useEffect(recharger, []);

  return (
    <div className="ecran">
      <h1>Profil</h1>
      <p className="discret">Connecté avec {session?.user.email}</p>
      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      {aVerifier.length > 0 ? (
        <section className="bloc">
          <h2>Prix à confirmer</h2>
          <p className="discret">
            Ces prix s’écartent nettement des relevés récents et sont exclus des statistiques. Confirmez-les s’ils sont justes ;
            sinon, supprimez le ticket et saisissez-le à nouveau.
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

      <section className="bloc">
        <h2>Mes tickets</h2>
        {tickets === null ? (
          <p className="discret">Chargement…</p>
        ) : tickets.length === 0 ? (
          <p className="vide">Aucun ticket envoyé pour l’instant.</p>
        ) : (
          <ul className="liste-simple">
            {tickets.map((t) => (
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
        )}
      </section>

      <Installer />

      <section className="bloc">
        <h2>Confidentialité</h2>
        <ul className="conseils">
          <li>La photo du ticket est lue dans votre téléphone et n’est jamais envoyée ni conservée.</li>
          <li>Seuls le magasin, la date, l’heure, les totaux et les lignes d’articles sont enregistrés. Le numéro Cumulus et les données de paiement ne sont jamais lus.</li>
          <li>Les données sont hébergées en Suisse (Supabase, région Zurich). Les statistiques publiques ne montrent aucun contributeur.</li>
        </ul>
        <p className="discret">{MENTION_NON_AFFILIATION}</p>
      </section>

      <button type="button" className="bouton-secondaire" onClick={() => void deconnecter()}>
        Se déconnecter
      </button>
    </div>
  );
}

/** Explique comment installer l'app sur l'écran d'accueil. */
function Installer() {
  const installee = window.matchMedia('(display-mode: standalone)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (installee) return null;

  return (
    <section className="bloc">
      <h2>Installer l’app</h2>
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
      <p className="discret">Installée, l’app s’ouvre en plein écran et reste utilisable pour consulter les prix sans connexion.</p>
    </section>
  );
}
