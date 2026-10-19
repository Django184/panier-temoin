// Cadre de l'app : écran courant et barre d'onglets. L'onglet Recette
// n'apparaît que lorsqu'une recette a des articles dans la liste.

import { useEffect, useState, type ReactNode } from 'react';
import { useChemin, lien } from './routeur.ts';
import { useSession } from './session.tsx';
import { Ajouter } from './ecrans/Ajouter.tsx';
import { Connexion } from './ecrans/Connexion.tsx';
import { Explorer } from './ecrans/Explorer.tsx';
import { FicheProduit } from './ecrans/FicheProduit.tsx';
import { DetailPanier, Paniers } from './ecrans/Paniers.tsx';
import { Reglages } from './ecrans/Reglages.tsx';
import { Courses } from './ecrans/Courses.tsx';
import { Recette } from './ecrans/Recette.tsx';
import { CarteCumulus } from './ecrans/CarteCumulus.tsx';
import { BandeauMiseAJour } from './composants/BandeauMiseAJour.tsx';
import { IconeCarte, IconePanier, IconeReglages, IconeTendance, IconeTicket, IconeToque } from './composants/Icones.tsx';
import { preferences, useRecettesDeLaListe } from './donnees/local.ts';
import { lignesAVerifier } from './api.ts';
import { arreterSynchro, demarrerSynchro } from './donnees/synchro.ts';

function Reserve({ raison, children }: { raison: string; children: ReactNode }) {
  const { session, chargement } = useSession();
  if (chargement) return <div className="ecran"><p className="discret">Chargement…</p></div>;
  return session ? <>{children}</> : <Connexion raison={raison} />;
}

function Ecran({ chemin }: { chemin: string[] }) {
  const [racine, id] = chemin;
  const { session } = useSession();
  switch (racine) {
    case undefined:
    case '':
    case 'courses':
      return <Courses />;
    case 'recette':
      return <Recette />;
    case 'carte':
    case 'cumulus':
      return (
        <Reserve raison="Connectez-vous pour afficher la carte Cumulus du foyer.">
          <CarteCumulus />
        </Reserve>
      );
    case 'ajouter':
      return (
        <Reserve raison="Connectez-vous pour ajouter un ticket.">
          <Ajouter />
        </Reserve>
      );
    case 'explorer':
      return <Explorer />;
    case 'produit':
      return id ? <FicheProduit key={id} id={id} /> : <Explorer />;
    case 'paniers':
      return (
        <Reserve raison="Connectez-vous pour composer des paniers types.">
          {id ? <DetailPanier key={id} id={id} /> : <Paniers />}
        </Reserve>
      );
    case 'reglages':
    case 'profil':
      return <Reglages />;
    case 'import':
      // Lien envoyé par Claude : l'app passe aussitôt à « Ajouter ».
      return <div className="ecran"><p className="discret">Ouverture du ticket…</p></div>;
    case 'connexion':
      return session ? <Courses /> : <Connexion />;
    default:
      return <div className="ecran"><p className="vide">Cette page n’existe pas.</p></div>;
  }
}

/** Onglet actif pour chaque écran. */
const PARENT: Record<string, string> = {
  '': 'courses',
  produit: 'explorer',
  paniers: 'explorer',
  cumulus: 'carte',
  profil: 'reglages',
  connexion: 'reglages',
};

export function App() {
  const chemin = useChemin();
  const { session } = useSession();
  const avecRecette = useRecettesDeLaListe().length > 0;
  const [aVerifier, setAVerifier] = useState(0);
  const racine = chemin[0] ?? '';
  const actif = PARENT[racine] ?? racine;

  // Deux interfaces : avec aides (explications, noms des onglets) ou
  // épurée. Les éléments marqués « explication » disparaissent sans aide.
  const { aides } = preferences.utiliser();
  useEffect(() => {
    document.documentElement.dataset.aides = aides ? 'oui' : 'non';
  }, [aides]);

  // Liste de courses et recettes partagées par les comptes du foyer.
  const compteId = session?.user.id ?? null;
  useEffect(() => {
    if (compteId) demarrerSynchro(compteId);
    else arreterSynchro();
  }, [compteId]);

  // Pastille sur Réglages quand des prix attendent une confirmation.
  useEffect(() => {
    if (!session) {
      setAVerifier(0);
      return;
    }
    lignesAVerifier()
      .then((l) => setAVerifier(l.length))
      .catch(() => undefined);
  }, [session, racine]);

  const onglets: Array<{ cle: string; titre: string; icone: ReactNode; pastille?: boolean }> = [
    { cle: 'courses', titre: 'Courses', icone: <IconePanier className="onglet-icone" /> },
    ...(avecRecette ? [{ cle: 'recette', titre: 'Recette', icone: <IconeToque className="onglet-icone" /> }] : []),
    { cle: 'carte', titre: 'Carte', icone: <IconeCarte className="onglet-icone" /> },
    { cle: 'ajouter', titre: 'Ticket', icone: <IconeTicket className="onglet-icone onglet-icone-stylo" /> },
    { cle: 'explorer', titre: 'Prix', icone: <IconeTendance className="onglet-icone" /> },
    { cle: 'reglages', titre: 'Réglages', icone: <IconeReglages className="onglet-icone" />, pastille: aVerifier > 0 },
  ];

  return (
    <>
      <BandeauMiseAJour />
      <main className="contenu">
        <Ecran chemin={chemin} />
      </main>
      <nav className="onglets" aria-label="Navigation principale" style={{ gridTemplateColumns: `repeat(${onglets.length}, 1fr)` }}>
        {onglets.map((o) => (
          <a
            key={o.cle}
            href={lien(o.cle)}
            className={`onglet ${actif === o.cle ? 'actif' : ''}`}
            aria-current={actif === o.cle ? 'page' : undefined}
            aria-label={o.titre}
          >
            <span className="onglet-icone-cadre">
              {o.icone}
              {o.pastille ? <span className="pastille-onglet" aria-label="Prix à confirmer" /> : null}
            </span>
            <span className="onglet-libelle">{o.titre}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
