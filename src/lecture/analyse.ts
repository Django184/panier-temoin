// Lecture automatique d'une photo de ticket : la photo est réduite dans
// le téléphone, envoyée à la fonction Edge « lire-ticket » (modèle
// d'image Mistral), et la réponse devient un brouillon à vérifier.

import { supabase } from '../supabase.ts';
import { lireReponseJSON } from '../lib/importClaude.ts';
import type { TicketBrouillon } from '../lib/types.ts';

/** Côté le plus long de la photo envoyée : assez pour lire les petits caractères. */
const COTE_MAX = 2000;
const QUALITE_JPEG = 0.85;

function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resoudre(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error('Cette image ne peut pas être ouverte. Essayez une autre photo.'));
    };
    image.src = url;
  });
}

/**
 * Photo redressée (le navigateur applique l'orientation de l'appareil
 * photo), réduite et compressée en JPEG. Renvoie le base64 sans préfixe.
 */
export async function preparerPhoto(fichier: Blob): Promise<{ base64: string; apercu: string }> {
  const image = await chargerImage(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.naturalWidth, image.naturalHeight));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.naturalWidth * echelle);
  toile.height = Math.round(image.naturalHeight * echelle);
  const ctx = toile.getContext('2d');
  if (!ctx) throw new Error('Votre navigateur ne permet pas de préparer la photo.');
  ctx.drawImage(image, 0, 0, toile.width, toile.height);
  const apercu = toile.toDataURL('image/jpeg', QUALITE_JPEG);
  return { base64: apercu.slice(apercu.indexOf(',') + 1), apercu };
}

interface ErreurFonction {
  context?: Response;
  message?: string;
}

/** Message d'erreur renvoyé par la fonction Edge, s'il y en a un. */
async function messageErreur(erreur: unknown): Promise<string> {
  const e = erreur as ErreurFonction;
  if (e.context && typeof e.context.json === 'function') {
    try {
      const corps = (await e.context.json()) as { message?: string };
      if (corps.message) return corps.message;
    } catch {
      // Corps illisible : message générique ci-dessous.
    }
  }
  if (/fetch|network|failed to send/i.test(e.message ?? '')) {
    return 'Pas de connexion au serveur. Réessayez une fois en ligne.';
  }
  return 'La lecture automatique a échoué. Réessayez, ou saisissez le ticket autrement.';
}

/** Envoie la photo préparée et renvoie le brouillon lu. */
export async function lirePhotoParIA(base64: string): Promise<TicketBrouillon> {
  const { data, error } = await supabase.functions.invoke('lire-ticket', {
    body: { image: base64, type: 'image/jpeg' },
  });
  if (error) throw new Error(await messageErreur(error));
  const texte = (data as { texte?: unknown } | null)?.texte;
  if (typeof texte !== 'string' || texte.trim() === '') {
    throw new Error('Le service n’a rien pu lire sur cette photo.');
  }
  return lireReponseJSON(texte, 'lecture_ia');
}
