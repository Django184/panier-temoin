import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { FournisseurSession } from './session.tsx';
import './styles.css';

// Demande au navigateur de ne pas effacer les données locales (brouillon,
// moteur de lecture). Sur iPhone, la réponse dépend de l'usage de l'app.
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
