import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { FournisseurSession } from './session.tsx';
import { accueillirLienImport } from './lecture/claude.ts';
import './styles.css';

// Lien « Ouvrir dans Panier Témoin » envoyé par Claude : à l'ouverture
// de l'app, ou quand l'app déjà ouverte reçoit le lien.
accueillirLienImport();
window.addEventListener('hashchange', accueillirLienImport);

// Demande au navigateur de ne pas effacer les données locales (brouillon).
// Sur iPhone, la réponse dépend de l'usage de l'app.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => undefined);
}

createRoot(document.getElementById('racine') as HTMLElement).render(
  <StrictMode>
    <FournisseurSession>
      <App />
    </FournisseurSession>
  </StrictMode>,
);
