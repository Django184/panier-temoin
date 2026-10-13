// Cadre de l'app : écran courant et barre d'onglets.

import type { ReactNode } from 'react';
import { useChemin, lien } from './routeur.ts';
import { useSession } from './session.tsx';
import { Accueil } from './ecrans/Accueil.tsx';
import { Ajouter } from './ecrans/Ajouter.tsx';
import { Connexion } from './ecrans/Connexion.tsx';
import { Explorer } from './ecrans/Explorer.tsx';
import { FicheProduit } from './ecrans/FicheProduit.tsx';
import { DetailPanier, Paniers } from './ecrans/Paniers.tsx';
import { Profil } from './ecrans/Profil.tsx';
import { BandeauMiseAJour } from './composants/BandeauMiseAJour.tsx';

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
      return <Accueil />;
    case 'explorer':
      return <Explorer />;
    case 'produit':
      return id ? <FicheProduit key={id} id={id} /> : <Explorer />;
    case 'ajouter':
      return (
        <Reserve raison="Connectez-vous pour ajouter un ticket.">
          <Ajouter />
        </Reserve>
      );
    case 'paniers':
      return (
        <Reserve raison="Connectez-vous pour composer des paniers types.">
          {id ? <DetailPanier key={id} id={id} /> : <Paniers />}
        </Reserve>
      );
    case 'profil':
      return (
        <Reserve raison="Connectez-vous pour voir vos tickets.">
          <Profil />
        </Reserve>
      );
    case 'import':
      // Lien envoyé par Claude : l'app passe aussitôt à « Ajouter ».
      return <div className="ecran"><p className="discret">Ouverture du ticket…</p></div>;
    case 'connexion':
      return session ? <Accueil /> : <Connexion />;
    default:
      return <div className="ecran"><p className="vide">Cette page n’existe pas.</p></div>;
  }
}

const ONGLETS: Array<{ cle: string; titre: string; icone: ReactNode }> = [
  {
    cle: '',
    titre: 'Accueil',
    icone: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  },
  {
    cle: 'explorer',
    titre: 'Explorer',
    icone: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </>
    ),
  },
  {
    cle: 'ajouter',
    titre: 'Ajouter',
    icone: (
      <>
        <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
        <path d="M12 8v6M9 11h6" />
      </>
    ),
  },
  {
    cle: 'paniers',
    titre: 'Paniers',
    icone: (
      <>
        <path d="M3 9h18l-2 11H5z" />
        <path d="m8 9 4-5 4 5" />
      </>
    ),
  },
  {
    cle: 'profil',
    titre: 'Profil',
    icone: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
      </>
    ),
  },
];

export function App() {
  const chemin = useChemin();
  const actif = chemin[0] === 'produit' ? 'explorer' : (chemin[0] ?? '');

  return (
    <>
      <BandeauMiseAJour />
      <main className="contenu">
        <Ecran chemin={chemin} />
      </main>
      <nav className="onglets" aria-label="Navigation principale">
        {ONGLETS.map((o) => (
          <a
            key={o.cle}
            href={o.cle ? lien(o.cle) : '#/'}
            className={`onglet ${o.cle === 'ajouter' ? 'onglet-ajouter' : ''} ${actif === o.cle ? 'actif' : ''}`}
            aria-current={actif === o.cle ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="onglet-icone">
              {o.icone}
            </svg>
            <span>{o.titre}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
