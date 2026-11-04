// Arrivée depuis l'ancienne adresse : « #/demenagement/<export> » (voir lib/demenagement.ts).
// Importé en premier par main.tsx : les données reprises doivent être écrites avant que les
// magasins locaux (donnees/local.ts) ne lisent le stockage.

import { decoderDemenagement, ErreurDemenagement, planDemenagement } from './lib/demenagement.ts';

const PREFIXE = 'panier-temoin:';
const CLE_MESSAGE = 'panier-temoin:courses-message'; // affiché par l'écran Courses

function accueillirDemenagement(): void {
  const trouve = window.location.hash.match(/^#\/demenagement\/([A-Za-z0-9_-]+)$/);
  if (!trouve) return;
  let resultat: { ok: boolean; message: string; durable: true };
  try {
    const plan = planDemenagement(decoderDemenagement(trouve[1]), (cle) => window.localStorage.getItem(PREFIXE + cle));
    for (const [cle, valeur] of plan.ecrire) window.localStorage.setItem(PREFIXE + cle, valeur);
    const attente = plan.enAttente
      ? ` ${plan.enAttente} changement${plan.enAttente > 1 ? 's' : ''} de la liste ser${plan.enAttente > 1 ? 'ont' : 'a'} envoyé${plan.enAttente > 1 ? 's' : ''} après la connexion.`
      : '';
    resultat = {
      ok: true,
      durable: true,
      message:
        'Panier Témoin a changé d’adresse et vos réglages ont été repris. Connectez-vous dans Réglages pour retrouver ' +
        `la liste partagée et la carte, puis installez l’app depuis cette adresse.${attente}`,
    };
  } catch (e) {
    resultat = {
      ok: false,
      durable: true,
      message: e instanceof ErreurDemenagement ? e.message : 'Les données de l’ancienne adresse n’ont pas pu être reprises.',
    };
  }
  try {
    window.sessionStorage.setItem(CLE_MESSAGE, JSON.stringify(resultat));
  } catch {
    // Le message sera simplement absent.
  }
  // Le lien ne resservira pas : il disparaît de l'historique.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/courses`);
}

accueillirDemenagement();
